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
 * WHAT A SLIDE IS, and what it is not. Six layouts, all of them one
 * title plus a bounded amount of text: a deck this feature produces is
 * something a person presents from, not a poster. There is no free
 * positioning, no table, no animation, and the exporters do not pretend
 * otherwise — a .pptx from here opens in PowerPoint as editable text
 * boxes and the person finishes it there. That is the honest scope, and
 * the page says it (presentations.limits.* in the catalogue).
 *
 * THE ONE PICTURE OF NUMBERS IS A CHART FROM THE PERSON'S OWN FILE
 * (MASTER 16, package 13, behind the switch "slides-charts"). Its points
 * are computed in code from the file's rows (lib/presentations/
 * deck-charts.ts, on lib/data-analysis/charts.ts); the model only says
 * WHICH of the charts it was shown goes on which slide, by number, and
 * never writes a number that is drawn. A .pptx carries it as a native
 * chart, which PowerPoint opens as one it can edit.
 *
 * EVERY BOUND IS APPLIED TWICE. The model is TOLD the limits in the
 * prompt, and parseDeckToolInput CLAMPS whatever comes back: a title
 * longer than MAX_TITLE_CHARS is cut, a seventh bullet is dropped, a
 * twenty-first slide is dropped. A prompt rule is a request; the parser
 * is the guarantee, and the exporters lay out against the guarantee.
 */

/** The layouts a slide may have. The model picks one per slide. */
export const SLIDE_LAYOUTS = ["title", "bullets", "section", "quote", "image", "chart"] as const;
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
export const MAX_DECK_DESCRIPTION_CHARS = 4_000;
export const MIN_DECK_DESCRIPTION_CHARS = 10;

/**
 * HOW LONG "make it more formal" IS ALLOWED TO BE.
 *
 * The floor is four characters rather than the brief's ten: "blue" and
 * "πιο επίσημο" are both complete instructions, and a minimum written
 * for a whole brief would refuse them. The ceiling is a quarter of the
 * brief's, because an instruction longer than a thousand characters is
 * a new deck being described rather than a change being asked for —
 * and describing a new deck is what the generator is for and what it
 * prices.
 */
export const MIN_INSTRUCTION_CHARS = 4;
export const MAX_INSTRUCTION_CHARS = 1_000;

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

/** The chart kinds a slide draws: the ones PowerPoint, the PDF and the
 *  page all draw alike. */
export const DECK_CHART_KINDS = ["bar", "line", "pie"] as const;
export type DeckChartKind = (typeof DECK_CHART_KINDS)[number];
/** The arithmetic behind a chart's points, as lib/data-analysis/charts.ts names it. */
export const DECK_CHART_AGGREGATIONS = ["sum", "mean", "count", "min", "max"] as const;
export type DeckChartAggregation = (typeof DECK_CHART_AGGREGATIONS)[number];
/** Points a chart slide carries: lib/data-analysis/charts.ts gathers the
 *  rest of a long category list into one, so this is its MAX_CATEGORIES. */
export const MAX_CHART_POINTS = 20;
/** A chart slide's words share it with the chart. */
export const MAX_CHART_BULLETS = 3;
const MAX_CHART_LABEL_CHARS = 60;
const MAX_CHART_NAME_CHARS = 120;

/**
 * A CHART ON A SLIDE: the numbers, and where they came from.
 *
 * `points` were computed from the file's rows by buildChart; `source` is
 * how — which file, which column along the bottom, which column measured
 * and with what arithmetic, over how many rows — so the page can say it
 * under the chart and the person can check it in Analyze, where the same
 * file lives (`dataId`).
 */
