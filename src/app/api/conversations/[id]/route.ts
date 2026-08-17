import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { pinLimitFor } from "@/lib/chat/pin-limits";
import { normaliseConversationTitle } from "@/lib/chat/conversation-title";

export const dynamic = "force-dynamic";

/**
 * Renaming and pinning a conversation, enforced on the server.
 *
 * BOTH USED TO BE DIRECT CLIENT UPDATES against chat_conversations. RLS
 * made that SAFE — `update_own_chat_conversations` means one account
 * cannot touch another's row — but safe is not the same as correct, and
 * two things were wrong with it:
 *
 *   1. NO CAP ON PINS. The sidebar puts pinned conversations above
 *      everything else, so a list where everything is pinned is a list
 *      where nothing is. A limit that lives only in the UI is not a
 *      limit; the row could be flipped from a console, and the next
 *      client to be written would forget it.
 *   2. NO LENGTH ON TITLES. A 40,000-character title is a row that
 *      renders as a wall in the sidebar on every subsequent load, and
 *      nothing rejected it.
 *
 * RLS still does the ownership half and does it better than a check here
 * could — it is enforced by the database for every path, not by this
 * route for callers who happen to use it. What this adds is the rules
 * RLS has no opinion about. The `.eq("user_id", user.id)` below is
 * therefore belt-and-braces rather than the primary control, and it is
 * there so the count is right even if a policy is ever loosened.
 *
 * CODES, NOT PROSE. Every other route in this app answers with an English
 * sentence that the client shows verbatim, and i18n-coverage.test.mjs
 * counts them precisely because that is a known gap — the fix it names is
 * "stable error CODES that the client looks up". This route is small
 * enough to be written that way from the start, so nothing it returns is
 * a sentence: `code` is an identifier, the client owns the wording, and a
 * Greek UI never shows an English error because this file was touched.
 */
type ConversationErrorCode =
  | "not_authenticated"
  | "nothing_to_update"
  | "title_not_text"
  | "title_empty"
  | "pin_not_boolean"
  | "pin_limit"
  | "count_failed"
  | "update_failed"
  | "unexpected";

function fail(code: ConversationErrorCode, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, code, ...extra }, { status });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return fail("not_authenticated", 401);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return fail("nothing_to_update", 400);
    }

    const patch: { title?: string; is_pinned?: boolean } = {};

    if ("title" in body) {
      const raw = (body as { title?: unknown }).title;
      if (typeof raw !== "string") {
        return fail("title_not_text", 400);
      }
      const title = normaliseConversationTitle(raw);
      // An empty title is a rename that erases the only label the
      // conversation has. Refused rather than silently ignored, so the
      // client can put the old text back instead of showing a blank row.
      if (!title) {
        return fail("title_empty", 400);
      }
      patch.title = title;
    }

    if ("is_pinned" in body) {
      const pinned = (body as { is_pinned?: unknown }).is_pinned;
      if (typeof pinned !== "boolean") {
        return fail("pin_not_boolean", 400);
      }

      // THE CAP IS CHECKED ONLY WHEN PINNING. Unpinning always works —
      // an account that is over the limit because the limit was lowered
      // must be able to get back under it, and refusing to unpin would
      // trap them there.
      if (pinned) {
        const planSlug = await resolveEffectivePlanSlug(user);
        const limit = pinLimitFor(planSlug);

        // Counted EXCLUDING this conversation, so re-pinning something
        // already pinned is not treated as a new one — otherwise an
        // account sitting exactly on the limit could never touch its own
        // pinned rows again.
        const { count, error: countError } = await supabase
          .from("chat_conversations")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_pinned", true)
          .neq("id", params.id);

        if (countError) {
          logApiError("/api/conversations/[id]", countError, { stage: "count_pinned" });
          return fail("count_failed", 500);
        }

        if ((count ?? 0) >= limit) {
          // Not an upgrade prompt. Running out of pins is a tidiness
          // problem, not a billing event, and the honest instruction is
          // "unpin one" — so the numbers go back and the client says it.
          return fail("pin_limit", 409, { limit, pinned: count ?? 0 });
        }
      }

      patch.is_pinned = pinned;
    }

    if (Object.keys(patch).length === 0) {
      return fail("nothing_to_update", 400);
    }

    const { data, error } = await supabase
      .from("chat_conversations")
      .update(patch)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id, title, is_pinned")
      .single();

    if (error || !data) {
      logApiError("/api/conversations/[id]", error, { stage: "update" });
      return fail("update_failed", 500);
    }

    return NextResponse.json({ ok: true, conversation: data });
  } catch (err) {
    logApiError("/api/conversations/[id]", err, { stage: "unhandled" });
    return fail("unexpected", 500);
  }
}
