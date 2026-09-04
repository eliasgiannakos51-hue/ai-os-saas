import type { ColumnProfile, TableProfile } from "@/lib/data-analysis/profile";
import { isBlank, parseNumber } from "@/lib/data-analysis/profile";

/**
 * A CHART IS A CLAIM ABOUT THE DATA, so the data decides what may be
 * drawn.
 *
 * The model may PROPOSE a chart. It may not produce one: a chart spec
 * that names a column the file does not have, or asks for a mean of a
 * text column, renders either an empty axis or — worse — a chart that
 * looks fine and is about nothing. So a proposal goes through
 * `validateChartSpec` against the real profile before anything is drawn,
 * and the points themselves are computed here, in code, from the rows.
 *
 * The model never sees a row and never returns a number that is plotted.
 *
 * Pure. Recharts is given the output; it is not imported here, so the
 * build gate can exercise every rule without React.
 */

export const CHART_KINDS = ["bar", "line", "area", "pie", "scatter"] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export const AGGREGATIONS = ["sum", "mean", "count", "min", "max"] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export type ChartSpec = {
  kind: ChartKind;
  title: string;
  /** The column along the bottom. */
  x: string;
  /** The column being measured. Absent for a `count`, which measures
   *  rows rather than a column. */
  y?: string;
  aggregation: Aggregation;
  /** Why this chart is worth looking at. One sentence, from the model. */
  reason?: string;
};

export type ChartPoint = { label: string; value: number };
export type BuiltChart = { spec: ChartSpec; points: ChartPoint[]; truncated: boolean };

/** More categories than this and the x-axis is a smear. The rest are
 *  gathered into one "Other" bar rather than dropped, so the total still
 *  adds up to the file. */
export const MAX_CATEGORIES = 20;

export type SpecVerdict = { ok: true; spec: ChartSpec } | { ok: false; reason: string };

function columnByName(profile: TableProfile, name: unknown): ColumnProfile | null {
  if (typeof name !== "string") return null;
  return profile.columns.find((c) => c.name === name) ?? null;
}

const isNumeric = (c: ColumnProfile) => c.type === "number" || c.type === "integer";

/**
 * Every reason a proposed chart is refused. Each one is a chart that
 * would otherwise render and mean nothing.
 */
export function validateChartSpec(raw: unknown, profile: TableProfile): SpecVerdict {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not a chart" };
  const candidate = raw as Record<string, unknown>;

  const kind = candidate.kind;
  if (typeof kind !== "string" || !(CHART_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, reason: `unknown chart kind: ${String(kind)}` };
  }
  const aggregation = candidate.aggregation;
  if (typeof aggregation !== "string" || !(AGGREGATIONS as readonly string[]).includes(aggregation)) {
    return { ok: false, reason: `unknown aggregation: ${String(aggregation)}` };
  }

  // A COLUMN THAT DOES NOT EXIST. The single likeliest thing a model gets
  // wrong here — it invents a plausible name ("Revenue" for "revenue_eur")
  // and the chart draws nothing.
  const x = columnByName(profile, candidate.x);
  if (!x) return { ok: false, reason: `there is no column called ${String(candidate.x)}` };

  let y: ColumnProfile | null = null;
  if (aggregation !== "count") {
    y = columnByName(profile, candidate.y);
    if (!y) return { ok: false, reason: `there is no column called ${String(candidate.y)}` };
    // A MEAN OF A TEXT COLUMN. Silently produces zeros.
    if (!isNumeric(y)) return { ok: false, reason: `${y.name} is not numeric, so it cannot be ${aggregation}med` };
  }

  if (x.type === "empty") return { ok: false, reason: `${x.name} is empty` };

  // A SCATTER NEEDS TWO NUMBERS. One category against one number is a bar
  // chart drawn as dots.
  if (kind === "scatter" && (!isNumeric(x) || !y)) {
    return { ok: false, reason: "a scatter chart needs two numeric columns" };
  }

  // A PIE OF 400 SLICES is not a chart. The cap below gathers the tail
  // into "Other", but a column with nothing but unique values (an id, an
  // email) has no tail to gather — it is all tail.
  if (kind === "pie" && x.unique > MAX_CATEGORIES * 2) {
    return { ok: false, reason: `${x.name} has ${x.unique} distinct values, which is not a pie chart` };
  }

  // A LINE THROUGH UNORDERED CATEGORIES draws a shape that comes from the
  // sort order rather than from the data. Lines and areas need something
  // with an order: a date, or a number.
  if ((kind === "line" || kind === "area") && !(x.type === "date" || isNumeric(x))) {
    return { ok: false, reason: `a line chart needs an ordered x axis, and ${x.name} is ${x.type}` };
  }

  const title = typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : "";
  if (!title) return { ok: false, reason: "the chart has no title" };

  return {
    ok: true,
    spec: {
      kind: kind as ChartKind,
      title: title.slice(0, 120),
      x: x.name,
      ...(y ? { y: y.name } : {}),
      aggregation: aggregation as Aggregation,
      ...(typeof candidate.reason === "string" && candidate.reason.trim()
        ? { reason: candidate.reason.trim().slice(0, 300) }
        : {}),
    },
  };
}

/**
 * The points, computed from the rows.
 *
 * ROWS WHERE THE MEASURE IS MISSING ARE NOT ZEROS. Counting a blank as
 * zero drags every mean down and makes a sparse column look like a
 * collapse; skipping the row is the only reading that keeps "the average
 * order value" meaning what it says.
 */
