import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Toggle a vote (V3 Task 13). One row per user per request enforced by
 * the primary key; the denormalised count moves via trigger, so this
 * route never touches feature_requests at all.
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

    const limited = await checkRateLimit({
      scope: "feature_request_vote",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many votes at once." }, { status: 429 });
    }

    const requestId = (params.id ?? "").slice(0, 64);

    const { data: existing } = await supabase
      .from("feature_request_votes")
      .select("request_id")
      .eq("user_id", user.id)
      .eq("request_id", requestId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("feature_request_votes")
        .delete()
        .eq("user_id", user.id)
        .eq("request_id", requestId);
      if (error) {
        logApiError("/api/feature-requests/vote", error, { stage: "unvote" });
        return NextResponse.json({ ok: false, error: "Could not remove the vote." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, voted: false });
    }

    const { error } = await supabase
      .from("feature_request_votes")
      .insert({ user_id: user.id, request_id: requestId });
    if (error) {
      // A vanished request 404s rather than 500s — the id came from the
      // client and the row may have been deleted.
      logApiError("/api/feature-requests/vote", error, { stage: "vote" });
      return NextResponse.json({ ok: false, error: "Request not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, voted: true });
  } catch (err) {
    logApiError("/api/feature-requests/vote", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
