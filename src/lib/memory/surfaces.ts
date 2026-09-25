/**
 * THE FEATURES THAT REMEMBER, DECLARED ONCE.
 *
 * NO "server-only" AND NO IMPORTS, on purpose. This list is read by the
 * server (which surface a route records under), by the browser (the
 * per-feature switches on /dashboard/ai-memory) and by a build gate
 * (which must EXECUTE it rather than grep for it). A module that pulled
 * in the Supabase client or the Anthropic SDK could do none of those —
 * the same split lib/chat/memory-policy.ts and lib/ai/cached-system.ts
 * already make, for the same reason.
 *
 * THE IDS ARE THE DATABASE'S. `chat_memory_surface_check` in
 * 20261007000000_universal_memory.sql lists exactly these six strings and
 * memory_record() REFUSES anything else rather than filing it under
 * 'chat' — a typo'd surface coerced to a default would be invisible in
 * the per-feature list and impossible to switch off, so the setting would
 * look ignored. scripts/tests/memory-universal.test.mjs holds the two
 * lists in step, both ways.
 */
export const MEMORY_SURFACES = [
  {
    id: "chat",
    /** `dashboard.aiMemory.surfaces.<id>` in all ten locales. */
    labelKey: "chat",
    /** Where a person goes to see it in context. */
    href: "/dashboard/chat",
  },
  { id: "website", labelKey: "website", href: "/dashboard/website-builder" },
  { id: "presentation", labelKey: "presentation", href: "/dashboard/presentations" },
  { id: "posts", labelKey: "posts", href: "/dashboard/posts" },
  { id: "coding", labelKey: "coding", href: "/dashboard/coding" },
  { id: "agent", labelKey: "agent", href: "/dashboard/agents" },
] as const;

export type MemorySurface = (typeof MEMORY_SURFACES)[number]["id"];

export const MEMORY_SURFACE_IDS: readonly MemorySurface[] = MEMORY_SURFACES.map((s) => s.id);

export function isMemorySurface(value: unknown): value is MemorySurface {
  return typeof value === "string" && (MEMORY_SURFACE_IDS as readonly string[]).includes(value);
}

/**
 * WHAT A REMEMBERED LINE IS, and the four are not decoration — the prompt
 * says a different sentence about each, and the ordering below is the
 * weight they carry.
 *
 * A `correction` is the person telling the product it got something
 * wrong, which outranks a `preference` the product inferred on its own.
 * An `approval` is them accepting one proposal, which is the weakest:
 * saying yes to a deck layout once is not a house style, and treating it
 * as one is exactly the "did X once" / "prefers X" confusion times_seen
 * exists to stop.
 */
export const MEMORY_KINDS = ["correction", "preference", "fact", "approval"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && (MEMORY_KINDS as readonly string[]).includes(value);
}
