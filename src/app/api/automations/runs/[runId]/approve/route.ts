import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkAiCallAllowed, fingerprintRequest } from "@/lib/ai-circuit-breaker";
import { readFlow } from "@/lib/automations/boxes";
import { resumeFrom } from "@/lib/automations/runner";
import { go } from "@/lib/automations/start-run";
import { FLOW_COLUMNS, RUN_COLUMNS, UUID, flowGate, refuse, type FlowRecord } from "@/lib/automations/flow-access";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

/**
 * «ΕΓΚΡΙΣΗ» (MASTER 16, package 30): a run that stopped at an approval box
 * goes on from the box after it, with what it had made — the report the
 * person has just read on the screen is the report that is sent.
 *
 * THE RUN IS TAKEN ONCE. The row moves from waiting_approval to running
 * in one conditional update, so two presses, or a press and the expiry in
 * the cron, cannot both send it. An approval that came after its
 * deadline is refused: the run was cancelled, charging nothing more.
 *
 * It goes on with the boxes the run started with, as they are NOW: a
 * change made while it waited is a change the person made and saw.
 */
export async function POST(_request: Request, props: { params: Promise<{ runId: string }> }) {
  const params = await props.params;
  const runId = params.runId;
  if (!UUID.test(runId)) return refuse("not_found", 404);
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return refuse("not_configured", 503);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return refuse("not_signed_in", 401);
    const gate = await flowGate(user);
    if (gate instanceof NextResponse) return gate;

    const { data: run, error: runError } = await supabase
      .from("automation_runs")
      .select("id, flow_id, status, steps, state, event_ref, approval_expires_at")
      .eq("id", runId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (runError) {
      logApiError("/api/automations/runs/[runId]/approve", runError, { stage: "load" });
      return refuse("load_failed", 500);
    }
    if (!run) return refuse("not_found", 404);
    if (run.status !== "waiting_approval") return refuse("not_waiting", 409, { status: run.status });
    if (run.approval_expires_at && new Date(run.approval_expires_at as string).getTime() < Date.now()) return refuse("expired", 409);
    const resume = resumeFrom(run.state, run.steps);
    if (!resume) return refuse("not_waiting", 409);

    const { data: found } = await supabase
      .from("automation_flows")
      .select(FLOW_COLUMNS)
      .eq("id", run.flow_id as string)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!found) return refuse("not_found", 404);
    const flow = found as FlowRecord;
    const verdict = readFlow(flow.boxes);
    if (!verdict.ok) return refuse("bad_boxes", 409, { reason: verdict.reason });
    if (resume.at > verdict.boxes.length) return refuse("bad_boxes", 409, { reason: "changed" });

    const limited = await checkRateLimit({ scope: "automation_approve", identifier: user.id, maxAttempts: 30, windowMinutes: 60 });
    if (!limited.allowed) return refuse("rate_limited", 429);
    const breaker = await checkAiCallAllowed(user.id, "automation_approve", fingerprintRequest(runId));
    if (!breaker.allowed) return refuse("rate_limited", 429);
    // Accounts that are not charged: their own ceiling in euros.
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = gate.isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, gate.isAdmin, isBeta);
      if (!ceiling.allowed) return refuse("bypass_ceiling", 429);
    }
    const account = { plan: gate.plan, bypass, isAdmin: gate.isAdmin, isBeta };

    const admin = createAdminClient();
    const { data: taken, error: takeError } = await admin
      .from("automation_runs")
      .update({ status: "running", approval_expires_at: null })
      .eq("id", runId)
      .eq("user_id", user.id)
      .eq("status", "waiting_approval")
      .select("id");
    if (takeError) {
      logApiError("/api/automations/runs/[runId]/approve", takeError, { stage: "take" });
      return refuse("load_failed", 500);
    }
    if (!taken || taken.length !== 1) return refuse("not_waiting", 409);

    const result = await go({
      apiKey,
      flow: { id: flow.id, user_id: user.id, name: flow.name, boxes: verdict.boxes, cost_limit: flow.cost_limit, time_zone: flow.time_zone },
      runId,
      user: { id: user.id, email: user.email ?? null },
      plan: account.plan,
      bypass: account.bypass,
      isAdmin: account.isAdmin,
      isBeta: account.isBeta,
      dry: false,
      eventRef: (run.event_ref as string | null) ?? null,
      resume,
    });
    const { data: after } = await supabase.from("automation_runs").select(RUN_COLUMNS).eq("id", runId).eq("user_id", user.id).maybeSingle();
    return NextResponse.json({ ok: true, run: after, status: result.status });
  } catch (err) {
    logApiError("/api/automations/runs/[runId]/approve", err);
    return refuse("approve_failed", 500);
  }
}
