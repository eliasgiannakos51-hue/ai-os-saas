import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { readFlow } from "@/lib/automations/boxes";
import { nextRunFor } from "@/lib/automations/flow-access";
import { accountFor, startRun } from "@/lib/automations/start-run";
import { runQueued, type QueuedRun } from "@/lib/automations/event-runs";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

/**
 * AUTOMATIONS RUN BY THEMSELVES (MASTER 16, package 30). Every 15 minutes
 * (vercel.json), beside the Assistants' own tick (api/cron/agent-runs),
 * with the same guard (lib/cron-auth.ts, fail-closed without CRON_SECRET).
 *
 *   1. A run that waited for approval past its deadline is cancelled:
 *      nothing after the approval box runs, nothing more is charged.
 *   2. A run left "running" by a request that died is closed as failed,
 *      so the history never shows one running forever.
 *   3. Every automation that is on and due runs, in its own time zone —
 *      its next run is moved forward BEFORE it runs, so a run that fails
 *      or times out is not run again on every tick.
 *   4. Runs a file queued that no screen took (lib/automations/file-event.ts).
 *
 * Bounded per tick and per person, as the Assistants are. Each AI box is
 * held and settled inside the runner, so a person without credits gets a
 * failed step that says so, not a debt.
 */
const MAX_FLOWS_PER_TICK = 40;
const MAX_FLOWS_PER_USER_PER_TICK = 5;
const MAX_EVENT_RUNS_PER_TICK = 20;
/** A run "running" for longer than this belonged to a request that died. */
const STALE_RUNNING_MINUTES = 20;
/** A claim older than this belonged to a request that died. */
const STALE_CLAIM_MINUTES = 10;

type DueFlow = { id: string; user_id: string; name: string; boxes: unknown; cost_limit: number; time_zone: string };

export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 500 });

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const report = { expired: 0, interrupted: 0, ran: 0, skipped: 0, events: 0, rescheduleFailures: 0 };

  try {
    // 1. Approvals nobody gave in time.
    const { data: expired, error: expireError } = await admin
      .from("automation_runs")
      .update({ status: "cancelled", state: null, error: "approval_expired", finished_at: nowIso })
      .eq("status", "waiting_approval")
      .lt("approval_expires_at", nowIso)
      .select("id");
    if (expireError) logApiError("/api/cron/automation-flows", expireError, { stage: "expire" });
    report.expired = expired?.length ?? 0;

    // 2. Runs a dead request left "running".
    const staleRunning = new Date(now.getTime() - STALE_RUNNING_MINUTES * 60_000).toISOString();
    const { data: interrupted, error: interruptError } = await admin
      .from("automation_runs")
      .update({ status: "failed", error: "interrupted", finished_at: nowIso })
      .eq("status", "running")
      .lt("started_at", staleRunning)
      .select("id");
    if (interruptError) logApiError("/api/cron/automation-flows", interruptError, { stage: "interrupted" });
    report.interrupted = interrupted?.length ?? 0;

    // 3. What is due.
    const { data: due, error: dueError } = await admin
      .from("automation_flows")
      .select("id, user_id, name, boxes, cost_limit, time_zone")
      .eq("is_active", true)
      .not("next_run_at", "is", null)
      .lte("next_run_at", nowIso)
      .order("next_run_at", { ascending: true })
      .limit(MAX_FLOWS_PER_TICK);
    if (dueError) {
      logApiError("/api/cron/automation-flows", dueError, { stage: "due" });
      return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
    }
    const perUser = new Map<string, DueFlow[]>();
    for (const flow of (due ?? []) as DueFlow[]) {
      const list = perUser.get(flow.user_id) ?? [];
      if (list.length >= MAX_FLOWS_PER_USER_PER_TICK) continue;
      list.push(flow);
      perUser.set(flow.user_id, list);
    }

    const users = new Map<string, User | null>();
    async function userFor(id: string): Promise<User | null> {
      if (users.has(id)) return users.get(id) ?? null;
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error) logApiError("/api/cron/automation-flows", error, { stage: "user" });
      users.set(id, data?.user ?? null);
      return data?.user ?? null;
    }

    for (const [userId, flows] of perUser) {
      const user = await userFor(userId);
      for (const flow of flows) {
        const verdict = readFlow(flow.boxes);
        // Forward first, and only if the claim is ours: the next tick must not run it again.
        const staleClaim = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString();
        const next = verdict.ok ? nextRunFor(verdict.boxes, flow.time_zone, now) : null;
        const { data: claimed, error: claimError } = await admin
          .from("automation_flows")
          .update({ busy_since: new Date().toISOString(), next_run_at: next })
          .eq("id", flow.id)
          .eq("user_id", userId)
          .lte("next_run_at", nowIso)
          .or(`busy_since.is.null,busy_since.lt.${staleClaim}`)
          .select("id");
        if (claimError) {
          logApiError("/api/cron/automation-flows", claimError, { stage: "claim", flowId: flow.id });
          report.rescheduleFailures++;
          continue;
        }
        if (!claimed || claimed.length !== 1) {
          report.skipped++;
          continue;
        }
        try {
          // The person's switch was closed, or the person is gone: moved forward, not run.
          if (!verdict.ok || !user || !(await isFeatureOn("automations", user))) {
            report.skipped++;
            continue;
          }
          const account = await accountFor(user);
          if ("refused" in account) {
            report.skipped++;
            continue;
          }
          const started = await startRun({
            apiKey,
            flow: { ...flow, boxes: verdict.boxes },
            user,
            account,
            startedBy: "time",
          });
          if (started) report.ran++;
          else report.skipped++;
        } finally {
          const { error: releaseError } = await admin.from("automation_flows").update({ busy_since: null }).eq("id", flow.id).eq("user_id", userId);
          if (releaseError) logApiError("/api/cron/automation-flows", releaseError, { stage: "release", flowId: flow.id });
        }
      }
    }

    // 4. Files that started automations nobody's screen ran.
    const { data: queued, error: queuedError } = await admin
      .from("automation_runs")
      .select("id, flow_id, user_id, event_ref")
      .eq("status", "queued")
      .order("started_at", { ascending: true })
      .limit(MAX_EVENT_RUNS_PER_TICK);
    if (queuedError) logApiError("/api/cron/automation-flows", queuedError, { stage: "queued" });
    for (const run of (queued ?? []) as QueuedRun[]) {
      const user = await userFor(run.user_id);
      if (!user) continue;
      if (await runQueued(apiKey, run, user)) report.events++;
    }

    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    logApiError("/api/cron/automation-flows", err);
    return NextResponse.json({ ok: false, error: "failed", ...report }, { status: 500 });
  }
}
