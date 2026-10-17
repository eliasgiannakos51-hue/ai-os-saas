import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { parseRating } from "@/lib/chat/answer-rating";

export const dynamic = "force-dynamic";

/**
 * THUMBS UP OR DOWN ON ONE CHAT ANSWER (Δ.2, 2026-10-05).
 *
 * Through the signed-in session, so update_own_chat_messages keeps it to
 * the account's own rows; the `.eq("user_id")` and `.eq("role")` below say
 * the same thing again and add the rule the policy has no opinion about:
 * only an ANSWER is rated, never the person's own message.
 *
 * CODES, NOT PROSE, as in src/app/api/conversations/[id]/route.ts: the
 * client owns the wording.
 */
type RatingErrorCode = "not_authenticated" | "rate_limited" | "bad_rating" | "not_found" | "update_failed" | "unexpected";

function fail(code: RatingErrorCode, status: number) {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("not_authenticated", 401);

    const limited = await checkRateLimit({ scope: "chat_rating", identifier: user.id, maxAttempts: 120, windowMinutes: 60 });
    if (!limited.allowed) return fail("rate_limited", 429);

    const body = (await request.json().catch(() => null)) as { rating?: unknown } | null;
    const parsed = parseRating(body?.rating);
    if (!parsed.ok) return fail("bad_rating", 400);

    const { data, error } = await supabase
      .from("chat_messages")
      .update({ rating: parsed.rating })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("role", "assistant")
      .select("id");
    if (error) {
      logApiError("/api/chat/messages/[id]/rating", error, { stage: "update" });
      return fail("update_failed", 500);
    }
    if (!data || data.length === 0) return fail("not_found", 404);
    return NextResponse.json({ ok: true, rating: parsed.rating });
  } catch (err) {
    logApiError("/api/chat/messages/[id]/rating", err);
    return fail("unexpected", 500);
  }
}
