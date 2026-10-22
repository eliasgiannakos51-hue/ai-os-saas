import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { getFavoritableByTable } from "@/lib/favoritable";
import { sourceForKind, myStuffSearchableText, type MyStuffKind } from "@/lib/my-stuff/sources";
import { candidateLine, MY_STUFF_POOL_PER_KIND, type MyStuffCandidate } from "@/lib/my-stuff/ask-context";

/**
 * READING THE USER'S OWN DATA FOR ONE QUESTION — the IO half of
 * lib/my-stuff/ask-context.ts, split the way lib/ai/cross-module-store.ts
 * is split from lib/ai/cross-module-context.ts.
 *
 * THROUGH THE CALLER'S OWN RLS-SCOPED CLIENT, NEVER THE ADMIN ONE — the
 * same non-negotiable cross-module-store.ts states for itself: this loads
 * one person's own records into a model prompt, so the row filter must be
 * the database's, not a `.eq("user_id", ...)` somebody could forget here
 * and nowhere else. The explicit `.eq` below is belt-and-braces on top of
 * RLS, the same redundancy lib/library/load.ts and lib/timeline.ts keep,
 * for the same reason: a session that degraded to anonymous must be
 * REPORTED (as a kind that failed), never silently read as "found nothing".
 *
 * A FAILURE IS AN EMPTY LIST FOR THAT KIND, never a thrown error — asking
 * a question must not fail outright because one of several tables timed
 * out; it answers from what it could read and does not claim the rest.
 */

/** chat_conversations has no body column — chat_messages does, one row
 *  per turn — so "chat" reads that table directly rather than through the
 *  generic per-kind loop every other kind uses (lib/my-stuff/sources.ts's
 *  own note on why `chat`'s contentColumns is empty). Mirrors the shape
 *  lib/ai/cross-module-store.ts's loadChatContextForCoding already reads
 *  the same table with. */
async function loadChatCandidates(
  supabase: SupabaseClient,
  userId: string,
  limit: number
): Promise<MyStuffCandidate[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, conversation_id, role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) {
    if (error) logApiError("my-stuff:ask", error, { table: "chat_messages" });
    return [];
  }
  const favoritable = getFavoritableByTable("chat_conversations");
  return (data as Record<string, unknown>[]).flatMap((row) => {
    const conversationId = String(row.conversation_id ?? "");
    const content = String(row.content ?? "");
    if (!conversationId || !content.trim()) return [];
    const role = row.role === "assistant" ? "you said" : "they asked";
    return [
      {
        index: 0, // assigned by the caller, across every kind at once
        kind: "chat" as const,
        id: String(row.id),
        title: `${role}: ${content.slice(0, 60)}`,
        href: favoritable ? favoritable.hrefFor(conversationId) : "/dashboard/chat",
        createdAt: String(row.created_at ?? ""),
        text: candidateLine("chat", String(row.created_at ?? ""), "", `${role}: ${content}`),
      },
    ];
  });
}

async function loadKindCandidates(
  supabase: SupabaseClient,
  userId: string,
  kind: MyStuffKind,
  limit: number
): Promise<MyStuffCandidate[]> {
  if (kind === "chat") return loadChatCandidates(supabase, userId, limit);

  const source = sourceForKind(kind);
  if (!source) return [];
  const columns = source.contentColumns ? `${source.columns}, ${source.contentColumns}` : source.columns;
  const { data, error } = await supabase
    .from(source.table)
    .select(columns)
    .eq("user_id", userId)
    .order(source.timeColumn, { ascending: false })
    .limit(limit);
  if (error || !data) {
    if (error) logApiError("my-stuff:ask", error, { table: source.table });
    return [];
  }
  return (data as unknown as Record<string, unknown>[])
    .filter((row) => source.keep(row))
    .map((row) => {
      const id = String(row.id);
      const title = source.titleOf(row);
      const body = myStuffSearchableText(source, row);
      return {
        index: 0,
        kind: source.kind,
        id,
        title,
        href: source.hrefFor(id),
        createdAt: String(row[source.timeColumn] ?? ""),
        text: candidateLine(source.kind, String(row[source.timeColumn] ?? ""), title, body),
      };
    });
}

/**
 * Every candidate row for the kinds a question was classified into,
 * newest first within each kind, numbered 1..N in the order the model is
 * shown them (kind order, then recency) — the numbering renderMyStuffContext
 * and citedIndices both read off this same array, so a cited [3] always
 * resolves to the row this function put at index 3.
 */
export async function loadMyStuffCandidates(
  supabase: SupabaseClient,
  userId: string,
  kinds: readonly MyStuffKind[],
  perKindLimit: number = MY_STUFF_POOL_PER_KIND
): Promise<MyStuffCandidate[]> {
  const perKind = await Promise.all(kinds.map((kind) => loadKindCandidates(supabase, userId, kind, perKindLimit)));
  let next = 1;
  const out: MyStuffCandidate[] = [];
  for (const rows of perKind) {
    for (const row of rows) out.push({ ...row, index: next++ });
  }
  return out;
}
