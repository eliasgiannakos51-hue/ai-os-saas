import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkAiCallAllowed, fingerprintRequest } from "@/lib/ai-circuit-breaker";
import { hasEnoughCredits } from "@/lib/billing/credits";
import { aiBoxCount, readFlow, type StartBox } from "@/lib/automations/boxes";
import { flowPrices } from "@/lib/automations/flow-pricing";
import { latestReadyFile, startRun } from "@/lib/automations/start-run";
import {
  FLOW_COLUMNS,
  RUN_COLUMNS,
  UUID,
  claimFlow,
  flowGate,
  missingConnections,
  refuse,
  releaseFlow,
  type FlowRecord,
} from "@/lib/automations/flow-access";

export const dynamic = "force-dynamic";
// At most eight boxes; each AI box is one call of at most 1,500 tokens,
// tried twice; a read is one request to a calendar or a table.
export const maxDuration = 300; // @function-limit 300

/**
 * «ΔΟΚΙΜΗ» AND «ΕΚΤΕΛΕΣΗ ΤΩΡΑ» (MASTER 16, package 30).
 *
 * {dry: true} is the try: every box runs except that the actions write
 * "would send this to you" instead of sending, and an approval box is
 * passed through. Its AI boxes are real calls and are charged — the price
 * under the button says so, «έως N credits». An automation a file starts
 * is tried on the newest file that finished reading.
 *
 * {dry: false} runs it for real, now, as the schedule would: what it
 * needs must be connected first.
 *
 * Each AI box is held and settled inside the runner (lib/automations/
 * runner.ts), against the automation's own limit. This route checks,
 * before the first box, that the account has at least one box's worth.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
  let dry: boolean;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    dry = body.dry !== false;
  } catch {
    return refuse("invalid_body", 400);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return refuse("not_configured", 503);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  const gate = await flowGate(user);
  if (gate instanceof NextResponse) return gate;

  const { data: found, error: loadError } = await supabase
    .from("automation_flows")
    .select(FLOW_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (loadError) {
    logApiError("/api/automations/flows/[id]/run", loadError, { stage: "load" });
    return refuse("load_failed", 500);
  }
  if (!found) return refuse("not_found", 404);
  const flow = found as FlowRecord;
  const verdict = readFlow(flow.boxes);
  if (!verdict.ok) return refuse("bad_boxes", 409, { reason: verdict.reason });
  if (!dry) {
    const missing = await missingConnections(user, verdict.boxes);
    if (missing.length > 0) return refuse("needs_connection", 409, { missing });
  }

  const breaker = await checkAiCallAllowed(user.id, dry ? "automation_try" : "automation_run_now", fingerprintRequest(id, String(flow.version)));
  if (!breaker.allowed) return refuse("rate_limited", 429);
  // A run started by hand, bounded per person: each one may hold and spend.
  const limited = await checkRateLimit({ scope: "automation_run", identifier: user.id, maxAttempts: 30, windowMinutes: 60 });
  if (!limited.allowed) return refuse("rate_limited", 429);
  // Accounts that are not charged: their own ceiling in euros.
  const isBeta = await hasActiveBetaBypass(user);
  const bypass = gate.isAdmin || isBeta;
  if (bypass) {
    const ceiling = await checkBypassCeiling(user.id, gate.isAdmin, isBeta);
    if (!ceiling.allowed) return refuse("bypass_ceiling", 429);
  }
  const account = { plan: gate.plan, bypass, isAdmin: gate.isAdmin, isBeta };
  const step = flowPrices(gate.plan, gate.packPriceEur).step;
  if (!account.bypass && gate.plan && aiBoxCount(verdict.boxes) > 0) {
    const enough = await hasEnoughCredits(user.id, step, gate.plan);
    if (!enough.ok) return refuse("insufficient_credits", 402, { remaining: enough.remaining, needed: step });
  }

  let eventRef: string | null = null;
  if ((verdict.boxes[0] as StartBox).when === "file_uploaded") {
    eventRef = await latestReadyFile(user.id);
    if (!eventRef) return refuse("no_file", 409);
  }

  if (!(await claimFlow(id, user.id))) return refuse("busy", 409);
  try {
    const started = await startRun({
      apiKey,
      flow: { id: flow.id, user_id: user.id, name: flow.name, boxes: verdict.boxes, cost_limit: flow.cost_limit, time_zone: flow.time_zone },
      user,
      account,
      startedBy: dry ? "dry" : "manual",
      eventRef,
    });
    if (!started) return refuse("run_failed", 500);
    const { data: run } = await supabase.from("automation_runs").select(RUN_COLUMNS).eq("id", started.runId).eq("user_id", user.id).maybeSingle();
    return NextResponse.json({ ok: true, run, status: started.result.status });
  } finally {
    await releaseFlow(id, user.id);
  }
}
