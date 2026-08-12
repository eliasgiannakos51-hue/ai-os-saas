import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { reapJob } from "@/lib/jobs/run-job";
import { isJobStale, jobPercent } from "@/lib/jobs/job-types";

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
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    // select("*"), never a column list. A column list fails the WHOLE
    // query when one column does not exist yet, so an un-migrated
    // deployment would 500 on every poll rather than degrade.
    const { data, error } = await supabase.from("ai_jobs").select("*").eq("id", params.id).maybeSingle();

    if (error) {
      logApiError("/api/jobs/[id]", error, { jobId: params.id });
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }
    // 404 rather than 403: a 403 would confirm that a job with this id
    // exists and belongs to somebody else.
    if (!data) return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });

    let job = data as Record<string, unknown>;

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
      },
    });
  } catch (err) {
    logApiError("/api/jobs/[id]", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
