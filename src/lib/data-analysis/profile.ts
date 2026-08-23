/**
 * WHAT THE DATA ACTUALLY IS — computed, not guessed at by a model.
 *
 * The division of labour in this module is the same one the Strategy
 * Guardian uses and for the same reason: EVERY NUMBER IS COMPUTED IN
 * CODE, and the model is only ever asked to interpret numbers it was
 * handed. A mean, a correlation and an outlier count are arithmetic; a
 * language model asked to produce them will produce something plausible,
 * and a plausible mean is indistinguishable from a real one until
 * somebody's decision depends on it.
 *
 * So: this file decides what each column is and computes its statistics.
 * The AI pass (lib/data-analysis/analyse.ts) reads the OUTPUT of this
 * file and says what it means.
 *
 * Pure. No SDK, no database, no clock.
 */

export type ColumnType = "number" | "integer" | "date" | "boolean" | "text" | "empty";

export type NumberStats = {
  min: number;
  max: number;
  mean: number;
  median: number;
  /** Population standard deviation. */
  stdDev: number;
  sum: number;
  /** Values further than 3 standard deviations from the mean. Reported
   *  as a COUNT and a few examples, never as a judgement — an outlier is
   *  frequently the most interesting row in the file, not an error. */
  outlierCount: number;
  outlierExamples: number[];
};

export type ColumnProfile = {
  name: string;
  index: number;
  type: ColumnType;
  /** Rows with a value. */
  filled: number;
  missing: number;
  unique: number;
  /** The commonest values, for a categorical column. */
  topValues: { value: string; count: number }[];
  numeric?: NumberStats;
  dateRange?: { min: string; max: string };
  /** Set when the column's numbers are written 1.234,56 rather than
   *  1,234.56 — see parseNumber for why this is decided per column. */
  numberFormat?: "plain" | "european";
};

export type TableProfile = {
  rowCount: number;
  columns: ColumnProfile[];
  /** Rows identical to an earlier row, across every column. */
  duplicateRows: number;
  /** Pairs of numeric columns that move together. Pearson's r, computed
   *  here rather than described by a model. */
  correlations: { a: string; b: string; r: number }[];
};

/** Below this many pairs a correlation coefficient is noise wearing a
 *  number's clothes. */
export const MIN_PAIRS_FOR_CORRELATION = 20;
/** Only |r| at least this large is worth mentioning at all. */
export const CORRELATION_THRESHOLD = 0.5;
/** How many distinct values before a column stops being categorical. */
export const MAX_CATEGORICAL_UNIQUE = 50;
const TOP_VALUES = 8;
const OUTLIER_SIGMAS = 3;

const BOOLEAN_TRUE = new Set(["true", "yes", "y", "1", "si", "oui", "ja"]);
const BOOLEAN_FALSE = new Set(["false", "no", "n", "0", "nein", "non"]);

export function isBlank(value: string): boolean {
  const t = value.trim();
  // The strings real exports use for "no value". Treated as missing
  // rather than as the text "N/A", which would otherwise become the
  // commonest category in half the columns of a real file.
  return t === "" || t === "-" || /^(n\/?a|null|nil|nan|none|#n\/a)$/i.test(t);
}

/**
 * Numbers, with the decimal separator decided PER COLUMN.
 *
 * "1,234" is one thousand two hundred and thirty four in en-GB and one
 * point two three four in de-DE, and no amount of looking at that single
 * value settles it. Looking at the whole column does: a column containing
 * "1.234,56" cannot be Anglo-Saxon, and one containing "1,234.56" cannot
 * be European. Deciding per cell is how a column ends up with two
 * different scales in it and a chart that is wrong by a factor of a
 * thousand for some rows only.
 */
export function detectNumberFormat(values: readonly string[]): "plain" | "european" {
  let european = 0;
  let plain = 0;
  for (const raw of values) {
    const v = raw.trim();
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) european++;
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) plain++;
    else if (/^-?\d+,\d+$/.test(v)) european++;
    else if (/^-?\d+\.\d+$/.test(v)) plain++;
  }
  return european > plain ? "european" : "plain";
}

