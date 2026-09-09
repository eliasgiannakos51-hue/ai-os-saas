/**
 * A DECK, AS DATA — the shape every other file in this feature reads.
 *
 * /dashboard/presentations was a CRUD tracker: a title, a description
 * and a "slide count" the user typed by hand, and a sidebar tooltip that
 * had to say "It does not create slides" so nobody expected otherwise.
 * V5 #21 is the version that creates them. This file is the contract
 * between the four halves of that — the model call that writes the deck
 * (generate.ts), the two exporters that lay it out (pptx.ts, pdf.tsx),
 * the page that shows it — and it is PURE on purpose: no SDK, no
 * database, no "server-only", so scripts/tests/presentations.test.mjs can
 * load it and check every bound below against the real values.
 *
 * WHAT A SLIDE IS, and what it is not. Five layouts, all of them one
 * title plus a bounded amount of text: a deck this feature produces is
 * something a person presents from, not a poster. There is no free
 * positioning, no chart, no table, no animation, and the exporters do
 * not pretend otherwise — a .pptx from here opens in PowerPoint as
 * editable text boxes and the person finishes it there. That is the
 * honest scope, and the page says it (presentations.limits.* in the
 * catalogue).
 *
 * EVERY BOUND IS APPLIED TWICE. The model is TOLD the limits in the
 * prompt, and parseDeckToolInput CLAMPS whatever comes back: a title
 * longer than MAX_TITLE_CHARS is cut, a seventh bullet is dropped, a
 * twenty-first slide is dropped. A prompt rule is a request; the parser
 * is the guarantee, and the exporters lay out against the guarantee.
 */

/** The layouts a slide may have. The model picks one per slide. */
export const SLIDE_LAYOUTS = ["title", "bullets", "section", "quote", "image"] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

export function isSlideLayout(value: unknown): value is SlideLayout {
  return typeof value === "string" && (SLIDE_LAYOUTS as readonly string[]).includes(value);
}

/**
 * Where a slide's picture comes from. Chosen ONCE per deck, before
 * generation, and the model never sees the choice — it writes an
 * `imageQuery` for slides that would benefit from a photo, and the
 * route decides what to do with that query:
 *
 *   unsplash  search Unsplash for it (lib/unsplash.ts); the photo is
 *             hotlinked in the viewer and its use registered, exactly
 *             the way the Website Builder does it
 *   own       the person uploaded their own photos; they are handed out
 *             to the slides that asked for one, in order
 *   none      no pictures at all — the query is discarded
 */
export const IMAGE_SOURCES = ["unsplash", "own", "none"] as const;
export type ImageSource = (typeof IMAGE_SOURCES)[number];

export function isImageSource(value: unknown): value is ImageSource {
  return typeof value === "string" && (IMAGE_SOURCES as readonly string[]).includes(value);
}

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 20;
export const DEFAULT_SLIDES = 10;

/** The description box. Longer than this is a document, not a brief. */
export const MAX_DESCRIPTION_CHARS = 4_000;
export const MIN_DESCRIPTION_CHARS = 10;

export const MAX_TITLE_CHARS = 90;
export const MAX_BULLETS = 6;
export const MAX_BULLET_CHARS = 140;
export const MAX_NOTES_CHARS = 700;
export const MAX_IMAGE_QUERY_CHARS = 60;

/**
 * Own photos: more than the three Create Anything accepts, because a
 * deck has more places for a picture than a chat message does, and
 * fewer than MAX_SLIDES because a photo on every slide is a slideshow,
 * not a presentation.
 */
export const MAX_OWN_IMAGES = 10;

/**
 * Characters one slide comes to, measured from the bounds above rather
 * than guessed: a 90-character title, six 140-character bullets, a
 * 700-character note and a 60-character query is 1,690 at the ceiling,
 * and a typical slide (title 45, four bullets of 80, a 350-character
 * note, a query) is ~750. The estimate is sized to the ceiling — see
 * deckEstimateInputChars, and the profile comment in
 * lib/billing/estimate.ts for why over-holding is the safe direction.
 */
export const SLIDE_OUTPUT_CHARS = 1_000;