export function buildChart(
  spec: ChartSpec,
  profile: TableProfile,
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): BuiltChart {
  const xColumn = profile.columns.find((c) => c.name === spec.x);
  const yColumn = spec.y ? profile.columns.find((c) => c.name === spec.y) : undefined;
  if (!xColumn) return { spec, points: [], truncated: false };

  const xIndex = headers.indexOf(xColumn.name);
  const yIndex = yColumn ? headers.indexOf(yColumn.name) : -1;
  // THE PROFILE AND THE HEADERS CAN DISAGREE — a re-uploaded file, a
  // renamed column, a profile stored before an edit. Without this,
  // `row[-1]` is undefined, parseNumber("") is null, every point is
  // skipped and the chart renders EMPTY: indistinguishable from a file
  // that genuinely had no usable rows. Same outcome, said on purpose.
  if (xIndex < 0 || (yColumn && yIndex < 0)) return { spec, points: [], truncated: false };

  if (spec.kind === "scatter" && yColumn) {
    const points: ChartPoint[] = [];
    for (const row of rows) {
      const x = parseNumber(row[xIndex] ?? "", xColumn.numberFormat ?? "plain");
      const y = parseNumber(row[yIndex] ?? "", yColumn.numberFormat ?? "plain");
      if (x === null || y === null) continue;
      // The scatter's "label" is its x, as a string, so one point shape
      // serves every chart kind.
      points.push({ label: String(x), value: y });
    }
    return { spec, points: points.slice(0, 2_000), truncated: points.length > 2_000 };
  }

  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const rawX = row[xIndex] ?? "";
    if (isBlank(rawX)) continue;
    const label = rawX.trim();

    if (spec.aggregation === "count") {
      const bucket = buckets.get(label) ?? [];
      bucket.push(1);
      buckets.set(label, bucket);
      continue;
    }

    if (!yColumn) continue;
    const value = parseNumber(row[yIndex] ?? "", yColumn.numberFormat ?? "plain");
    if (value === null) continue;
    const bucket = buckets.get(label) ?? [];
    bucket.push(value);
    buckets.set(label, bucket);
  }

  let points: ChartPoint[] = [...buckets.entries()].map(([label, values]) => ({
    label,
    value: aggregate(spec.aggregation, values),
  }));

  // An ordered axis is sorted by its own order; a categorical one by
  // size, because the interesting bar is the big one and a chart sorted
  // alphabetically hides it in the middle.
  if (xColumn.type === "date" || isNumeric(xColumn)) {
    points.sort((a, b) =>
      xColumn.type === "date" ? a.label.localeCompare(b.label) : Number(a.label) - Number(b.label)
    );
  } else {
    points.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }

  let truncated = false;
  if (points.length > MAX_CATEGORIES) {
    truncated = true;
    const kept = points.slice(0, MAX_CATEGORIES - 1);
    const rest = points.slice(MAX_CATEGORIES - 1);
    // GATHERED, NOT DROPPED — for the aggregations where a total means
    // something. A mean of means is not a mean, so "Other" is only
    // produced for sum and count; for the rest the tail is cut and the
    // caller is told it was.
    if (spec.aggregation === "sum" || spec.aggregation === "count") {
      kept.push({ label: "Other", value: rest.reduce((s, p) => s + p.value, 0) });
    }
    points = kept;
  }

  return { spec, points, truncated };
}

/**
 * The five aggregations, in ONE place.
 *
 * charts.ts and query.ts both need them and both had their own copy —
 * identical, until the day one gained a fix the other did not. A chart
 * and the answer to a question about the same column would then disagree
 * on the same screen, which is worse than either being wrong alone.
 */
export function aggregate(kind: Aggregation, values: readonly number[]): number {
  if (values.length === 0) return 0;
  switch (kind) {
    case "count":
      return values.length;
    case "sum":
      return values.reduce((s, v) => s + v, 0);
    case "mean":
      return values.reduce((s, v) => s + v, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
  }
}

/**
 * The charts a file deserves even if no model is available.
 *
 * WITHOUT A KEY THE PAGE IS NOT EMPTY. Every suggestion here comes from
 * the column types alone, so an upload with no analysis still draws
 * something true — which is also what makes the AI's contribution
 * checkable: it has to beat these.
 */
export function suggestCharts(profile: TableProfile): ChartSpec[] {
  const out: ChartSpec[] = [];
  const dates = profile.columns.filter((c) => c.type === "date");
  const numbers = profile.columns.filter(isNumeric);
  const categories = profile.columns.filter(
    (c) => c.type === "text" && c.unique > 1 && c.unique <= MAX_CATEGORIES
  );

  if (dates[0] && numbers[0]) {
    out.push({
      kind: "line",
      title: `${numbers[0].name} over ${dates[0].name}`,
      x: dates[0].name,
      y: numbers[0].name,
      aggregation: "sum",
    });
  }
  if (categories[0] && numbers[0]) {
    out.push({
      kind: "bar",
      title: `${numbers[0].name} by ${categories[0].name}`,
      x: categories[0].name,
      y: numbers[0].name,
      aggregation: "sum",
    });
  }
  if (categories[0]) {
    out.push({
      kind: "pie",
      title: `Rows by ${categories[0].name}`,
      x: categories[0].name,
      aggregation: "count",
    });
  }
  if (numbers.length >= 2 && profile.correlations.length > 0) {
    const top = profile.correlations[0];
    out.push({
      kind: "scatter",
      title: `${top.b} against ${top.a}`,
      x: top.a,
      y: top.b,
      aggregation: "mean",
      reason: `these two move together (r = ${top.r.toFixed(2)})`,
    });
  }
  return out.slice(0, 4);
}
