import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { recordLearnedObservation } from "@/lib/learning";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Dismiss an insight.
 *
 * An UPDATE, not a DELETE, and the table has no delete policy at all. The
 * row is the record that this claim was made about somebody's business
 * and what numbers it rested on; keeping it is what lets the same pattern
 * not be re-reported to a user who has already said they know, and what
 * makes a wrong claim answerable for afterwards.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // A dismiss is one click on one card; 60/hr is far above any human
    // pace while keeping a script from hammering the UPDATE path.
    const limited = await checkRateLimit({
      scope: "insight_dismiss",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { data, error } = await supabase
      .from("user_insights")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id, detector")
      .maybeSingle();

    if (error) {
      logApiError("/api/insights/[id]", error, { stage: "dismiss" });
      return NextResponse.json({ ok: false, error: "Could not dismiss that." }, { status: 500 });
    }
    // 404 rather than 403 for somebody else's id: a 403 confirms the row
    // exists, which is an existence oracle.
    if (!data) {
      return NextResponse.json({ ok: false, error: "Insight not found." }, { status: 404 });
    }

    // Learning profile (V3 Task 14): a dismissal is a real signal about
    // what this user does NOT want re-reported. Best-effort — recording
    // it must never fail the dismiss.
    if (data.detector) {
      await recordLearnedObservation(
        user.id,
        "dismissals",
        `dismisses "${String(data.detector)}" insights`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/insights/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
