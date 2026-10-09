import { buildChart, validateChartSpec, MAX_CATEGORIES, type ChartSpec } from "@/lib/data-analysis/charts";
import type { ColumnProfile, TableProfile } from "@/lib/data-analysis/profile";
import { MAX_SLIDES, type Deck, type Slide, type SlideChart } from "@/lib/presentations/deck";

/**
 * THE CHARTS A FILE ALLOWS, COMPUTED BEFORE THE MODEL IS ASKED ANYTHING
 * (MASTER 16, package 13: «παίρνω παρουσίαση με πραγματικό γράφημα από
 * αρχείο μου»).
 *
 * The file is the person's own spreadsheet, uploaded through
 * api/data-analysis/upload and read back by id and owner in
 * api/presentations/generate. Which charts it allows is decided by its
 * column types (lib/data-analysis/profile.ts) and every proposal goes
 * through validateChartSpec, the same rules Analyze draws by; the points
 * are buildChart's, from the rows. The model is shown this list, with
 * the numbers, and answers with a NUMBER from it for a slide that should
 * carry one (lib/presentations/deck.ts, parseDeckToolInput) — so what
 * PowerPoint draws is what the file says, whatever the model wrote.
 *
 * Pure: no database, no SDK. scripts/tests/slides-charts.test.mjs runs it
 * on a real workbook.
 */

/** Charts offered for one deck. More is a list the model reads past. */
export const MAX_DECK_CHARTS = 6;
/** A chart of one point is a number, not a chart. */
const MIN_CHART_POINTS = 2;
/** A pie of more slices than this is read as a ring of colours — and the
 *  design's chart palette (--chart-1…5) has five. */
const MAX_PIE_SLICES = 5;

const isMeasureColumn = (c: ColumnProfile) => c.type === "number" || c.type === "integer";

/** A whole-number column whose every value is a plausible year: an axis
 *  with an order, so a line rather than bars. */
function isYearColumn(c: ColumnProfile): boolean {
  const n = c.numeric;
  return c.type === "integer" && Boolean(n) && c.unique >= 2 && c.unique <= MAX_CATEGORIES && (n?.min ?? 0) >= 1900 && (n?.max ?? 0) <= 2100;
}

/**
 * Every chart the columns allow, in the order a deck wants them: the
 * measure over time first, then the measure by category, then how the
 * rows split. Only sums and counts, so a long category list is GATHERED
 * into one last point (buildChart) and the total still adds up to the file.
 */
export function deckChartSpecs(profile: TableProfile): ChartSpec[] {
  const filled = profile.columns.filter((c) => c.filled > 0);
  const ordered = filled.filter((c) => c.type === "date" || isYearColumn(c));
  const measures = filled.filter((c) => isMeasureColumn(c) && !isYearColumn(c)).slice(0, 3);
  const categories = filled.filter((c) => c.type === "text" && c.unique >= 2 && c.unique <= MAX_CATEGORIES * 3).slice(0, 2);

  const proposals: Record<string, unknown>[] = [];
  for (const x of ordered.slice(0, 1)) {
    for (const y of measures) proposals.push({ kind: "line", title: `${y.name} by ${x.name}`, x: x.name, y: y.name, aggregation: "sum" });
  }
  for (const x of categories) {
    for (const y of measures) proposals.push({ kind: "bar", title: `${y.name} by ${x.name}`, x: x.name, y: y.name, aggregation: "sum" });
  }
  // COUNTING ROWS needs a column whose values REPEAT. Counted by a column
  // where every row is different — names, addresses, ids — every bar is 1,
  // a chart of nothing.
  const grouping = categories.filter((c) => c.unique < c.filled);
  for (const x of grouping) {
    if (x.unique <= MAX_PIE_SLICES) proposals.push({ kind: "pie", title: `Rows by ${x.name}`, x: x.name, aggregation: "count" });
    else if (measures.length === 0) proposals.push({ kind: "bar", title: `Rows by ${x.name}`, x: x.name, aggregation: "count" });
  }

  const out: ChartSpec[] = [];
  for (const proposal of proposals) {
    const verdict = validateChartSpec(proposal, profile);
    if (verdict.ok && !out.some((s) => s.kind === verdict.spec.kind && s.x === verdict.spec.x && s.y === verdict.spec.y && s.aggregation === verdict.spec.aggregation)) {
      out.push(verdict.spec);
    }
  }
  return out;
}

