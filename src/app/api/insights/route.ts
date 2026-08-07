import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** The user's active insights, newest first. Dismissed ones are excluded
 *  rather than deleted, so the same pattern is not re-reported to
 *  somebody who has already said they know. */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_insights")
      .select("id, detector, module_slug, headline, detail, evidence, sample_size, created_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      logApiError("/api/insights", error, { stage: "list" });
      return NextResponse.json({ ok: false, error: "Could not load your insights." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, insights: data ?? [] });
  } catch (err) {
    logApiError("/api/insights", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
