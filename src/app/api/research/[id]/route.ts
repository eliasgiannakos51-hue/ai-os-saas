import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isResearchJobStale, type ResearchStatus } from "@/lib/research/research-limits";
import { researchReportForClient } from "@/lib/research/research-timeline";
import { RESEARCH_CLIENT_COLUMNS } from "@/lib/billing/client-columns";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** One report, in full. Polled while it runs, then read once it is
 *  ready — the same endpoint for both, so the client has one shape to
 *  handle rather than a progress API and a results API that can disagree. */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // THE ACCOUNT'S COLUMNS, then the server's. The account may read only
    // RESEARCH_CLIENT_COLUMNS (20261013000000_cost_columns_server_only.sql);
    // this read through its own client is also the ownership check. Every
    // name on the list has existed since 20260924000000 or earlier.
    const { data: own, error } = await supabase
      .from("research_reports")
      .select(RESEARCH_CLIENT_COLUMNS)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      logApiError("/api/research/[id]", error, { stage: "load" });
      return NextResponse.json({ ok: false, error: "Could not load that report." }, { status: 500 });
    }
    const notFound = () => NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
    if (!own) return notFound();

    // The per-call cost record the timeline is weighed with: a server-only
    // column, read for the row the account just proved is its own.
    // researchReportForClient uses it and never returns it.
    const { data: serverSide } = await createAdminClient()
      .from("research_reports")
      .select("usage_entries")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!serverSide) return notFound();
    const data: Record<string, unknown> = { ...(own as Record<string, unknown>), ...(serverSide as Record<string, unknown>) };

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
    if (isResearchJobStale(String(data.status), (data.processing_started_at as string | null) ?? null, String(data.created_at), new Date())) {
      // The server's write: the account cannot update its reports
      // (20261011000000_research_reports_server_writes.sql). Still scoped
      // to this user's own row.
      const { data: failed } = await createAdminClient()
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
        .eq("status", String(data.status))
        .select("*")
        .maybeSingle();

      if (failed) {
        logApiError("/api/research/[id]", "stale research job force-failed", {
          reportId: params.id,
          status: String(data.status),
          processingStartedAt: (data.processing_started_at as string | null) ?? null,
        });
        return NextResponse.json({ ok: true, report: researchReportForClient(failed) });
      }
      // The worker won the race — re-read rather than returning our now
      // stale copy.
      const { data: fresh } = await createAdminClient()
        .from("research_reports")
        .select("*")
        .eq("id", params.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (fresh) return NextResponse.json({ ok: true, report: researchReportForClient(fresh) });
    }

    // Never the row as is: it carries usage_entries (every model, token
    // and USD cost the report spent). See researchReportForClient.
    return NextResponse.json({ ok: true, report: researchReportForClient(data) });
  } catch (err) {
    logApiError("/api/research/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/** Delete a report. The Document it produced is left alone: it is the
 *  user's writing now, and deleting the job that generated it must not
 *  take the output with it. */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const supabase = await createClient();
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