// Non-breaking (U+00A0), narrow no-break (U+202F), thin (U+2009) and
// figure (U+2007) spaces are all real thousands separators — French
// exports use them constantly, and \s alone does not match every one of
// them in every engine. Written as escapes rather than as literal
// characters so a diff, a terminal and a code review can all see them.
const SPACE_SEPARATORS = /[\u00A0\u202F\u2009\u2007\s]/g;

export function parseNumber(value: string, format: "plain" | "european" = "plain"): number | null {
  let v = value.trim();
  if (v === "") return null;
  // A leading or trailing currency symbol is a formatting choice, not a
  // reason to call a price column text.
  v = v.replace(/^[€$£¥]\s?/, "").replace(/\s?[€$£¥]$/, "");
  // A percentage keeps its face value: "45%" is 45, not 0.45. Rescaling
  // silently would make a column of percentages plot as a flat line near
  // zero next to anything else.
  if (v.endsWith("%")) v = v.slice(0, -1).trim();
  v = v.replace(SPACE_SEPARATORS, "");
  if (format === "european") v = v.replace(/\./g, "").replace(",", ".");
  else v = v.replace(/,/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Dates, in the formats a spreadsheet export actually produces.
 *
 * AMBIGUOUS DAY/MONTH ORDER IS NOT RESOLVED BY GUESSING. 03/04/2024 is
 * the 3rd of April or the 4th of March depending on who exported it, and
 * this returns null for the ambiguous shape rather than picking one — a
 * date column silently read in the wrong order produces a chart whose
 * x-axis is wrong in a way nobody can see. ISO (which is unambiguous) and
 * unambiguous day/month (where one part is over 12) are read.
 */
export function parseDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/);
  if (iso) {
    const [, y, m, d] = iso;
    return validDate(Number(y), Number(m), Number(d)) ? `${y}-${m}-${d}` : null;
  }

  const slashed = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (slashed) {
    const a = Number(slashed[1]);
    const b = Number(slashed[2]);
    const year = Number(slashed[3]);
    // Only when one of the two cannot be a month.
    if (a > 12 && b <= 12) return validDate(year, b, a) ? isoOf(year, b, a) : null;
    if (b > 12 && a <= 12) return validDate(year, a, b) ? isoOf(year, a, b) : null;
    return null;
  }

  return null;
}

function validDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || y < 1000 || y > 3000) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function profileColumn(name: string, index: number, values: readonly string[]): ColumnProfile {
  const present = values.filter((v) => !isBlank(v));
  const missing = values.length - present.length;

  if (present.length === 0) {
    return { name, index, type: "empty", filled: 0, missing, unique: 0, topValues: [] };
  }

  const counts = new Map<string, number>();
  for (const v of present) {
    const key = v.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const topValues = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_VALUES)
    .map(([value, count]) => ({ value, count }));

  const base = { name, index, filled: present.length, missing, unique: counts.size, topValues };

  // BOOLEAN FIRST: "1"/"0" is also a valid number, and a flag column
  // reported as numeric gets a mean, which is a percentage nobody asked
  // for dressed up as an average.
  const lower = present.map((v) => v.trim().toLowerCase());
  if (lower.every((v) => BOOLEAN_TRUE.has(v) || BOOLEAN_FALSE.has(v)) && counts.size <= 2) {
    return { ...base, type: "boolean" };
  }

  const dates = present.map(parseDate);
  if (dates.every((d) => d !== null)) {
    const sorted = (dates as string[]).slice().sort();
    return { ...base, type: "date", dateRange: { min: sorted[0], max: sorted[sorted.length - 1] } };
  }

  const format = detectNumberFormat(present);
  const numbers = present.map((v) => parseNumber(v, format));
  if (numbers.every((n) => n !== null)) {
    const parsed = numbers as number[];
    const allIntegers = parsed.every((n) => Number.isInteger(n));
    return {
      ...base,
      type: allIntegers ? "integer" : "number",
      numberFormat: format,
      numeric: numberStats(parsed),
    };
  }

  return { ...base, type: "text" };
}

