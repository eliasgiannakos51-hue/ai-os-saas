// The deck model — one definition, shared by everything that touches a
// slide.
//
// Client-safe on purpose. Four things consume this shape: the generator
// (server), the editor (browser), the PDF/print view (browser) and the
// PPTX writer (server). A second copy of "what a slide is" in any of them
// is how a deck ends up rendering one way on screen and another way in
// the file the user sends to their board.
//
// The layout set is CLOSED and small. Every renderer must handle every
// member, so each one added costs four implementations — which is the
// right price, because a layout the PPTX writer silently drops is a slide
// that vanishes from the export with no error anywhere.

export const SLIDE_LAYOUTS = [
  // Opening slide: big title, one supporting line.
  "title",
  // Divider between parts of the deck.
  "section",
  // The workhorse: title + bullets.
  "bullets",
  // Same content, split across two columns — for comparisons and
  // before/after, where a single column reads as one list.
  "two_column",
  // A single quoted line, attributed.
  "quote",
  // Image dominant, short caption.
  "image",
  // Image beside the bullets.
  "image_bullets",
  // Closing slide: the ask, the next step, the thank-you.
  "closing",
] as const;

export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

export function isSlideLayout(value: unknown): value is SlideLayout {
  return typeof value === "string" && (SLIDE_LAYOUTS as readonly string[]).includes(value);
}

export type Slide = {
  /** Stable across edits and reorders — React keys, drag-and-drop and
   *  "edit slide 3" all need an identity that survives a move. Index
   *  does not: reordering renames every slide after the moved one. */
  id: string;
  title: string;
  bullets: string[];
  /** Shown under the slide in the editor and exported into the PPTX
   *  notes pane. Never rendered on the slide itself. */
  speakerNotes: string;
  layout: SlideLayout;
  /** What the AI thinks should be pictured here, as a SEARCH QUERY —
   *  "team collaborating in a bright office", not a URL. Kept even after
   *  an image is resolved so the user can re-roll the photo, and so a
   *  deck whose images failed to resolve still says what it wanted. */
  imageSuggestion: string | null;
  /** Resolved photo URL (Unsplash), or null when photos are not
   *  configured, the search came back empty, or the layout has no image.
   *  Always nullable: an image is decoration, and a decoration that can
   *  fail a whole generation is a bad trade. */
  imageUrl: string | null;
};

// ---------------------------------------------------------------------
// Size limits.
// ---------------------------------------------------------------------
//
// These bound three different things and are not interchangeable:
//
//   SLIDE COUNT   — the deck's cost and the reservation's size.
//   TEXT LENGTHS  — what fits on a rendered slide. A 600-character
//                   "bullet" is not a bullet, and it overflows every
//                   theme and both exporters.
//   NOTES         — the only field allowed to be long, because it is
//                   never laid out on the slide.

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 30;
/** What the generator aims for when the user does not say. Long enough
 *  to be a real deck, short enough that nobody sits through it. */
export const DEFAULT_SLIDE_COUNT = 10;

export const MAX_TITLE_CHARS = 120;
export const MAX_BULLETS_PER_SLIDE = 8;
export const MAX_BULLET_CHARS = 240;
export const MAX_NOTES_CHARS = 1500;
export const MAX_IMAGE_QUERY_CHARS = 160;

export const MIN_BRIEF_CHARS = 10;
export const MAX_BRIEF_CHARS = 2000;
/** One instruction to the AI editor ("make slide 3 shorter"). */
export const MAX_EDIT_INSTRUCTION_CHARS = 500;

export const MAX_DECK_TITLE_CHARS = 160;

