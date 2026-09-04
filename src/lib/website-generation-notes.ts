/**
 * WHAT THE CODE DID TO A GENERATED SITE, AS FACTS — V4.6.
 *
 * The worker (api/websites/generate/process) enforces three things after
 * the model has written the site: a feature the brief forbade is removed,
 * a page beyond MAX_PAGES_PER_SITE is never paid for, a map is zoomed to
 * the building. Each is written to user_websites.generation_notes as one
 * of these records, and the workspace renders them through its own
 * translations — "Αφαίρεσα την online κράτηση όπως ζήτησες" is built by
 * the reader's locale, never stored as a sentence in the writer's.
 *
 * Shared by the worker and the client, so it imports nothing that either
 * cannot load.
 */
import type { NegativeFeature } from "@/lib/website-negative-instructions";

export type GenerationNote =
  /** Elements that WERE the forbidden feature, removed from the pages. */
  | { kind: "removedFeature"; feature: NegativeFeature; count: number }
  /** A whole page that was the forbidden feature, dropped with its nav link. */
  | { kind: "removedPage"; feature: NegativeFeature; slug: string }
  /** The stream was stopped when page cap+1 began; `started` pages were begun. */
  | { kind: "pageCap"; cap: number; started: number }
  /** Google Maps embeds rewritten to building zoom with a marker. */
  | { kind: "mapZoom"; count: number }
  /** The owner pressed Stop; `credits` is what the produced part cost them. */
  | { kind: "stopped"; credits: number }
  /** Greek words on the page a spelling pass flagged. REPORTED, never
   *  rewritten: one of these may be a brand, a village or a surname, and
   *  silently "correcting" somebody's own business name is worse than the
   *  typo. See lib/website-greek-spelling.ts. */
  | { kind: "spelling"; words: string[] };

const FEATURES: readonly NegativeFeature[] = [
  "booking", "contactForm", "newsletter", "map", "prices", "gallery", "testimonials", "blog", "social", "chatWidget",
];

const isKnownFeature = (v: unknown): v is NegativeFeature => typeof v === "string" && (FEATURES as readonly string[]).includes(v);
const isNonNegativeInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** The column as stored, read defensively: anything malformed is dropped, never thrown. */
export function parseGenerationNotes(raw: unknown): GenerationNote[] {
  if (!Array.isArray(raw)) return [];
  const out: GenerationNote[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const n = entry as Record<string, unknown>;
    if (n.kind === "removedFeature" && isKnownFeature(n.feature) && isNonNegativeInt(n.count) && n.count > 0) {
      out.push({ kind: "removedFeature", feature: n.feature, count: n.count });
    } else if (n.kind === "removedPage" && isKnownFeature(n.feature) && typeof n.slug === "string" && n.slug.length > 0) {
      out.push({ kind: "removedPage", feature: n.feature, slug: n.slug.slice(0, 60) });
    } else if (n.kind === "pageCap" && isNonNegativeInt(n.cap) && n.cap > 0 && isNonNegativeInt(n.started) && n.started > n.cap) {
      out.push({ kind: "pageCap", cap: n.cap, started: n.started });
    } else if (n.kind === "mapZoom" && isNonNegativeInt(n.count) && n.count > 0) {
      out.push({ kind: "mapZoom", count: n.count });
    } else if (n.kind === "stopped" && isNonNegativeInt(n.credits)) {
      out.push({ kind: "stopped", credits: n.credits });
    } else if (n.kind === "spelling" && Array.isArray(n.words)) {
      // Read as defensively as every other note: only strings, only the
      // ones with something in them, capped so a malformed row cannot
      // render a wall of text beside the preview.
      const words = n.words.filter((w): w is string => typeof w === "string" && w.trim().length > 0).slice(0, 20);
      if (words.length > 0) out.push({ kind: "spelling", words });
    }
  }
  return out;
}