/** A float's arithmetic noise off (0.1 + 0.2), every real digit kept. */
function clean(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * The charts, built. `other` is the name of the gathered point, in the
 * deck's language — buildChart writes "Other", and a Greek slide must not.
 */
export function deckChartsFrom(
  dataset: { dataId: string; file: string; headers: readonly string[]; rows: readonly (readonly string[])[]; profile: TableProfile },
  other: string
): SlideChart[] {
  const charts: SlideChart[] = [];
  for (const spec of deckChartSpecs(dataset.profile)) {
    if (charts.length >= MAX_DECK_CHARTS) break;
    const built = buildChart(spec, dataset.profile, dataset.headers, dataset.rows);
    if (built.points.length < MIN_CHART_POINTS) continue;
    const gathered = built.truncated;
    const points = built.points.map((p, i) => ({
      label: gathered && i === built.points.length - 1 ? other : p.label,
      value: clean(p.value),
    }));
    charts.push({
      kind: spec.kind === "line" || spec.kind === "pie" ? spec.kind : "bar",
      title: spec.title,
      points,
      gathered,
      source: {
        dataId: dataset.dataId,
        file: dataset.file,
        x: spec.x,
        y: spec.y ?? null,
        aggregation: spec.aggregation,
        rows: dataset.rows.length,
      },
    });
  }
  return charts;
}

/**
 * A DECK MADE FROM A FILE CARRIES A CHART FROM IT. The model is told to
 * put one on a slide; when it did not, the first chart goes in before the
 * closing slide, under `title` (written by the route in the deck's
 * language). At the slide ceiling it takes the place of the last content
 * slide rather than going past MAX_SLIDES.
 */
export function ensureChartSlide(deck: Deck, charts: readonly SlideChart[], title: string): Deck {
  if (charts.length === 0 || deck.slides.some((s) => s.chart)) return deck;
  const slide: Slide = { layout: "chart", title, bullets: [], notes: "", imageQuery: null, image: null, chart: charts[0] };
  const at = Math.max(1, deck.slides.length - 1);
  const slides = [...deck.slides];
  if (slides.length >= MAX_SLIDES) slides.splice(at - 1, 1, slide);
  else slides.splice(at, 0, slide);
  return { ...deck, slides };
}

/** The key of each arithmetic's sentence, literal so every one is found
 *  where it is used (scripts/check-i18n.js, the orphan-key scan). */
const HOW_KEYS = {
  sum: "presentations.chart.how.sum",
  mean: "presentations.chart.how.mean",
  count: "presentations.chart.how.count",
  min: "presentations.chart.how.min",
  max: "presentations.chart.how.max",
} as const;

/**
 * WHERE A CHART'S NUMBERS CAME FROM, in a sentence: the file, its rows,
 * and the arithmetic — «Από το πωλήσεις.xlsx (120 γραμμές): το άθροισμα
 * του Έσοδα για κάθε Περιοχή». Under the chart on the page, on the
 * slide in PowerPoint and in the PDF. `say` is a translator for the
 * deck's language (lib/email/email-locale.ts emailTranslator on the
 * server).
 */
export function chartSourceText(chart: SlideChart, say: (key: string, vars?: Record<string, string | number>) => string): string {
  const { file, x, y, aggregation, rows } = chart.source;
  const how = say(HOW_KEYS[aggregation], { x, y: y ?? "" });
  return say("presentations.chart.source", { file, rows, how });
}
