import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkAiCallAllowed, fingerprintRequest } from "@/lib/ai-circuit-breaker";
import { runQueued, type QueuedRun } from "@/lib/automations/event-runs";
import { flowGate, refuse } from "@/lib/automations/flow-access";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

/** The most queued runs one call takes; the rest wait for the next call or the cron. */
const RUNS_PER_CALL = 3;

/**
 * «ΟΤΑΝ ΑΝΕΒΑΖΩ ΑΡΧΕΙΟ…», NOW (MASTER 16, package 30). The screen that
 * uploaded a file calls this when the upload's answer says automations
 * were queued for it (lib/automations/kick.ts). It runs the person's OWN
 * queued runs and nobody else's — each charged inside the runner, as the
 * cron would charge it.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  const gate = await flowGate(user);
  if (gate instanceof NextResponse) return gate;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return refuse("not_configured", 503);
  const limited = await checkRateLimit({ scope: "automation_events", identifier: user.id, maxAttempts: 30, windowMinutes: 60 });
  if (!limited.allowed) return refuse("rate_limited", 429);
  const breaker = await checkAiCallAllowed(user.id, "automation_events", fingerprintRequest(user.id, String(Math.floor(Date.now() / 60_000))));
  if (!breaker.allowed) return refuse("rate_limited", 429);
  // Accounts that are not charged: their own ceiling in euros.
  const isBeta = await hasActiveBetaBypass(user);
  const bypass = gate.isAdmin || isBeta;
  if (bypass) {
    const ceiling = await checkBypassCeiling(user.id, gate.isAdmin, isBeta);
    if (!ceiling.allowed) return refuse("bypass_ceiling", 429);
  }

  const { data, error } = await supabase
    .from("automation_runs")
    .select("id, flow_id, user_id, event_ref")
    .eq("user_id", user.id)
    .eq("status", "queued")
    .order("started_at", { ascending: true })
    .limit(RUNS_PER_CALL);
  if (error) {
    logApiError("/api/automations/events", error);
    return refuse("load_failed", 500);
  }
  let ran = 0;
  try {
    for (const run of (data ?? []) as QueuedRun[]) {
      if (run.user_id !== user.id) continue;
      if (await runQueued(apiKey, run, user)) ran++;
    }
  } catch (err) {
    // What ran is closed by its own row (lib/automations/start-run.ts go);
    // what did not is still queued, for the next call or the cron.
    logApiError("/api/automations/events", err, { ran });
    return refuse("run_failed", 500, { ran });
  }
  return NextResponse.json({ ok: true, ran });
}
