import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { internalHandoffToken, INTERNAL_HANDOFF_HEADER } from "@/lib/function-limits";
import { runJob, claimJob } from "@/lib/jobs/run-job";
import { isJobActive } from "@/lib/jobs/job-types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 800; // @function-limit 800

// @service-role-justified token-auth
//
// Runs a queued job. This is the invocation that outlives the request that
// created it.
//
// TWO CALLERS, TWO AUTHORISATIONS — the same split as
// api/research/[id]/continue, for the same reasons:
//
//   1. THE KICK. lib/jobs/start-job.ts fires this the moment a job row
//      exists. That request has no user session — it is our own
//      infrastructure calling itself — so it authenticates with the
//      internal token (CRON_SECRET). THIS is the path that makes the work
//      continue after the tab is closed, because nothing it depends on
//      lives in the browser's connection.
//
//   2. THE NUDGE. The polling client calls this when it sees a job that is
//      still queued and unlocked — the safety net for a kick that never
//      landed (no CRON_SECRET, a dropped outbound request, a cold start
//      that timed out). That request has a session and must own the job.
//
// claimJob is what stops the two racing into two concurrent billed runs:
// the first to flip `running` false -> true does the work, the other is
// told the job is already in hand and returns.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const jobId = params.id;
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "The AI service is not configured." }, { status: 503 });
    }

    const expected = internalHandoffToken();
    const presented = request.headers.get(INTERNAL_HANDOFF_HEADER);
    const isInternal = Boolean(expected && presented && presented === expected);

    const admin = createAdminClient();
    const { data: job } = await admin
      .from("ai_jobs")
      .select("id, user_id, status, running")
      .eq("id", jobId)
      .maybeSingle();

    // 404 for a missing job either way — a 403 would confirm it exists.
    if (!job) return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });

    if (!isInternal) {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // Two different refusals on purpose, matching the pattern every other
      // route here follows. NO SESSION is 401 — a straightforward "sign
      // in", and it reveals nothing because it is the answer to every URL.
      // WRONG OWNER is 404 — a 403 there would confirm that a job with this
      // id exists and belongs to somebody else.
      if (!user) {
        return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
      }
      if (user.id !== job.user_id) {
        return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
      }
    }

    if (!isJobActive(String(job.status))) {
      return NextResponse.json({ ok: true, ran: false, reason: "finished" });
    }

    // The claim IS the lock. Losing it is the normal, healthy outcome of
    // two kicks arriving for the same job, so it is a 200 rather than an
    // error — the caller was right to try and there is nothing to fix.
    if (!(await claimJob(jobId))) {
      return NextResponse.json({ ok: true, ran: false, reason: "locked" });
    }

    const outcome = await runJob({ jobId, apiKey });
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    logApiError("/api/jobs/[id]/continue", err, { jobId });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
