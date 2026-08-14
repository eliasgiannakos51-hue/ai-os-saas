import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// "The user has now seen this result."
//
// Carries no service-role exemption marker, deliberately (see
// scripts/tests/owner-only-access.test.mjs): that marker is for routes
// which CANNOT check ownership — pre-auth, token-auth, public — and this
// one can. The row is read through the user's own RLS-scoped client before
// anything is written, so the admin client here only crosses RLS to write
// a column the browser is not allowed to write. It never widens who the
// row could belong to.
//
// WHY A WRITE AND NOT A CLIENT FLAG. The whole reason /api/jobs offers
// finished work at all is that the browser is not a place where anything
// can be remembered: a second tab, a different machine and a cleared cache
// each produce a client that has no idea what has already been shown. If
// "seen" lived in localStorage, the second tab would re-offer the draft the
// first tab is displaying, and a new machine would re-offer everything.
//
// TWO THINGS CALL THIS, and they are the same event from two directions:
//
//   1. The preview appearing on screen (components/jobs/job-seen.tsx,
//      mounted inside the preview itself, so it cannot fire for a preview
//      that was never rendered).
//   2. Discard — the user saying explicitly that they are done with it,
//      which must take effect immediately rather than waiting for a
//      render that will never happen again.
//
// IT IS NOT A DELETE. The row, the result and the credit record all stay
// exactly as they were; ?active=0 still finds it and the GDPR export still
// contains it. The only thing that changes is whether the next page-open
// puts it back in front of the user.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const jobId = params.id;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    // OWNERSHIP IS DECIDED BY RLS, not by comparing ids after an admin
    // read. The user's own client can only see their own rows, so a job id
    // belonging to somebody else is simply not found — and the answer is
    // identical to the answer for an id that never existed, which is what
    // stops this being a way to test whether a job id is real.
    //
    // This matters more here than on the poll: marking someone else's job
    // consumed would make THEM lose a draft they paid for, silently, with
    // no error on their screen.
    const { data: job, error } = await supabase
      .from("ai_jobs")
      .select("id, status, consumed_at")
      .eq("id", jobId)
      .maybeSingle();
    if (error) {
      logApiError("/api/jobs/[id]/consume", error, { jobId });
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }
    if (!job) return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });

    // Already marked. Not an error — two components can legitimately
    // report the same result seen (a preview rendering and then being
    // discarded), and React's development double-mount does it by design.
    if (job.consumed_at) {
      return NextResponse.json({ ok: true, consumedAt: job.consumed_at, alreadyConsumed: true });
    }

    const consumedAt = new Date().toISOString();
    // Written through the admin client because ai_jobs has no update
    // policy for the browser at all, and giving it one would mean a client
    // that can also write credits_charged.
    //
    // Conditioned on consumed_at still being null so the FIRST sighting is
    // the one recorded. Two tabs opening together would otherwise race,
    // and the later write would move the timestamp forward — harmless
    // today, but it would make "when did the user first see this" a
    // question the row answers wrongly.
    const admin = createAdminClient();
    const { data: updated, error: updateError } = await admin
      .from("ai_jobs")
      .update({ consumed_at: consumedAt })
      .eq("id", jobId)
      .is("consumed_at", null)
      .select("id, consumed_at");
    if (updateError) {
      logApiError("/api/jobs/[id]/consume", updateError, {
        jobId,
        hint: "run supabase/migrations/20260814_job_consumed_at.sql if consumed_at does not exist yet",
      });
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }

    // Zero rows means another request won the race in the microseconds
    // since the read. The result is the same either way: it is marked.
    return NextResponse.json({
      ok: true,
      consumedAt,
      alreadyConsumed: (updated ?? []).length === 0,
    });
  } catch (err) {
    logApiError("/api/jobs/[id]/consume", err, { jobId });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