export type UnsplashSlideImage = {
  kind: "unsplash";
  url: string;
  photographerName: string;
  photographerUrl: string;
  downloadLocation: string;
};

export type OwnSlideImage = {
  kind: "own";
  /** A path inside the create-attachments bucket, under the user's own
   *  folder — the only place storage RLS lets them read or write. */
  path: string;
};

export type SlideImage = UnsplashSlideImage | OwnSlideImage;

export type Slide = {
  layout: SlideLayout;
  title: string;
  bullets: string[];
  /** Speaker notes: what to SAY on this slide. Exported as notes in
   *  .pptx and as a footer line in the PDF. */
  notes: string;
  /** What the model wanted a picture of, or null. Kept even when a photo
   *  was found, so a re-export with a different source can search again. */
  imageQuery: string | null;
  image: SlideImage | null;
};

export type Deck = {
  version: 1;
  title: string;
  /** The language the deck is WRITTEN in (resolveLanguage over the
   *  description), which decides the PDF's font order and direction. */
  locale: string;
  imageSource: ImageSource;
  slides: Slide[];
};

/** Bound the deck's slide count to what the exporters lay out. */
export function clampSlideCount(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEFAULT_SLIDES;
  return Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, n));
}

function clip(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export type DeckVerdict = { ok: true; deck: Deck } | { ok: false; reason: "no_slides" | "no_title" };

/**
 * The model's tool input, made safe.
 *
 * Nothing the model returns is trusted to be within bounds — the parser
 * clamps every string and every count, drops empty bullets, and refuses
 * only when there is nothing to show at all (no slides, or no title
 * anywhere). A deck with one slide too few is still a deck; a deck with
 * one slide too many is cut to MAX_SLIDES rather than refused, because
 * the tokens were spent and the person is owed the result.
 *
 * `keepImages` is for a deck read back from the database (see
 * parseStoredDeck): the model never returns an image, so the default
 * drops the field, and a stored row's images go through parseSlideImage
 * with the same suspicion as everything else.
 */
export function parseDeckToolInput(
  raw: unknown,
  context: { locale: string; imageSource: ImageSource; fallbackTitle: string },
  options: { keepImages?: boolean } = {}
): DeckVerdict {
  const input = (raw ?? {}) as Record<string, unknown>;
  const rawSlides = Array.isArray(input.slides) ? input.slides : [];
  const slides: Slide[] = [];
  for (const entry of rawSlides) {
    if (slides.length >= MAX_SLIDES) break;
    const s = (entry ?? {}) as Record<string, unknown>;
    const title = clip(s.title, MAX_TITLE_CHARS);
    const bullets = (Array.isArray(s.bullets) ? s.bullets : [])
      .map((b) => clip(b, MAX_BULLET_CHARS))
      .filter((b) => b.length > 0)
      .slice(0, MAX_BULLETS);
    const notes = clip(s.notes, MAX_NOTES_CHARS);
    if (!title && bullets.length === 0) continue;
    const layout = isSlideLayout(s.layout) ? s.layout : bullets.length > 0 ? "bullets" : "section";
    const query = clip(s.imageQuery, MAX_IMAGE_QUERY_CHARS);
    slides.push({
      layout,
      title,
      bullets,
      notes,
      imageQuery: query.length > 0 ? query : null,
      image: options.keepImages ? parseSlideImage(s.image) : null,
    });
  }
  if (slides.length === 0) return { ok: false, reason: "no_slides" };
  const title = clip(input.title, MAX_TITLE_CHARS) || slides[0].title || clip(context.fallbackTitle, MAX_TITLE_CHARS);
  if (!title) return { ok: false, reason: "no_title" };
  return {
    ok: true,
    deck: { version: 1, title, locale: context.locale, imageSource: context.imageSource, slides },
  };
}

/**
 * A stored deck, read back from the database, made safe again.
 *
 * The jsonb column is written by the route and only ever read by the
 * page and the exporters — but a column is not a type, and a row edited
 * by hand, or by an earlier version of this file, must not crash a
 * download. Everything goes through the same clamps as the model's
 * output; images are kept only in a shape the exporters know.
 */
export function parseStoredDeck(raw: unknown): Deck | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const imageSource = isImageSource(input.imageSource) ? input.imageSource : "none";
  const locale = typeof input.locale === "string" && input.locale.length > 0 ? input.locale : "en";
  const verdict = parseDeckToolInput(input, { locale, imageSource, fallbackTitle: "" }, { keepImages: true });
  return verdict.ok ? verdict.deck : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function parseSlideImage(raw: unknown): SlideImage | null {
  if (!raw || typeof raw !== "object") return null;
  const image = raw as Record<string, unknown>;
  if (image.kind === "own") {
    const path = nonEmpty(image.path);
    return path ? { kind: "own", path } : null;
  }
  if (image.kind === "unsplash") {
    const url = nonEmpty(image.url);
    const photographerName = nonEmpty(image.photographerName);
    const photographerUrl = nonEmpty(image.photographerUrl);
    const downloadLocation = nonEmpty(image.downloadLocation);
    // All-or-nothing, for the same reason lib/unsplash.ts makes every
    // field of UnsplashPhoto required: a photo that cannot be attributed
    // is a photo that may not be shown.
    if (!url || !photographerName || !photographerUrl || !downloadLocation) return null;
    if (!/^https:\/\/images\.unsplash\.com\//.test(url)) return null;
    return { kind: "unsplash", url, photographerName, photographerUrl, downloadLocation };
  }
  return null;
}

/**
 * The character count the estimator is handed — see the
 * presentationGenerate profile in lib/billing/estimate.ts.
 *
 * The estimator prices from ONE number, the input size, and this
 * feature's cost is set by how many slides were asked for rather than by
 * how long the description is: a two-line brief for twenty slides costs
 * ten times a two-line brief for two. So the slide count is folded into
 * the number the estimator sees, at SLIDE_OUTPUT_CHARS per slide, and the
 * profile's outputCharsPerInputChar of 1 turns that back into expected
 * output. The description itself is real input and is counted once.
 */
export function deckEstimateInputChars(descriptionChars: number, slideCount: number): number {
  return Math.max(0, descriptionChars) + clampSlideCount(slideCount) * SLIDE_OUTPUT_CHARS;
}

export type DescriptionVerdict =
  | { ok: true }
  | { ok: false; reason: "too_short" | "too_long"; limit: number };

export function checkDescription(description: string): DescriptionVerdict {
  const length = description.trim().length;
  if (length < MIN_DESCRIPTION_CHARS) return { ok: false, reason: "too_short", limit: MIN_DESCRIPTION_CHARS };
  if (length > MAX_DESCRIPTION_CHARS) return { ok: false, reason: "too_long", limit: MAX_DESCRIPTION_CHARS };
  return { ok: true };
}

/**
 * Hands the person's own photos to the slides that asked for one.
 *
 * In order, and never twice: the third slide with an imageQuery gets the
 * third upload. Slides that asked and got nothing keep their query and
 * no image, which the viewer shows as text-only — a slide is never given
 * a photo it did not ask for, because "a picture on every slide" is not
 * what a person who uploaded four photos to a twelve-slide deck meant.
 */
export function assignOwnImages(deck: Deck, paths: string[]): Deck {
  const queue = paths.filter((p) => typeof p === "string" && p.length > 0).slice(0, MAX_OWN_IMAGES);
  let next = 0;
  return {
    ...deck,
    imageSource: "own",
    slides: deck.slides.map((slide) => {
      if (!slide.imageQuery || next >= queue.length) return { ...slide, image: null };
      const path = queue[next++];
      return { ...slide, image: { kind: "own", path } };
    }),
  };
}

/** Slides that asked for a photo — the ones any image source has to fill. */
export function slidesWantingImages(deck: Deck): number {
  return deck.slides.filter((s) => s.imageQuery !== null).length;
}

/**
 * The plain text of a deck, for the search index and for the history
 * list's preview. Title, then every slide's title and bullets.
 */
export function deckPlainText(deck: Deck): string {
  return [deck.title, ...deck.slides.flatMap((s) => [s.title, ...s.bullets])].filter(Boolean).join("\n");
}
