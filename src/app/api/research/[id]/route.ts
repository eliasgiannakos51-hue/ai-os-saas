import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

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

    const { data, error } = await supabase
      .from("research_reports")
      .select(
        "id, topic, language, status, questions, sections, sources, run_steps, document_id, credits_charged, error, created_at, completed_at"
      )
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
