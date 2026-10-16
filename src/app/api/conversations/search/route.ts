import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import {
  CONTENT_MATCHES_CAP,
  CONTENT_ROWS_SCANNED,
  MIN_CONTENT_QUERY,
  contentSnippet,
  likePattern,
} from "@/lib/chat/conversation-search";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * SEARCHING INSIDE WHAT WAS SAID — the half the titles cannot answer.
 *
 * The Chats page searches two things and they are not the same search.
 * TITLES are filtered in the browser over the list the page already
 * rendered (lib/text/search-match.ts, which folds case, accents, Greek
 * final sigma and Greeklish), so it is instant and costs nothing.
 * CONTENT cannot be: the messages are not on the page, there may be
 * tens of thousands of them, and the only honest way to ask is to ask
 * the database.
 *
 * WHY NOT search_index, WHICH ALREADY EXISTS. It indexes
 * chat_conversations with an EMPTY body column
 * (20260824000000_unified_search.sql spec row
 * ['chat_conversations','chat','title','',...]), so the tsvector holds
 * titles and nothing else — a content search through it finds nothing,
 * and the fix is a migration that adds a spec row, regenerates
 * 20260919000000_search_index_backfill.sql byte-identically, and moves
 * a ratchet (scripts/tests/unified-search.test.mjs asserts
 * SPECS.length === 29). That is the right end state and it is NOT this
 * round: migrations here are pasted by hand, and shipping a search that
 * silently finds nothing until somebody remembers to paste a file is
 * worse than shipping one that is slower and works today.
 *
 * SO THIS IS AN ILIKE, AND IT IS BOUNDED ON PURPOSE. chat_messages has
 * indexes on (conversation_id, created_at) and (user_id, created_at)
 * and none on `content`, so this reads the account's recent messages
 * and matches them in the database. The bound is CONTENT_ROWS_SCANNED
 * newest messages: a cap that is a real limit, not a formality, and the
 * page says so rather than implying it searched everything. When the
 * tsvector lands this route keeps its shape and changes its query.
 *
 * ONLY THIS ACCOUNT'S MESSAGES. The read goes through the caller's own
 * session, so RLS on chat_messages (auth.uid() = user_id) decides, and
 * the explicit .eq("user_id") beside it is there so the bound is
 * counted over the right rows rather than as the control.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    // Shorter than this matches most of a Greek sentence and would read
    // the whole history to say so. The page keeps filtering titles.
    if (q.length < MIN_CONTENT_QUERY) return NextResponse.json({ ok: true, matches: [], truncated: false });

    const { data, error } = await supabase
      .from("chat_messages")
      .select("conversation_id, content, created_at")
      .eq("user_id", user.id)
      .ilike("content", likePattern(q))
      .order("created_at", { ascending: false })
      .limit(CONTENT_ROWS_SCANNED);

    if (error) {
      logApiError("/api/conversations/search", error, { stage: "ilike" });
      return NextResponse.json({ error: "search_failed" }, { status: 500 });
    }

    // One entry per conversation, keeping the newest matching message as
    // the line to show. A conversation where the word appears forty
    // times is one result, not forty.
    const bySource = new Map<string, string>();
    for (const row of (data ?? []) as { conversation_id?: unknown; content?: unknown }[]) {
      const id = typeof row.conversation_id === "string" ? row.conversation_id : "";
      if (!id || bySource.has(id)) continue;
      bySource.set(id, contentSnippet(String(row.content ?? ""), q));
      if (bySource.size >= CONTENT_MATCHES_CAP) break;
    }

    return NextResponse.json({
      ok: true,
      matches: [...bySource].map(([id, snippet]) => ({ id, snippet })),
      // True when the scan hit its ceiling, so the page can say "the
      // newest N messages" instead of pretending it read them all.
      truncated: (data ?? []).length >= CONTENT_ROWS_SCANNED,
    });
  } catch (err) {
    logApiError("/api/conversations/search", err, { stage: "unhandled" });
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }
}
