import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import type { Plan } from "@/lib/billing/plans";
import { finishRun, runFlow, type FlowRow, type RunContext, type RunResult } from "@/lib/automations/runner";

/**
 * STARTING A RUN, FROM WHEREVER IT IS STARTED (MASTER 16, package 30):
 * «Δοκιμή» and «Εκτέλεση τώρα» (api/automations/flows/[id]/run), the
 * 15-minute cron (api/cron/automation-flows), a file that finished
 * reading (lib/automations/file-event.ts), and «Έγκριση»
 * (api/automations/runs/[runId]/approve). One row per run, written
 * before the first box so a run that dies half-way is still in the
 * history, and closed by finishRun with every step.
 */
export type StartedBy = "time" | "event" | "manual" | "dry";

export type Account = { plan: Plan | null; bypass: boolean; isAdmin: boolean; isBeta: boolean };

/** The plan a run is charged on, and whether it is charged at all — as every route works it out. */
export async function accountFor(user: User): Promise<Account | { refused: "bypass_ceiling" }> {
  const plan = await resolveEffectivePlan(user);
  const isAdmin = isAdminEmail(user.email);
  const isBeta = await hasActiveBetaBypass(user);
  const bypass = isAdmin || isBeta;
  if (bypass) {
    const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
    if (!ceiling.allowed) return { refused: "bypass_ceiling" };
  }
  return { plan, bypass, isAdmin, isBeta };
}

/** The newest file the person has that finished reading: what «Δοκιμή» uses for an automation a file starts. */
export async function latestReadyFile(userId: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("user_files")
    .select("id")
    .eq("user_id", userId)
    .eq("processing_status", "ready")
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logApiError("automations:start", error, { stage: "latest_file" });
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

export async function startRun(params: {
  apiKey: string;
  flow: FlowRow;
  user: User;
  account: Account;
  startedBy: StartedBy;
  eventRef?: string | null;
  signal?: AbortSignal;
}): Promise<{ runId: string; result: RunResult } | null> {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("automation_runs")
    .insert({
      flow_id: params.flow.id,
      user_id: params.user.id,
      started_by: params.startedBy,
      status: "running",
      event_ref: params.eventRef ?? null,
    })
    .select("id")
    .single();
  if (error || !row) {
    logApiError("automations:start", error ?? new Error("no row"), { flowId: params.flow.id });
    return null;
  }
  const runId = row.id as string;
  const result = await go({
    apiKey: params.apiKey,
    flow: params.flow,
    runId,
    user: { id: params.user.id, email: params.user.email ?? null },
    plan: params.account.plan,
    bypass: params.account.bypass,
    isAdmin: params.account.isAdmin,
    isBeta: params.account.isBeta,
    dry: params.startedBy === "dry",
    eventRef: params.eventRef ?? null,
    resume: null,
  });
  // A dry run is not the automation running: its last run stays the last real one.
  if (params.startedBy !== "dry") {
    const { error: lastError } = await admin
      .from("automation_flows")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", params.flow.id)
      .eq("user_id", params.user.id);
    if (lastError) logApiError("automations:start", lastError, { stage: "last_run" });
  }
  return { runId, result };
}

/** Runs and closes the row, whatever happens inside: a thrown error is a failed run, not a run left "running". */
export async function go(ctx: RunContext): Promise<RunResult> {
  let result: RunResult;
  try {
    result = await runFlow(ctx);
  } catch (err) {
    logApiError("automations:run", err, { flowId: ctx.flow.id, runId: ctx.runId });
    result = { status: "failed", steps: ctx.resume?.steps ?? [], credits: ctx.resume?.credits ?? 0, error: "crashed" };
  }
  await finishRun(ctx.runId, ctx.user.id, result);
  return result;
}
