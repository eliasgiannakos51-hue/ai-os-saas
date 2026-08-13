/**
 * The closed vocabulary of MOTION for generated websites, and which
 * vocabularies each site archetype is allowed to choose from.
 *
 * WHY THIS IS A MODULE AND NOT JUST PROSE IN THE PROMPT.
 *
 * The SITE SHAPE fix changed what a generated page is MADE OF — its
 * archetype, its section order, its type and density. The complaint came
 * back anyway, and accurately: "ίδια animations, ίδια συμπεριφορά, ίδιο
 * feel". Structure was varying; BEHAVIOUR was not. Every page still faded
 * its sections up on the same scroll trigger over the same 0.7 seconds and
 * lifted the same 6px under the cursor, because the prompt's only guidance
 * on movement was five reference snippets and "use one, or none" — which
 * leaves the choice unmade, and an unmade choice resolves to the model's
 * strongest prior.
 *
 * So motion is now the same kind of object the archetype already is: a
 * closed list, chosen deliberately, declared in writing, and checkable
 * afterwards. This file is the single source of truth for that list.
 *
 * Three separate places need to agree about it and used to have no way to:
 *   - the generation prompt (lib/website-builder.ts) interpolates the names
 *     and the per-archetype permissions straight from here, so the prose a
 *     model reads cannot drift from the spec,
 *   - the measuring instrument (scripts/lib/site-fingerprint.mjs) reads a
 *     declared vocabulary back off a finished page and checks the CSS
 *     actually matches it,
 *   - the tests assert the two are the same list.
 *
 * Pure and dependency-free on purpose — no "server-only", no Next, no SDK
 * — so it is unit-testable through scripts/tests/load-ts.mjs's strict
 * loader, the one that refuses any external import.
 */

export const MOTION_VOCABULARIES = [
  "still",
  "subtle",
  "editorial",
  "bold",
  "playful",
  "cinematic",
] as const;

export type MotionVocabulary = (typeof MOTION_VOCABULARIES)[number];

export const SITE_ARCHETYPES = [
  "local-place",
  "professional-services",
  "gallery",
  "editorial",
  "catalogue",
  "event",
  "product-landing",
] as const;

export type SiteArchetype = (typeof SITE_ARCHETYPES)[number];

/**
 * Which vocabularies each archetype may choose from.
 *
 * These are deliberately NOT one-to-one. A one-to-one mapping would make
 * motion a synonym for archetype — it would add no variety at all, and two
 * cafés would move identically forever. Two or three options per archetype
 * is what lets one taverna be `cinematic` and the next `playful` while
 * still making it impossible for a barrister's page to bounce.
 *
 * Every set is small enough to be a real constraint and every exclusion is
 * a judgement about the subject, not a formatting preference:
 * professional-services excludes everything but stillness because movement
 * on a page selling judgement reads as advertising; product-landing
 * excludes `cinematic` because slow, heavy motion on a product page reads
 * as a product that is slow.
 */
export const ARCHETYPE_MOTION: Record<SiteArchetype, readonly MotionVocabulary[]> = {
  "local-place": ["subtle", "cinematic", "playful"],
  "professional-services": ["still", "subtle"],
  gallery: ["still", "cinematic"],
  editorial: ["still", "editorial"],
  catalogue: ["still", "subtle"],
  event: ["bold", "cinematic", "playful"],
  "product-landing": ["subtle", "bold", "playful"],
};

export function isMotionVocabulary(value: string): value is MotionVocabulary {
  return (MOTION_VOCABULARIES as readonly string[]).includes(value);
}

export function isSiteArchetype(value: string): value is SiteArchetype {
  return (SITE_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Is this pairing permitted? Returns false for an unknown archetype or an
 * unknown vocabulary rather than throwing — the caller is grading a model's
 * free-text declaration, and "the model wrote a word that is not on the
 * list" is a finding to report, not an exception to crash on.
 */
export function isMotionAllowedForArchetype(archetype: string, motion: string): boolean {
  if (!isSiteArchetype(archetype) || !isMotionVocabulary(motion)) return false;
  return ARCHETYPE_MOTION[archetype].includes(motion);
}

/** "subtle | cinematic | playful" — the exact form the prompt prints. */
export function allowedMotionFor(archetype: SiteArchetype): string {
  return ARCHETYPE_MOTION[archetype].join(" | ");
}

/**
 * The reduced-motion escape hatch every non-`still` page must carry.
 *
 * Exported rather than only written into the prompt so the fingerprint can
 * check for it by the same definition the model was given, instead of by a
 * second, hand-written regex that could disagree with it.
 */
export const REDUCED_MOTION_BLOCK = `@media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
    }`;
