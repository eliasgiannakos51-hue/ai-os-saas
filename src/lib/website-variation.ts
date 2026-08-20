// Per-site design variation — CHOSEN BY CODE, not left to the model.
//
// WHAT WAS REPORTED, four times: every generated site has the same
// template feel. The prompt already ASKS for variety (SITE_SHAPE_SECTION's
// "VARY THESE DELIBERATELY" axes), but asking is all it did: the system
// prompt is byte-identical on every call (deliberately, for prompt
// caching), no temperature is set, and nothing per-site ever told the
// model WHICH hero, grid, rhythm or motion to use. Same brief shape in,
// same page shape out. Worse, each SITE SHAPE hard-codes a section ORDER,
// so two cafés were explicitly instructed into the same skeleton.
//
// This module is the missing selection step. A deterministic draw —
// seeded by who is generating, their site count and the brief — picks one
// value per axis, and the directive rides in the UNCACHED user message,
// so the cached system prompt stays byte-identical and the cache keeps
// hitting. Deterministic on purpose: the same person regenerating the
// same brief gets the same draw (reproducible), while their NEXT site
// draws differently because the site count moved.
//
// Pure and dependency-free so tests can call it directly.

export type SiteVariation = {
  hero: string;
  grid: string;
  rhythm: string;
  typeScale: string;
  motion: string;
};

// Aligned with the self-declaration enum in website-builder.ts
// (`hero: <one of: full-bleed-photo | split | typographic | asymmetric |
// none>`), so the draw and the page's own declaration speak one language.
export const HERO_PATTERNS = [
  "full-bleed-photo — a photograph fills the first viewport; the heading sits on or over it",
  "split — heading and supporting copy on one side, an image or graphic on the other",
  "typographic — no hero image at all; an oversized headline IS the hero",
  "asymmetric — an off-centre composition with deliberate empty space on one side",
  "none — no hero band: the page begins directly with its first real content section",
] as const;

export const LAYOUT_GRIDS = [
  "single column with generous margins, content max-width around 65ch",
  "12-column grid with content spanning asymmetric ranges (e.g. columns 2-8, then 5-12)",
  "alternating two-column bands that swap image/text sides each section",
  "modular card grid with ONE deliberately oversized feature cell",
] as const;

export const SECTION_RHYTHMS = [
  "even — the same vertical padding on every section",
  "syncopated — alternating tight and airy sections",
  "crescendo — sections get progressively airier toward the final call to action",
] as const;

export const TYPE_SCALES = [
  "compact — modular ratio ~1.2, quiet headings, dense and businesslike",
  "editorial — ratio ~1.333 with ONE oversized display size reserved for the hero",
  "dramatic — ratio ~1.5+, huge headlines, few words per line",
] as const;

// THE SIX MOTION VOCABULARIES. Each names the feel and the mechanics; the
// concrete CSS lives in the system prompt's ANIMATIONS section, so the
// model implements a pattern it was already given rather than improvising.
export const MOTION_VOCABULARIES = [
  "static — no scroll or entrance animation anywhere; presence comes from typography and spacing alone",
  "fade-rise — content blocks fade in and rise ~14px as they enter the viewport, 400-600ms, once, via the reveal-on-scroll pattern",
  "stagger — grid/list children animate in sequence, 60-90ms apart, so groups arrive as a cascade",
  "slide-from-edge — alternating sections slide in subtly (~24px) from left and right",
  "scale-settle — cards and images scale from 0.96 to 1 with a soft shadow settling as they enter",
  "drift — ONE slow ambient movement in the hero only (gradient shift or floating shape); everything else static",
] as const;

/** FNV-1a — tiny, stable, good-enough spread for picking indices. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * One draw per axis. Each axis hashes with its own salt so the axes are
 * independent — without the salt, lists whose lengths share a factor
 * would correlate (the same seed picking index 2 everywhere).
 */
export function pickVariation(seedParts: (string | number)[]): SiteVariation {
  const seed = seedParts.join("::");
  const pick = <T,>(list: readonly T[], salt: string): T =>
    list[fnv1a(`${salt}::${seed}`) % list.length];
  return {
    hero: pick(HERO_PATTERNS, "hero"),
    grid: pick(LAYOUT_GRIDS, "grid"),
    rhythm: pick(SECTION_RHYTHMS, "rhythm"),
    typeScale: pick(TYPE_SCALES, "type"),
    motion: pick(MOTION_VOCABULARIES, "motion"),
  };
}

/**
 * The directive text. Placed in the USER message (never the cached system
 * block), BEFORE the user's brief — the brief stays last and still wins.
 */
export function variationDirective(v: SiteVariation): string {
  return `DESIGN VARIATION FOR THIS SITE — drawn for this generation specifically; a different site gets a different draw. This is what keeps two sites from feeling like the same template, so treat each line as a decision already made:
- HERO: ${v.hero}
- LAYOUT GRID: ${v.grid}
- SECTION RHYTHM: ${v.rhythm}
- TYPE SCALE: ${v.typeScale}
- MOTION VOCABULARY: ${v.motion}
Where these conflict with the chosen SITE SHAPE's ORDER or FIRST guidance, THESE win — the shape decides what sections exist, this draw decides how they are composed. The shape's NEVER list still stands: if it forbids animation or gradients, use static motion regardless of the draw. And if THE USER'S BRIEF below asks for something different, the brief beats everything here.`;
}