// ---------------------------------------------------------------------
// Normalisation.
// ---------------------------------------------------------------------

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Control characters are stripped, and written as escapes rather than
  // as themselves: a literal 0x0B in this file makes the whole module a
  // "binary file" to grep, and several build gates in scripts/tests grep
  // source. They matter beyond tidiness too -- XML 1.0 forbids most of
  // them, so one stray control byte in a title produces a .pptx that
  // PowerPoint refuses to open. Tab and newline become spaces instead of
  // vanishing, because a model does sometimes wrap a long bullet.
  return value
    .replace(/[\t\n\r]+/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Turn whatever came back from the model — or out of the database, or in
 * off the wire from the editor — into a Slide that every renderer can
 * handle.
 *
 * Total, never throwing, and never rejecting: a deck is the user's work,
 * and losing all of it because one bullet was a number is not a
 * defensible failure mode. Anything unusable becomes its safe empty
 * equivalent and the slide survives.
 *
 * `index` only seeds the fallback id, so a model that returns slides
 * without ids still produces stable keys within one parse.
 */
export function normaliseSlide(raw: unknown, index: number): Slide {
  const src = (raw ?? {}) as Record<string, unknown>;

  const layout = isSlideLayout(src.layout)
    ? src.layout
    : // `layout_type` is the name the generation tool schema uses (and
      // the name the task brief uses). Accepted here so the tool schema
      // can stay readable without a translation step at every call site.
      isSlideLayout(src.layout_type)
      ? (src.layout_type as SlideLayout)
      : "bullets";

  const rawBullets = Array.isArray(src.bullets) ? src.bullets : [];
  const bullets = rawBullets
    .map((b) => clean(b, MAX_BULLET_CHARS))
    .filter((b) => b.length > 0)
    .slice(0, MAX_BULLETS_PER_SLIDE);

  const imageSuggestion =
    clean(src.imageSuggestion ?? src.image_suggestion, MAX_IMAGE_QUERY_CHARS) || null;

  const imageUrlRaw = typeof src.imageUrl === "string" ? src.imageUrl : "";
  // Only https. An http image on an https page is blocked as mixed
  // content and shows as a broken box; a data: URL here would let a
  // generated deck carry arbitrary inline payload into the exports.
  const imageUrl = /^https:\/\//.test(imageUrlRaw) ? imageUrlRaw.slice(0, 2000) : null;

  return {
    id: typeof src.id === "string" && src.id.trim() ? src.id.trim().slice(0, 64) : `s${index + 1}`,
    title: clean(src.title, MAX_TITLE_CHARS),
    bullets,
    speakerNotes: clean(src.speakerNotes ?? src.speaker_notes, MAX_NOTES_CHARS),
    layout,
    imageSuggestion,
    imageUrl,
  };
}

/**
 * Normalise a whole deck and enforce the slide ceiling.
 *
 * Slides with no title AND no bullets are dropped — an empty slide is
 * never what anyone meant, and it survives into the export as a blank
 * page the user has to notice and delete themselves.
 */
export function normaliseSlides(raw: unknown): Slide[] {
  if (!Array.isArray(raw)) return [];
  const out: Slide[] = [];
  for (const item of raw) {
    const slide = normaliseSlide(item, out.length);
    if (!slide.title && slide.bullets.length === 0) continue;
    out.push(slide);
    if (out.length >= MAX_SLIDES) break;
  }
  return out;
}

/**
 * Give every slide in a deck a unique id.
 *
 * Called after any operation that can introduce a duplicate: a model
 * that echoed an id back, a duplicated slide, a merge of two decks.
 * Duplicate React keys silently render the wrong slide's content into
 * the wrong position, which looks exactly like the AI edit having gone
 * wrong.
 */
export function withUniqueIds(slides: Slide[]): Slide[] {
  const seen = new Set<string>();
  return slides.map((slide, index) => {
    let id = slide.id || `s${index + 1}`;
    if (seen.has(id)) {
      let n = index + 1;
      while (seen.has(`s${n}`)) n++;
      id = `s${n}`;
    }
    seen.add(id);
    return { ...slide, id };
  });
}

/** Does this layout render an image? The editor uses it to decide
 *  whether to offer a photo control, and the generator to decide whether
 *  to spend an Unsplash lookup. */
export function layoutUsesImage(layout: SlideLayout): boolean {
  return layout === "image" || layout === "image_bullets";
}

/** Characters of real content in a deck. Used to size the reservation
 *  for an AI edit, where the whole deck is the input. */
export function deckCharCount(slides: Slide[]): number {
  let total = 0;
  for (const slide of slides) {
    total += slide.title.length + slide.speakerNotes.length;
    for (const bullet of slide.bullets) total += bullet.length;
  }
  return total;
}
