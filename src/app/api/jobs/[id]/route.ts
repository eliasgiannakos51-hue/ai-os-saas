import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { JOB_CLIENT_COLUMNS } from "@/lib/billing/client-columns";
import { logApiError } from "@/lib/log-error";
import { reapJob } from "@/lib/jobs/run-job";
import { isJobStale, jobPercent } from "@/lib/jobs/job-types";
import { restoreTimeline, timelineForClient } from "@/lib/jobs/job-timeline";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";

export const dynamic = "force-dynamic";

/**
 * The poll. One job, its progress, and its result once there is one.
 *
 * READ THROUGH THE USER'S OWN CLIENT, so RLS decides who sees what — a job
 * id in a URL can never reach someone else's work. The admin client is
 * used only for the reap, which is a write the user is not allowed to make
 * and which happens on their behalf.
 *
 * THE REAPER LIVES HERE, not in a cron, for the same reason it does on
 * api/research/[id]: the poll is the only thing guaranteed to run for a
 * job someone is actually waiting on. A worker killed by the platform
 * writes nothing — no status, no settlement — so without this the row sits
 * at "running" forever and the credit hold with it. The person refreshing
 * the page is exactly the person who should not have to wait for a nightly
 * sweep to be told the truth.
 */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    // THE ACCOUNT'S COLUMNS, then the server's. The account may read only
    // JOB_CLIENT_COLUMNS (20261013000000_cost_columns_server_only.sql);
    // this read through its own client is also the ownership check. Every
    // name on the list has existed since 20261004200000 or earlier.
    const { data, error } = await supabase.from("ai_jobs").select(JOB_CLIENT_COLUMNS).eq("id", params.id).maybeSingle();

    if (error) {
      logApiError("/api/jobs/[id]", error, { jobId: params.id });
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }
    // 404 rather than 403: a 403 would confirm that a job with this id
    // exists and belongs to somebody else.
    const notFound = () => NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    if (!data) return notFound();

    // The hold, the cost record and the step timeline: server-only
    // columns, read for the row the account just proved is its own.
    const { data: serverSide } = await createAdminClient()
      .from("ai_jobs")
      .select("reservation_id, usage_entries, running, timeline")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!serverSide) return notFound();
    let job = { ...(data as Record<string, unknown>), ...(serverSide as Record<string, unknown>) };

    if (isJobStale(String(job.status), job.updated_at as string | null, job.created_at as string | null)) {
      const reaped = await reapJob({
        id: String(job.id),
        user_id: String(job.user_id),
        status: String(job.status),
        reservation_id: (job.reservation_id as string | null) ?? null,
      });
      if (reaped) {
        job = {
          ...job,
          status: "failed",
          running: false,
          error: "stalled",
          credits_charged: 0,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      job: {
        id: job.id,
        kind: job.kind,
        status: job.status,
        step: job.step ?? 0,
        stepTotal: job.step_total ?? 1,
        stepLabel: job.step_label ?? null,
        percent: jobPercent(Number(job.step ?? 0), Number(job.step_total ?? 1), String(job.status)),
        result: job.result ?? null,
        error: job.error ?? null,
        creditsCharged: job.credits_charged ?? null,
        attempts: job.attempts ?? 0,
        createdAt: job.created_at,
        finishedAt: job.finished_at ?? null,
        // Steps, durations and — once charged — credits. The provider cost
        // stored with each entry stays here: timelineForClient returns no
        // USD figure, and the final cost below is used only to weigh the
        // last step.
        timeline: timelineForClient(restoreTimeline(job.timeline), {
          status: String(job.status),
          creditsCharged: typeof job.credits_charged === "number" ? job.credits_charged : null,
          finishedAt: (job.finished_at as string | null) ?? null,
          finalCostUsd: CostAccumulator.restore(
            Array.isArray(job.usage_entries) ? (job.usage_entries as never) : []
          ).totalUsdCost,
        }),
      },
    });
  } catch (err) {
    logApiError("/api/jobs/[id]", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