export function numberStats(values: readonly number[]): NumberStats {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  // A COLUMN WITH NO SPREAD HAS NO OUTLIERS.
  //
  // BELT AND BRACES, said plainly: a standard deviation is exactly zero
  // only when every value is bit-identical, and then |v - mean| is
  // exactly zero too, so `0 > 3 * 0` is already false and this guard
  // changes no outcome today. It is kept because the comparison below is
  // one character away from `>=`, under which a constant column WOULD be
  // reported as entirely anomalous. Stated as redundancy rather than
  // described as a fix, so nobody reads it as protection it is not
  // currently providing.
  const outliers = stdDev === 0 ? [] : sorted.filter((v) => Math.abs(v - mean) > OUTLIER_SIGMAS * stdDev);

  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    median,
    stdDev,
    sum,
    outlierCount: outliers.length,
    outlierExamples: outliers.slice(0, 5),
  };
}

/**
 * Pearson's r between two numeric columns, over the rows where BOTH have
 * a value.
 *
 * PAIRWISE, not row-count. Correlating two columns after dropping every
 * row where either is blank is the only version of this that means
 * anything; computing it over indexes and treating a missing value as
 * zero produces a strong correlation out of two columns that share
 * nothing but their gaps.
 */
export function correlation(xs: readonly (number | null)[], ys: readonly (number | null)[]): number | null {
  const pairs: [number, number][] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i];
    const y = ys[i];
    if (x === null || y === null) continue;
    pairs.push([x, y]);
  }
  if (pairs.length < MIN_PAIRS_FOR_CORRELATION) return null;

  const n = pairs.length;
  const meanX = pairs.reduce((s, p) => s + p[0], 0) / n;
  const meanY = pairs.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (const [x, y] of pairs) {
    num += (x - meanX) * (y - meanY);
    denX += (x - meanX) ** 2;
    denY += (y - meanY) ** 2;
  }
  // A constant column correlates with nothing. 0/0 is NaN, and NaN
  // rendered in a report reads as a bug rather than as "no relationship".
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

// A separator no spreadsheet cell can contain, so ["a","b"] and ["a b"]
// are never reported as the same duplicated row.
const ROW_KEY_SEPARATOR = "\u001F";

export function profileTable(headers: readonly string[], rows: readonly (readonly string[])[]): TableProfile {
  const columns = headers.map((name, index) =>
    profileColumn(name, index, rows.map((r) => r[index] ?? ""))
  );

  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const row of rows) {
    const key = row.join(ROW_KEY_SEPARATOR);
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }

  const numericColumns = columns.filter((c) => c.type === "number" || c.type === "integer");
  const numericValues = new Map<number, (number | null)[]>();
  for (const column of numericColumns) {
    numericValues.set(
      column.index,
      rows.map((r) => {
        const raw = r[column.index] ?? "";
        return isBlank(raw) ? null : parseNumber(raw, column.numberFormat ?? "plain");
      })
    );
  }

  const correlations: { a: string; b: string; r: number }[] = [];
  for (let i = 0; i < numericColumns.length; i++) {
    for (let j = i + 1; j < numericColumns.length; j++) {
      const a = numericColumns[i];
      const b = numericColumns[j];
      const r = correlation(numericValues.get(a.index)!, numericValues.get(b.index)!);
      if (r === null || Math.abs(r) < CORRELATION_THRESHOLD) continue;
      correlations.push({ a: a.name, b: b.name, r });
    }
  }
  correlations.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

  return { rowCount: rows.length, columns, duplicateRows, correlations: correlations.slice(0, 10) };
}