export type SlideChart = {
  kind: DeckChartKind;
  /** The chart's own name in the list the model was shown ("Revenue by Region"). */
  title: string;
  points: { label: string; value: number }[];
  /** The last point gathers every category past MAX_CHART_POINTS - 1. */
  gathered: boolean;
  source: {
    dataId: string;
    file: string;
    x: string;
    y: string | null;
    aggregation: DeckChartAggregation;
    rows: number;
  };
};

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
  /** Layout "chart" only. Optional because every deck written before
   *  package 13 has none, and is read back without one. */
  chart?: SlideChart | null;
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
  options: { keepImages?: boolean; charts?: readonly SlideChart[] } = {}
): DeckVerdict {
  const input = (raw ?? {}) as Record<string, unknown>;
  const rawSlides = Array.isArray(input.slides) ? input.slides : [];
  const slides: Slide[] = [];
  for (const entry of rawSlides) {
    if (slides.length >= MAX_SLIDES) break;
    const s = (entry ?? {}) as Record<string, unknown>;
    const title = clip(s.title, MAX_TITLE_CHARS);
    // THE CHART IS THE CODE'S. From the model it is a NUMBER into the list
    // it was shown (`options.charts`), resolved here to the chart that was
    // computed; from a stored row it is the chart itself, checked again.
    // A number with no list, or past it, is no chart.
    const chart = options.charts
      ? chartByNumber(s.chart, options.charts)
      : options.keepImages
        ? parseSlideChart(s.chart)
        : null;
    const bullets = (Array.isArray(s.bullets) ? s.bullets : [])
      .map((b) => clip(b, MAX_BULLET_CHARS))
      .filter((b) => b.length > 0)
      .slice(0, chart ? MAX_CHART_BULLETS : MAX_BULLETS);
    const notes = clip(s.notes, MAX_NOTES_CHARS);
    if (!title && bullets.length === 0) continue;
    // A slide with a chart IS a chart slide, whatever layout it named; a
    // "chart" slide with none is a slide of points.
    const named = isSlideLayout(s.layout) ? s.layout : bullets.length > 0 ? "bullets" : "section";
    const layout: SlideLayout = chart ? "chart" : named === "chart" ? (bullets.length > 0 ? "bullets" : "section") : named;
    const query = clip(s.imageQuery, MAX_IMAGE_QUERY_CHARS);
    slides.push({
      layout,
      title,
      bullets,
      notes,
      imageQuery: chart || query.length === 0 ? null : query,
      image: options.keepImages && !chart ? parseSlideImage(s.image) : null,
      ...(chart ? { chart } : {}),
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
function chartByNumber(value: unknown, charts: readonly SlideChart[]): SlideChart | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= charts.length ? charts[value - 1] : null;
}

/**
 * A stored chart, made safe: the shape the exporters draw, or nothing.
 * Bounded like every other field — a row edited by hand must not hand
 * PowerPoint a thousand categories or a value that is not a number.
 */
export function parseSlideChart(raw: unknown): SlideChart | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.kind !== "string" || !(DECK_CHART_KINDS as readonly string[]).includes(c.kind)) return null;
  const points = (Array.isArray(c.points) ? c.points : [])
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
    .filter((p) => typeof p.value === "number" && Number.isFinite(p.value))
    .map((p) => ({ label: clip(p.label, MAX_CHART_LABEL_CHARS), value: p.value as number }))
    .slice(0, MAX_CHART_POINTS);
  if (points.length === 0) return null;
  const src = (c.source && typeof c.source === "object" ? c.source : {}) as Record<string, unknown>;
  const aggregation = typeof src.aggregation === "string" && (DECK_CHART_AGGREGATIONS as readonly string[]).includes(src.aggregation) ? (src.aggregation as DeckChartAggregation) : null;
  const dataId = clip(src.dataId, 64);
  const file = clip(src.file, 200);
  const x = clip(src.x, MAX_CHART_NAME_CHARS);
  if (!aggregation || !dataId || !file || !x) return null;
  const y = src.y === null || src.y === undefined ? null : clip(src.y, MAX_CHART_NAME_CHARS) || null;
  const rows = typeof src.rows === "number" && Number.isFinite(src.rows) && src.rows >= 0 ? Math.round(src.rows) : 0;
  return {
    kind: c.kind as DeckChartKind,
    title: clip(c.title, MAX_CHART_NAME_CHARS),
    points,
    gathered: c.gathered === true,
    source: { dataId, file, x, y, aggregation, rows },
  };
}

/**
 * The charts a deck carries, once each and in slide order: the list an
 * edit shows the model, numbered the way renderDeckForEditing numbers
 * them (lib/presentations/prompt.ts), so the number it answers with
 * resolves to the chart that slide already had.
 */
export function deckCharts(deck: Deck): SlideChart[] {
  const seen = new Map<string, SlideChart>();
  for (const slide of deck.slides) {
    if (slide.chart) {
      const key = JSON.stringify(slide.chart);
      if (!seen.has(key)) seen.set(key, slide.chart);
    }
  }
  return [...seen.values()];
}

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

/**
 * WHAT AN EDIT ACTUALLY SENDS, for the reservation to hold against.
 *
 * deckEstimateInputChars above prices a GENERATION, where the input is
 * a short brief and the per-slide allowance stands in for the output.
 * An edit is the other way round: the whole deck goes back up as input
 * — titles, bullets, notes, imageQueries — and comes back down the same
 * size. So this counts the deck's real characters plus the instruction,
 * and estimate.ts's ratio of 1 turns that into the expected output.
 *
 * COUNTED FROM THE DECK, NOT FROM A PER-SLIDE CONSTANT. A deck of three
 * dense slides and a deck of three sparse ones cost different amounts
 * to send back, and SLIDE_OUTPUT_CHARS would price them the same.
 */
export function deckEditEstimateInputChars(deck: Deck, instructionChars: number): number {
  const deckChars = deck.slides.reduce(
    (n, s) => n + s.title.length + s.notes.length + (s.imageQuery?.length ?? 0) + s.bullets.reduce((b, x) => b + x.length, 0),
    deck.title.length
  );
  // THE CHARTS GO BACK UP TOO, as the list the edit shows the model.
  return deckChars + deckChartsChars(deckCharts(deck)) + Math.max(0, instructionChars);
}

/** Characters of the chart list a call sends: names, labels and values,
 *  the size renderChartsForModel (lib/presentations/prompt.ts) writes. */
export function deckChartsChars(charts: readonly SlideChart[]): number {
  return charts.reduce(
    (n, c) => n + 40 + c.title.length + c.source.file.length + c.points.reduce((p, x) => p + x.label.length + 16, 0),
    0
  );
}

export type DescriptionVerdict =
  | { ok: true }
  | { ok: false; reason: "too_short" | "too_long"; limit: number };

export function checkDeckDescription(description: string): DescriptionVerdict {
  const length = description.trim().length;
  if (length < MIN_DECK_DESCRIPTION_CHARS) return { ok: false, reason: "too_short", limit: MIN_DECK_DESCRIPTION_CHARS };
  if (length > MAX_DECK_DESCRIPTION_CHARS) return { ok: false, reason: "too_long", limit: MAX_DECK_DESCRIPTION_CHARS };
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

/**
 * ONE BOX, ONE CHANGE (MASTER Μέρος 16, package 4): «πατάω ένα κουτί, γράφω
 * τι να αλλάξει, και αλλάζει μόνο αυτό». A slide is a box.
 *
 * The model is asked for the whole deck with only that slide changed, and
 * then NOT TRUSTED to have done so: keepOnlySlide takes that one slide from
 * what came back and every other slide from what was stored, so the rest
 * of the deck is the stored deck, byte for byte, whatever the model wrote.
 * Read by app/api/presentations/[id]/edit/route.ts; held by
 * scripts/tests/boxes.test.mjs, which runs both.
 */
export function scopeInstructionToSlide(instruction: string, index: number, total: number): string {
  return `Change ONLY slide ${index + 1} of ${total}. Keep every other slide exactly as it is, and return the whole deck. The change to slide ${index + 1}: ${instruction}`;
}

export function keepOnlySlide(stored: Deck, edited: Deck, index: number): Deck | null {
  if (!Number.isInteger(index) || index < 0 || index >= stored.slides.length) return null;
  const changed = edited.slides[index];
  if (!changed) return null;
  return { ...stored, slides: stored.slides.map((slide, i) => (i === index ? changed : slide)) };
}

/** A slide index from a request body, or null for none, or "bad" for one that is not a slide of this deck. */
export function readSlideIndex(value: unknown, total: number): number | null | "bad" {
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < total ? value : "bad";
}

/**
 * The changed slide's picture, without searching when nothing asks for it.
 * The stored picture stays when the slide still wants the same one (or the
 * deck uses the person's own photos, where an edit brings no new ones);
 * otherwise the image is null and the route searches for THIS slide only.
 */
export function keepBoxImage(before: Slide, after: Slide, source: ImageSource): Slide {
  if (!after.imageQuery) return { ...after, image: null };
  if (before.image && (source === "own" || after.imageQuery === before.imageQuery)) return { ...after, image: before.image };
  return { ...after, image: null };
}
