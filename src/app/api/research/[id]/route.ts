import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isResearchJobStale, type ResearchStatus } from "@/lib/research/research-limits";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** One report, in full. Polled while it runs, then read once it is
 *  ready — the same endpoint for both, so the client has one shape to
 *  handle rather than a progress API and a results API that can disagree. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // `*`, not a column list.
    //
    // The progress columns (questions_done / questions_total /
    // current_question) are added by a migration, and PostgREST fails the
    // WHOLE query when a listed column does not exist. A column list here
    // would mean an instance running new code against an un-migrated
    // database could not read a single report — every poll a 500. `*`
    // simply returns whatever the table has.
    const { data, error } = await supabase
      .from("research_reports")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      logApiError("/api/research/[id]", error, { stage: "load" });
      return NextResponse.json({ ok: false, error: "Could not load that report." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
    }

    // STALE-JOB RECOVERY — the backstop Deep Research never had.
    //
    // The Website Builder has done this since its own version of this bug
    // (api/websites/status): if the worker died without writing a terminal
    // status, the very next poll force-fails the row so the client stops
    // spinning. Deep Research had nothing, so a killed function left the
    // row at 'researching' permanently — the user watched a spinner for
    // half an hour and then found the same spinner the next day.
    //
    // No refund is needed here and none is issued: settlement only ever
    // runs on a path that reached the end, and the credit HOLD is released
    // by releaseExpiredReservations on the daily cron (reservations carry
    // their own expires_at). A row reaped here was never charged.
    if (isResearchJobStale(String(data.status), data.processing_started_at ?? null, String(data.created_at), new Date())) {
      const { data: failed } = await supabase
        .from("research_reports")
        .update({
          status: "failed" satisfies ResearchStatus,
          error: "The report stopped before it finished. No credits were charged — please run it again.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", params.id)
        .eq("user_id", user.id)
        // Conditioned on the status we just read, so this can never
        // clobber a 'ready' the worker wrote between the SELECT and here.
        .eq("status", data.status)
        .select("*")
        .maybeSingle();

      if (failed) {
        logApiError("/api/research/[id]", "stale research job force-failed", {
          reportId: params.id,
          status: data.status,
          processingStartedAt: data.processing_started_at ?? null,
        });
        return NextResponse.json({ ok: true, report: failed });
      }
      // The worker won the race — re-read rather than returning our now
      // stale copy.
      const { data: fresh } = await supabase
        .from("research_reports")
        .select("*")
        .eq("id", params.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (fresh) return NextResponse.json({ ok: true, report: fresh });
    }

    return NextResponse.json({ ok: true, report: data });
  } catch (err) {
    logApiError("/api/research/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/** Delete a report. The Document it produced is left alone: it is the
 *  user's writing now, and deleting the job that generated it must not
 *  take the output with it. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data: report, error: loadError } = await supabase
      .from("research_reports")
      .select("id")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError) {
      logApiError("/api/research/[id]", loadError, { stage: "load_for_delete" });
      return NextResponse.json({ ok: false, error: "Could not load that report." }, { status: 500 });
    }
    if (!report) {
      return NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
    }

    const { error } = await supabase
      .from("research_reports")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id);

    if (error) {
      logApiError("/api/research/[id]", error, { stage: "delete" });
      return NextResponse.json({ ok: false, error: "Could not delete that report." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/research/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
