import type { MyStuffKind } from "@/lib/my-stuff/sources";

/**
 * «1. MY STUFF: ΝΕΑ ΟΘΟΝΗ», Κομμάτι 3 (the owner's message, 2026-10-28) —
 * the filter row's OWN grouping: All, Documents, Images, Data, More
 * (Video, Audio, Sites and Apps, Meetings), Project, Sort. Project and
 * Sort are not kind-based and have no entry here; this file is only the
 * "which of the fifteen MY_STUFF_KINDS does each named bucket mean" half.
 *
 * A SUBSET VIEW, NOT A REPARTITION OF MY_STUFF_KINDS. "chat" and "coding"
 * are deliberately in none of the seven buckets below — a conversation
 * with the assistant is not a document, an image, business data, a site,
 * an app, or a recorded meeting, and forcing either into the nearest
 * bucket would be a wrong answer dressed as a convenient one. Selecting
 * "All" still shows both; selecting any specific bucket does not, which
 * IS the honest behaviour the owner's own check asks for ("κάθε φίλτρο
 * δείχνει μόνο τα σωστά" — each filter shows only the correct ones).
 *
 * `file` is bucketed under Documents even though its accepted types
 * (lib/files/file-types.ts) include `.xlsx`/`.csv`, which read more like
 * Data than Documents — a single MyStuffKind cannot sit in two buckets at
 * once without per-row branching the owner did not ask for here, and
 * "an uploaded file" is the more common case among the six accepted
 * types. Noted, not hidden: docs/PROGRESS.md's Κομμάτι 3 entry says the
 * same thing in prose.
 *
 * `finance`/`sales`/`trading` land in Data on the strength of
 * docs/QUEUE.md's own «20Ε» row (Finance/Sales/Trading's full replacement
 * by My Stuff, PR #343, not started) — they need SOME bucket now
 * regardless of when that PR lands, and Data is the only one of the
 * owner's four top-level names that fits a tracker row.
 */
export type MyStuffBucket = "documents" | "images" | "data" | "video" | "audio" | "sitesApps" | "meetings";

/** Shown as their own chip, before the "More" button. */
export const TOP_BUCKETS: readonly MyStuffBucket[] = ["documents", "images", "data"];

/** Shown only once "More" is opened — the owner's own parenthetical order. */
export const MORE_BUCKETS: readonly MyStuffBucket[] = ["video", "audio", "sitesApps", "meetings"];

export const BUCKET_KINDS: Record<MyStuffBucket, readonly MyStuffKind[]> = {
  documents: ["document", "research", "slides", "posts", "file"],
  images: ["images"],
  data: ["analysis", "finance", "sales", "trading"],
  // NO REAL BACKING TABLE EXISTS for either yet (docs/NEEDS-FROM-ELIAS.md
  // has the open item) — the chip still renders, honestly empty, rather
  // than silently dropping a sub-filter the owner named by hand.
  video: [],
  audio: [],
  sitesApps: ["site", "apps"],
  meetings: ["meetings"],
};

export function isMyStuffBucket(value: unknown): value is MyStuffBucket {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BUCKET_KINDS, value);
}
