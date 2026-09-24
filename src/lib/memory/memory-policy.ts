/**
 * IS MEMORY ON, FOR THIS PERSON, IN THIS FEATURE?
 *
 * Pure predicates over two values, in a module with no imports, so a
 * build gate can EXECUTE them. lib/chat/memory-policy.ts exists for
 * exactly this reason and its own header says so; this is the same rule
 * one level wider.
 */
import { isMemorySurface, type MemorySurface } from "./surfaces";

/**
 * The per-feature switches, stored on the user as an ARRAY OF WHAT IS
 * OFF rather than a map of what is on.
 *
 * DEFAULT-ON, AND THE SHAPE IS WHY. A map of `{website: true, ...}` has
 * to be written before the feature works, so a surface added later is
 * silently off for everybody who signed up before it existed — and
 * nothing would report that, because "no entry" and "switched off" look
 * identical. A list of exclusions has no such state: an unknown surface
 * is simply not in it.
 *
 * Same reasoning as chat_memory_enabled, which is only ever written as
 * `false` (see components/settings/chat-memory-settings.tsx).
 */
export const MEMORY_DISABLED_KEY = "memory_disabled_surfaces";

export function disabledSurfaces(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined
): MemorySurface[] {
  const raw = user?.user_metadata?.[MEMORY_DISABLED_KEY];
  if (!Array.isArray(raw)) return [];
  // An unknown string in the list is dropped rather than kept: the list is
  // user-writable through the settings route, and a value that is not a
  // surface can only ever be noise.
  return raw.filter(isMemorySurface);
}

/**
 * ONE PREDICATE FOR BOTH SIDES, and that is the whole point of it being a
 * function rather than two conditions.
 *
 * lib/chat/memory-policy.ts records what happened when the read and the
 * write disagreed: Free's chatMemoryLimit is 0, so the read came back
 * empty while the write kept running — a second real model call on every
 * message, charged, writing rows nothing would ever read back. The
 * account paid for a feature that was off at the other end.
 *
 * So a surface that is not read is not written either.
 */
export function memoryActiveFor({
  surface,
  user,
  planLimit,
}: {
  surface: MemorySurface;
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined;
  planLimit: number;
}): boolean {
  if (planLimit <= 0) return false;
  // The global switch still governs everything. A person who turned
  // memory off in Settings did not mean "except in the deck writer".
  if (user?.user_metadata?.chat_memory_enabled === false) return false;
  return !disabledSurfaces(user).includes(surface);
}
