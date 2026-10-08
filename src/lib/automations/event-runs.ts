import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { readFlow } from "@/lib/automations/boxes";
import { accountFor, go } from "@/lib/automations/start-run";

/**
 * THE RUNS A FILE QUEUED, TAKEN AND RUN (MASTER 16, package 30).
 *
 * lib/automations/file-event.ts queues them; this takes each one ONCE —
 * queued → running in one conditional update, so the screen's call
 * (api/automations/events) and the cron (api/cron/automation-flows)
 * cannot both run it — and runs it with the file as what it reads.
 *
 * A run whose automation was switched off, or whose person's switch was
 * closed, since it was queued is cancelled instead: nothing is read or
 * charged.
 */
export type QueuedRun = { id: string; flow_id: string; user_id: string; event_ref: string | null };

async function cancel(runId: string, reason: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("automation_runs")
    .update({ status: "cancelled", error: reason, finished_at: new Date().toISOString() })
    .eq("id", runId)
    .in("status", ["queued", "running"]);
  if (error) logApiError("automations:events", error, { stage: "cancel", runId });
}

/** Runs one queued run for a person already loaded. True when it was taken here. */
export async function runQueued(apiKey: string, run: QueuedRun, user: User): Promise<boolean> {
  const admin = createAdminClient();
  const { data: taken, error: takeError } = await admin
    .from("automation_runs")
    .update({ status: "running" })
    .eq("id", run.id)
    .eq("user_id", run.user_id)
    .eq("status", "queued")
    .select("id");
  if (takeError || !taken || taken.length !== 1) return false;

  if (!(await isFeatureOn("automations", user))) {
    await cancel(run.id, "switched_off");
    return true;
  }
  const { data: flow, error: flowError } = await admin
    .from("automation_flows")
    .select("id, user_id, name, boxes, cost_limit, time_zone, is_active")
    .eq("id", run.flow_id)
    .eq("user_id", run.user_id)
    .maybeSingle();
  if (flowError || !flow || !flow.is_active) {
    await cancel(run.id, "flow_off");
    return true;
  }
  const verdict = readFlow(flow.boxes);
  if (!verdict.ok) {
    await cancel(run.id, `flow:${verdict.reason}`);
    return true;
  }
  const account = await accountFor(user);
  if ("refused" in account) {
    await cancel(run.id, account.refused);
    return true;
  }
  await go({
    apiKey,
    flow: { id: flow.id as string, user_id: run.user_id, name: flow.name as string, boxes: verdict.boxes, cost_limit: flow.cost_limit as number, time_zone: flow.time_zone as string },
    runId: run.id,
    user: { id: user.id, email: user.email ?? null },
    plan: account.plan,
    bypass: account.bypass,
    isAdmin: account.isAdmin,
    isBeta: account.isBeta,
    dry: false,
    eventRef: run.event_ref,
    resume: null,
  });
  const { error: lastError } = await admin.from("automation_flows").update({ last_run_at: new Date().toISOString() }).eq("id", run.flow_id).eq("user_id", run.user_id);
  if (lastError) logApiError("automations:events", lastError, { stage: "last_run" });
  return true;
}
