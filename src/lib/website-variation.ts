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
//
// CORRECTION (V4 #32): this file used to state that the per-axis salt
// made the axes independent. It did not — see fnv1a below. Four of the
// six axes were correlated in production.

export type SiteVariation = {
  hero: string;
  grid: string;
  rhythm: string;
  typeScale: string;
  motion: string;
  /** Which of the chosen archetype's three section orders to build. THE
   *  STRUCTURAL AXIS — the other five are composition. */
  order: string;

  // ---- THE VISUAL AXES (V4 #32, sixth report) -----------------------
  //
  // The six axes above are STRUCTURE AND COMPOSITION, and after all six
  // shipped the report came back a sixth time. Measured over 400 seeds
  // the six spread well — 363 distinct draws — so the structural gates
  // were green and the complaint was still true.
  //
  // The four below are what a person actually perceives in the first
  // second: what colour it is, what it is set in, how much air it has,
  // and how it moves. Every one of them was left to PROSE IN THE CACHED
  // SYSTEM PROMPT ("derive the palette from the subject", "choose the
  // pairing from the shape") — which is precisely the mechanism this
  // module's own header records as having failed: the system prompt is
  // byte-identical on every call, so an instruction inside it is the
  // same instruction every time, and the model answers it the same way.
  //
  // Asking was already tried. These are drawn.
  palette: string;
  typeface: string;
  spacing: string;
  motionTiming: string;
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

/**
 * THE AXIS THAT WAS MISSING, and the reason "same template" was reported a
 * fifth time after the other five axes were added.
 *
 * Every SITE SHAPE in website-builder.ts used to hard-code ONE section
 * order, so two cafés were both `local-place` and were both instructed
 * into "photo > menu > hours > gallery > map". Hero, grid, rhythm, type
 * and motion all varied — and all five are COMPOSITION. The skeleton was
 * identical by construction, which is exactly what a person means when
 * they say two sites feel like the same template.
 *
 * Each shape now offers three orders, every one of them correct for that
 * subject, and this draw says which. That is a structural difference, not
 * a stylistic one.
 */
export const SECTION_ORDERS = [
  "A — the archetype's ORDER A, exactly as listed for the shape you chose",
  "B — the archetype's ORDER B, exactly as listed for the shape you chose",
  "C — the archetype's ORDER C, exactly as listed for the shape you chose",
  "D — the archetype's ORDER D, exactly as listed for the shape you chose",
  "E — the archetype's ORDER E, exactly as listed for the shape you chose",
  "F — the archetype's ORDER F, exactly as listed for the shape you chose",
] as const;

/**
 * THREE BECAME SIX, AND THE NUMBER IS THE WHOLE POINT.
 *
 * MEASURED, WITHOUT SPENDING ANYTHING. The order axis is a hash into this
 * list, so the probability that two sites of the same kind by two
 * different people get the same skeleton is exactly 1/length. At three it
 * was 33.3% — measured over 20,000 constructed pairs in
 * scripts/tests/section-order-space.test.mjs, which agrees with the
 * arithmetic because it IS the arithmetic. One pair in three came out as
 * the same skeleton BY CONSTRUCTION, and no amount of prompt wording
 * could have changed that: it is a property of the draw, not of the
 * model.
 *
 * That is the number scripts/website-pairs-check.mjs costs about $2.30 to
 * estimate for three pairs, and it estimates it with three samples.
 *
 * WHY SIX AND NOT TWELVE. Every shape in website-builder.ts must offer
 * every letter, and four of the seven (gallery, editorial, catalogue,
 * event) have exactly three sections that can move — their first section
 * is pinned by the shape's own FIRST line, and event's last is pinned
 * too. Three movable sections give 3! = 6 orders and not one more. Twelve
 * would mean either inventing sections those shapes do not have, or
 * letting two letters name the same order, which is the defect with extra
 * steps.
 *
 * A CONTRADICTION WAS FIXED ON THE WAY. Three shapes had an order that
 * did not start with their own FIRST section — local-place's C began with
 * the menu though the shape says a photograph comes "before any heading",
 * gallery's B began with the statement though the shape says the work
 * comes "before any headline at all", and catalogue's B began with the
 * filters though the shape says the items come first. The model was being
 * given two instructions that could not both be obeyed, and the sentence
 * introducing the orders already said what was meant: they differ in what
 * comes AFTER the opening.
 */
export const SECTION_ORDER_COUNT = SECTION_ORDERS.length;

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

/**
 * COLOUR — the axis with no draw at all until now.
 *
 * A STRATEGY, never hex. The palette still has to suit the subject (a
 * taverna is not a fintech, and line 384 of the prompt is right about
 * that); what was missing is that "suit the subject" leaves a model free
 * to reach for the same tasteful neutral-plus-accent every time, and it
 * does. The strategy is drawn; the actual colours are still derived from
 * the brief inside it.
 */
export const PALETTE_STRATEGIES = [
  "monochrome + one accent — a single hue at several lightnesses, plus exactly one saturated accent used sparingly",
  "warm analogous — three neighbouring warm hues (earth, terracotta, ochre range) with no cool tones anywhere",
  "cool analogous — three neighbouring cool hues (slate, teal, ink range) with no warm tones anywhere",
  "high-contrast near-black on near-white — colour enters ONLY through photography; the interface itself is achromatic",
  "duotone — the whole page built from exactly two strong hues plus their tints, including the images if any",
  "dark ground — a deep, low-lightness background throughout with one luminous accent; NOT a light page inverted",
] as const;

/**
 * TYPEFACE — likewise undrawn until now.
 *
 * TYPE_SCALES varies the RATIO (1.2 / 1.333 / 1.5). It never touched the
 * FACE, so every site could be set in the same pairing at three different
 * sizes and still score as varied. Every name here is in the prompt's own
 * GOOGLE_FONTS_LIST, so the draw can never name a font the model was not
 * told how to load.
 */
export const TYPE_PAIRINGS = [
  "'Fraunces' for headings, 'Karla' for body — a characterful modern serif over a plain grotesque",
  "'Space Grotesk' for headings, 'IBM Plex Sans' for body — technical, slightly odd, no warmth",
  "'Playfair Display' for headings, 'Source Sans 3' for body — classical high-contrast display over neutral text",
  "'Bebas Neue' for headings, 'Work Sans' for body — condensed all-caps display, quiet body",
  "'Cormorant Garamond' for headings AND body — one serif throughout, weight and size doing all the work",
  "'Archivo' for headings, 'Lora' for body — grotesque display over a readable serif, the reverse of the usual pairing",
  "'Outfit' for headings, 'Merriweather' for body — geometric sans over a sturdy text serif",
  "'Abril Fatface' for headings, 'Manrope' for body — heavy didone display, neutral sans beneath",
  "'Zilla Slab' for headings, 'Rubik' for body — slab display, rounded sans body",
  "'Bodoni Moda' for headings, 'Epilogue' for body — extreme-contrast didone over a modern grotesque",
] as const;

/**
 * SPACING — absolute, where SECTION_RHYTHMS is relative.
 *
 * "even / syncopated / crescendo" describes how padding VARIES between
 * sections. It never says how much padding there is, so a syncopated page
 * and an even page can both sit at whatever the model defaults to — and
 * a page's density is one of the first things read as "same template".
 */
export const SPACING_SCALES = [
  "tight — 8px base unit; section padding around 48px; a dense, information-first page",
  "standard — 8px base unit; section padding around 80px",
  "airy — 12px base unit; section padding around 120px; deliberate emptiness",
  "cavernous — 16px base unit; section padding around 160px; each section nearly its own screen",
] as const;

/**
 * MOTION TIMING — the numbers, drawn.
 *
 * MOTION_VOCABULARIES names the FEEL and gives ranges ("400-600ms",
 * "60-90ms apart"). The ANIMATIONS section of the cached system prompt
 * gave the model copy-pasteable CSS with FIXED literals: 0.7s and 24px
 * for the reveal, 0.3s and -6px for the lift, 12s for the gradient,
 * 0.6s and calc(n * 0.1s) for the stagger.
 *
 * A concrete snippet beats a prose range every time, so the promised
 * 400-600ms shipped as 700ms and the promised 60-90ms shipped as 100ms —
 * on every animated site ever generated. Identical motion timing is a
 * signature a person reads instantly, whatever the layout does.
 *
 * The snippet now carries placeholder tokens (the same trick its own
 * gradient already used for COLOR_1..COLOR_4) and these values arrive in
 * the per-site directive, so the cached prompt stays byte-identical.
 */
export const MOTION_TIMINGS = [
  "snappy — 180ms, 6px travel, ease; stagger 50ms apart; ambient loop 6s",
  "brisk — 260ms, 10px travel, cubic-bezier(0.2, 0, 0, 1); stagger 70ms apart; ambient loop 9s",
  "measured — 450ms, 16px travel, ease-out; stagger 90ms apart; ambient loop 14s",
  "slow — 700ms, 24px travel, cubic-bezier(0.16, 1, 0.3, 1); stagger 120ms apart; ambient loop 20s",
  "languid — 900ms, 32px travel, ease-in-out; stagger 160ms apart; ambient loop 28s",
] as const;

/**
 * FNV-1a, PLUS AN AVALANCHE STEP — and the second half is not optional.
 *
 * THE BUG THIS FIXES WAS ALREADY SHIPPED. Measured over 2,000 seeds,
 * `grid` x `motion` produced 12 of its 24 possible combinations: every
 * even grid index drew an even motion index and every odd drew odd. Four
 * of the six axes were really three.
 *
 * WHY. FNV-1a's round is `hash ^= byte; hash *= 0x01000193`. The
 * multiplier is ODD, and multiplying by an odd number PRESERVES THE
 * LOWEST BIT. So bit 0 of the final hash is just the initial bit 0 xored
 * with the low bits of every input byte — the multiply never touches it.
 * Two salted strings over the same seed therefore differ in bit 0 by a
 * CONSTANT (the salt's own contribution), and `% 4` or `% 6` read bit 0
 * directly. Odd-length lists were unaffected, which is why hero (5) x
 * motion (6) was a clean 30 of 30 and nobody noticed.
 *
 * The module comment above used to claim the per-axis salt made the axes
 * independent. It did not, and could not: no salt can decorrelate a bit
 * that the mixing function never mixes.
 *
 * fmix32 (the MurmurHash3 finaliser) shifts high bits down and multiplies
 * twice, so every output bit depends on every input bit.
 *
 * The draw for a given seed CHANGES with this fix. That is one-time and
 * harmless: generated HTML is stored, so no existing site regenerates by
 * itself, and determinism — the same seed giving the same draw — is what
 * matters and still holds.
 */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // fmix32 avalanche.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * THE ORDER AXIS IS A CYCLE, NOT A DRAW, and that is the difference
 * between "probably different" and a promise.
 *
 * MEASURED BEFORE THE CHANGE, over 4,000 constructed users in
 * scripts/tests/section-order-space.test.mjs: with the order hashed like
 * every other axis, 59.9% of a person's second-to-fifth sites landed on a
 * skeleton they had already been given, and 1.0% of people got the SAME
 * order for all five. Hashing an independent value per site cannot avoid
 * that — a fair die repeats.
 *
 * So the order is drawn ONCE per person and then stepped: their first
 * site takes a hashed starting letter, their next takes the one after it,
 * and so on. A person's first SECTION_ORDER_COUNT sites therefore use
 * every letter exactly once, and the seventh is the first repeat rather
 * than the second.
 *
 * WHAT IT DOES NOT DO. Two DIFFERENT people still collide at 1 in
 * SECTION_ORDER_COUNT on their first sites, and nothing here can change
 * that: their draws cannot see each other, and a scheme that made them
 * would have to remember what every account was given.
 *
 * WHEN THE COUNT MOVES BACKWARDS. `priorSites` is a live count of the
 * person's rows, so deleting a site steps the cycle back and the next
 * generation reuses the letter that deleted site had. That is the correct
 * behaviour rather than a hole: the site it would have collided with no
 * longer exists.
 */
export function orderIndexFor(userKey: string, priorSites: number, count: number): number {
  const base = fnv1a(`order::${userKey}`) % count;
  // A NEGATIVE OR FRACTIONAL COUNT IS NOT A CYCLE. `priorSites` arrives
  // from a database count that can be null; the caller passes 0, but a
  // remainder of a negative number is negative in JavaScript and would
  // index off the front of the list, so it is normalised here rather than
  // trusted.
  const step = Number.isFinite(priorSites) ? Math.max(0, Math.floor(priorSites)) : 0;
  return (base + step) % count;
}

/**
 * One draw per axis. Each axis hashes with its own salt, and the hash
 * avalanches (see fnv1a above) so the salt actually separates them —
 * without BOTH, lists whose lengths share a factor correlate and two
 * axes become one.
 *
 * `cycle` is what turns the ORDER axis from a draw into the walk
 * described above. It is optional because the two measurement scripts
 * (website-pairs-check, website-variety-check) construct seeds that have
 * no user behind them; production passes it, and
 * scripts/tests/website-variation.test.mjs requires the route to, because
 * an exclusion that is computed and not delivered is the shape this
 * module's own header records having shipped once already.
 */
export function pickVariation(
  seedParts: (string | number)[],
  cycle?: { userKey: string; priorSites: number }
): SiteVariation {
  const seed = seedParts.join("::");
  const pick = <T,>(list: readonly T[], salt: string): T =>
    list[fnv1a(`${salt}::${seed}`) % list.length];
  return {
    hero: pick(HERO_PATTERNS, "hero"),
    grid: pick(LAYOUT_GRIDS, "grid"),
    rhythm: pick(SECTION_RHYTHMS, "rhythm"),
    typeScale: pick(TYPE_SCALES, "type"),
    motion: pick(MOTION_VOCABULARIES, "motion"),
    order: cycle
      ? SECTION_ORDERS[orderIndexFor(cycle.userKey, cycle.priorSites, SECTION_ORDERS.length)]
      : pick(SECTION_ORDERS, "order"),
    palette: pick(PALETTE_STRATEGIES, "palette"),
    typeface: pick(TYPE_PAIRINGS, "typeface"),
    spacing: pick(SPACING_SCALES, "spacing"),
    motionTiming: pick(MOTION_TIMINGS, "motiontiming"),
  };
}

/**
 * The directive text. Placed in the USER message (never the cached system
 * block), BEFORE the user's brief — the brief stays last and still wins.
 */
export function variationDirective(v: SiteVariation): string {
  return `DESIGN VARIATION FOR THIS SITE — drawn for this generation specifically; a different site gets a different draw. This is what keeps two sites from feeling like the same template, so treat each line as a decision already made:
- SECTION ORDER: ${v.order}
- HERO: ${v.hero}
- LAYOUT GRID: ${v.grid}
- SECTION RHYTHM: ${v.rhythm}
- TYPE SCALE: ${v.typeScale}
- MOTION VOCABULARY: ${v.motion}
- PALETTE STRATEGY: ${v.palette}
- TYPE PAIRING: ${v.typeface}
- SPACING SCALE: ${v.spacing}
- MOTION TIMING: ${v.motionTiming}
PALETTE STRATEGY, TYPE PAIRING, SPACING SCALE and MOTION TIMING are the VISUAL lines, and they are decisions, not suggestions. Two sites can have different section orders and still be called the same template if they are the same colour, set in the same fonts, at the same density, moving at the same speed — that is what a person sees in the first second. Derive the actual hex values from the subject WITHIN the named strategy; load exactly the two font families named; use the named base unit and section padding; and wherever the ANIMATIONS section of your instructions shows the tokens MOTION_DURATION, MOTION_DISTANCE, MOTION_EASING, MOTION_STAGGER or MOTION_AMBIENT, substitute the numbers from the MOTION TIMING line above instead of inventing your own. If the MOTION VOCABULARY line is "static", emit no motion at all and ignore the timing.
SECTION ORDER is the structural line and the one that is not negotiable: pick your archetype by subject as instructed, then build ITS order of the letter named above — not the first one listed, not the one you would have chosen. Two sites of the same kind built in the same order is the "same template" defect, and it is what this line exists to prevent. The other five lines decide how those sections are composed. The shape's NEVER list still stands: if it forbids animation or gradients, use static motion regardless of the draw. And if THE USER'S BRIEF below asks for something different, the brief beats everything here.`;
}
