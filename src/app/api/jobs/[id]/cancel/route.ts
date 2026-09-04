import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { markStopRequested } from "@/lib/stop-requests";

export const dynamic = "force-dynamic";

/**
 * "Stop" for a background job — an agent run, Create Anything, Ask my
 * files, the agent builder, a plan. V4.6.
 *
 * READ AS THE USER, WRITE AS THE SERVICE. ai_jobs has select-only
 * policies for the owner by design (the worker owns every write), so the
 * ownership question is answered by a user-scoped read — a job id that
 * RLS does not hand back is a 404, never a 403 that confirms it exists —
 * and the one column is then set through the admin client. The worker
 * reads it at its next boundary (lib/jobs/run-job.ts) and settles for
 * the steps already done.
 *
 * A job that has already finished is not an error: the answer says so,
 * and nothing is written.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const { data: job, error } = await supabase
      .from("ai_jobs")
      .select("id, status")
      .eq("id", params.id)
      .maybeSingle();
    if (error) {
      logApiError("/api/jobs/[id]/cancel", error, { jobId: params.id });
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }
    if (!job) return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    if (job.status === "done" || job.status === "failed") {
      return NextResponse.json({ ok: true, alreadyFinished: true, status: job.status });
    }

    const written = await markStopRequested(createAdminClient(), "ai_jobs", String(job.id));
    if (!written) return NextResponse.json({ ok: false, error: "Could not record the stop." }, { status: 500 });
    return NextResponse.json({ ok: true, stopRequested: true });
  } catch (err) {
    logApiError("/api/jobs/[id]/cancel", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
