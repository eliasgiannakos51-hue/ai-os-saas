import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { memoryFold } from "@/lib/chat/memory-fold";
import { buildMemoryPromptAddition, type RememberedFact } from "@/lib/chat/memory-prompt";
import { isMemorySurface, type MemoryKind, type MemorySurface } from "./surfaces";

/**
 * READING AND WRITING THE MEMORY, FROM ANY FEATURE.
 *
 * ----------------------------------------------------------------------
 * THE READ IS DELIBERATELY NOT FILTERED BY SURFACE
 * ----------------------------------------------------------------------
 *
 * "The AI remembers everywhere" means one memory, not six. A person who
 * told the chat they write in short paragraphs should not have to tell
 * the deck writer as well — that is the whole feature, and filtering the
 * read by surface would rebuild the silos it exists to remove.
 *
 * `surface` is therefore PROVENANCE, not scope: it says where a thing was
 * learned, which is what makes the per-feature list on
 * /dashboard/ai-memory and the per-feature switch possible. The SWITCH is
 * about whether this feature participates at all — see memoryActiveFor —
 * and a feature that is switched off neither reads nor writes.
 *
 * ----------------------------------------------------------------------
 * WHERE THE BLOCK GOES IN THE PROMPT, AND WHY IT IS NOT NEGOTIABLE
 * ----------------------------------------------------------------------
 *
 * MEASURED 2026-09-24: twenty remembered facts are 547 tokens. The
 * minimum cacheable prefix on claude-sonnet-4-6 is 1,024
 * (lib/ai/cached-system.ts). So a memory block can NEVER be the cached
 * prefix on its own, and marking it with cache_control would not error —
 * Anthropic returns cache_creation_input_tokens: 0 and the marker looks
 * like an optimisation that works and does nothing.
 *
 * It must therefore ride INSIDE a feature's existing static prefix, after
 * the big system prompt and before anything per-request. Cached, that is
 * $0.16 per thousand actions against $1.64 uncached — a tenth.
 * scripts/tests/memory-universal.test.mjs holds every call site to that
 * ordering.
 */

/** What the prompt read costs nothing to bound; the plan sets the real one. */
export const DEFAULT_MEMORY_LIMIT = 20;

export type StoredMemory = RememberedFact & {
  id: string;
  surface: MemorySurface;
  kind: MemoryKind;
};

/**
 * Every fact this person has, newest-repeated first, across all features.
 *
 * ORDERED BY last_seen_at, NOT created_at — a fact learned two years ago
 * and repeated yesterday belongs at the top, and ordering by creation put
 * one-off remarks from last week above things the person says constantly.
 * lib/chat/memory.ts records that; this keeps it.
 */
export async function loadMemories(
  supabase: SupabaseClient,
  userId: string,
  limit: number = DEFAULT_MEMORY_LIMIT
): Promise<StoredMemory[]> {
  if (limit <= 0) return [];
  const { data, error } = await supabase
    .from("chat_memory")
    .select("id, memory_text, times_seen, last_seen_at, surface, kind")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (error) {
    logApiError("memory:loadMemories", error, { userId });
    return [];
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    text: String(row.memory_text ?? ""),
    timesSeen: Number(row.times_seen ?? 1),
    lastSeenAt: String(row.last_seen_at ?? ""),
    surface: isMemorySurface(row.surface) ? row.surface : "chat",
    kind: (row.kind ?? "fact") as MemoryKind,
  }));
}

/**
 * The block a feature puts in its cached prefix, or "" when there is
 * nothing to say.
 *
 * Returns the EMPTY STRING rather than a heading with no bullets: a
 * sentence announcing what the model knows, followed by nothing, reads to
 * the model as "this person has no history" stated with confidence.
 */
export async function memoryPromptFor(
  supabase: SupabaseClient,
  userId: string,
  limit: number = DEFAULT_MEMORY_LIMIT
): Promise<string> {
  const memories = await loadMemories(supabase, userId, limit);
  return buildMemoryPromptAddition(memories);
}

/**
 * Record a fact, from whichever feature learned it.
 *
 * THROUGH THE FUNCTION, NOT AN UPSERT. chat_memory has no UPDATE policy
 * on purpose — it is append/delete-only for a browser session, and a
 * counter is not a reason to give that up. memory_record() is SECURITY
 * DEFINER and takes its identity from auth.uid(), so there is no userId
 * parameter to forge.
 *
 * Best-effort by design: a feature must not fail because the thing it
 * learned could not be written down.
 */
export async function recordMemory(
  supabase: SupabaseClient,
  {
    text,
    surface,
    kind,
    conversationId = null,
  }: {
    text: string;
    surface: MemorySurface;
    kind: MemoryKind;
    conversationId?: string | null;
  }
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const { error } = await supabase.rpc("memory_record", {
    p_memory_text: trimmed,
    p_memory_fold: memoryFold(trimmed),
    p_surface: surface,
    p_kind: kind,
    p_conversation_id: conversationId,
  });
  if (error) {
    logApiError("memory:recordMemory", error, { stage: "record", surface, kind });
    return false;
  }
  return true;
}
