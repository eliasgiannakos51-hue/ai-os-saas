// Whether cross-conversation chat memory is on for a given request.
//
// Split out of lib/chat/memory.ts deliberately. That module reaches for the
// Anthropic SDK and the Supabase client the moment it is loaded, so the
// decision "is memory on at all" could only ever be checked by reading the
// source as text. It is a pure predicate over two values; it belongs
// somewhere it can be executed.

/**
 * Defaults to on — chat_memory_enabled is only ever written as `false`
 * (see components/settings/chat-memory-settings.tsx), so anything else
 * (unset, true) means on.
 */
export function isChatMemoryEnabled(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined
): boolean {
  return user?.user_metadata?.chat_memory_enabled !== false;
}

/**
 * Whether cross-conversation memory is active for this request AT ALL.
 *
 * ONE predicate, used by both the read side and the write side, because
 * they were two separate conditions and they disagreed:
 *
 *   read:  loadRecentMemories(..., plan.capabilities.chatMemoryLimit)
 *   write: if (isChatMemoryEnabled(user)) extractAndStoreMemory(...)
 *
 * Free is `chatMemoryLimit: 0` (lib/billing/plans.ts). `.limit(0)` is not
 * "no limit" — PostgREST sends `LIMIT 0` and Postgres returns zero rows.
 * So on Free the read always came back empty while the write kept running:
 * a SECOND real Claude call on every single message, priced and charged
 * into the same settlement as the reply, writing rows into chat_memory
 * that nothing would ever read back. The account paid for a feature that
 * was switched off at the other end, and their extracted personal facts
 * accumulated in a table for no purpose — which is also the wrong answer
 * under data minimisation.
 *
 * Deriving both sides from one function is what stops that recurring: a
 * plan whose limit is 0 performs no extraction either.
 */
export function chatMemoryActive({
  userEnabled,
  planLimit,
}: {
  userEnabled: boolean;
  planLimit: number;
}): boolean {
  return userEnabled && Number.isFinite(planLimit) && planLimit > 0;
}
