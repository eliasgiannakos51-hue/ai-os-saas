import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { markStopRequested } from "@/lib/stop-requests";

export const dynamic = "force-dynamic";

/**
 * "Stop" for a research report. V4.6.
 *
 * Research runs one question at a time across hand-offs
 * (lib/research/run-research.ts). This sets the flag the runner reads
 * before each question; it settles for the questions already answered
 * and marks the report failed with a sentence that says it was stopped.
 * A report that is already ready or failed is left alone.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const { data: report, error } = await supabase
      .from("research_reports")
      .select("id, status")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      logApiError("/api/research/[id]/cancel", error, { reportId: params.id });
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }
    if (!report) return NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
    if (report.status === "ready" || report.status === "failed") {
      return NextResponse.json({ ok: true, alreadyFinished: true, status: report.status });
    }

    const written = await markStopRequested(createAdminClient(), "research_reports", String(report.id));
    if (!written) return NextResponse.json({ ok: false, error: "Could not record the stop." }, { status: 500 });
    return NextResponse.json({ ok: true, stopRequested: true });
  } catch (err) {
    logApiError("/api/research/[id]/cancel", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
