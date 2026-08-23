import { isBlank, parseDate, parseNumber, type TableProfile } from "@/lib/data-analysis/profile";
import { AGGREGATIONS, aggregate, type Aggregation } from "@/lib/data-analysis/charts";
import { foldForMatch } from "@/lib/text/unicode-patterns";

/**
 * ASKING THE DATA A QUESTION — and the answer coming from the DATA.
 *
 * The tempting design is: paste the file into a prompt and let the model
 * answer. It produces fluent, confident, frequently wrong numbers, and
 * there is no way for the user to tell which. A model asked "what was
 * total revenue in the north" over fifty thousand rows does not add them
 * up; it produces a number of the right shape.
 *
 * So the model does the ONE thing it is good at — turning a sentence into
 * a query — and this file does the arithmetic:
 *
 *   "which region sold the most last quarter"
 *      -> { groupBy: "region", measure: "revenue", aggregation: "sum",
 *           filters: [{ column: "date", op: ">=", value: "2024-01-01" }] }
 *      -> executed here, over the real rows
 *      -> a table of numbers the user can see and check
 *
 * The model then gets ONE more job: a sentence framing the result. And
 * `numbersNotInEvidence` refuses any figure in that sentence that is not
 * in the computed result — so the fluent-but-invented number cannot
 * survive to the screen even if it is produced.
 *
 * Pure.
 */

export const FILTER_OPS = ["=", "!=", ">", ">=", "<", "<=", "contains"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export type Filter = { column: string; op: FilterOp; value: string };

export type DataQuery = {
  /** Split the rows by this column. Absent means one bucket: the whole
   *  table. */
  groupBy?: string;
  /** The column being measured. Absent for `count`. */
  measure?: string;
  aggregation: Aggregation;
  filters: Filter[];
  /** How many groups to return, biggest first. */
  limit: number;
};

export type QueryRow = { group: string; value: number; rows: number };
export type QueryResult = {
  query: DataQuery;
  rows: QueryRow[];
  /** Rows that survived every filter. Reported so an answer over three
   *  rows cannot be read as an answer over the file. */
  matchedRows: number;
  totalRows: number;
};

export const MAX_QUERY_GROUPS = 50;

export type QueryVerdict = { ok: true; query: DataQuery } | { ok: false; reason: string };

/**
 * Validates a proposed query against the columns that really exist.
 *
 * Same rule as the chart specs, for the same reason: a query naming a
 * column the file does not have returns an empty result, and an empty
 * result reads as "there is none of that in your data" rather than as
 * "the question was never asked".
 */
export function validateQuery(raw: unknown, profile: TableProfile): QueryVerdict {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not a query" };
  const candidate = raw as Record<string, unknown>;
  const known = new Map(profile.columns.map((c) => [c.name, c]));

  const aggregation = candidate.aggregation;
  if (typeof aggregation !== "string" || !(AGGREGATIONS as readonly string[]).includes(aggregation)) {
    return { ok: false, reason: `unknown aggregation: ${String(aggregation)}` };
  }

  let groupBy: string | undefined;
  if (candidate.groupBy !== undefined && candidate.groupBy !== null) {
    if (typeof candidate.groupBy !== "string" || !known.has(candidate.groupBy)) {
      return { ok: false, reason: `there is no column called ${String(candidate.groupBy)}` };
    }
    groupBy = candidate.groupBy;
  }

  let measure: string | undefined;
  if (aggregation !== "count") {
    if (typeof candidate.measure !== "string" || !known.has(candidate.measure)) {
      return { ok: false, reason: `there is no column called ${String(candidate.measure)}` };
    }
    const column = known.get(candidate.measure)!;
    if (column.type !== "number" && column.type !== "integer") {
      return { ok: false, reason: `${column.name} is not numeric, so it cannot be ${aggregation}med` };
    }
    measure = candidate.measure;
  }

  const filters: Filter[] = [];
  for (const f of Array.isArray(candidate.filters) ? candidate.filters : []) {
    if (!f || typeof f !== "object") continue;
    const raw = f as Record<string, unknown>;
    if (typeof raw.column !== "string" || !known.has(raw.column)) {
      return { ok: false, reason: `a filter names a column that is not in the file: ${String(raw.column)}` };
    }
    if (typeof raw.op !== "string" || !(FILTER_OPS as readonly string[]).includes(raw.op)) {
      return { ok: false, reason: `unknown filter: ${String(raw.op)}` };
    }
    if (typeof raw.value !== "string") return { ok: false, reason: "a filter has no value" };
    filters.push({ column: raw.column, op: raw.op as FilterOp, value: raw.value.slice(0, 200) });
    if (filters.length >= 8) break;
  }

  const limitRaw = Number(candidate.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), MAX_QUERY_GROUPS) : 10;

  return { ok: true, query: { ...(groupBy ? { groupBy } : {}), ...(measure ? { measure } : {}), aggregation: aggregation as Aggregation, filters, limit } };
}

function compare(cellRaw: string, filter: Filter, columnKind: "number" | "date" | "text"): boolean {
  const cell = cellRaw.trim();
  if (filter.op === "contains") {
    // Case- and accent-insensitive, because a filter the user phrased in
    // their own words should not miss "Αθήνα" for "ΑΘΗΝΑ".
    return fold(cell).includes(fold(filter.value));
  }
  if (filter.op === "=" || filter.op === "!=") {
    const same = fold(cell) === fold(filter.value);
    return filter.op === "=" ? same : !same;
  }

  // ORDERED COMPARISONS NEED AN ORDER. Applying > to text compares
  // code points, which is an answer nobody asked for — "greater than
  // London" is not a question — so a text column simply does not match.
  if (columnKind === "number") {
    const a = parseNumber(cell);
    const b = parseNumber(filter.value);
    if (a === null || b === null) return false;
    return filter.op === ">" ? a > b : filter.op === ">=" ? a >= b : filter.op === "<" ? a < b : a <= b;
  }
  if (columnKind === "date") {
    const a = parseDate(cell);
    const b = parseDate(filter.value) ?? (/^\d{4}-\d{2}-\d{2}$/.test(filter.value) ? filter.value : null);
    if (a === null || b === null) return false;
    return filter.op === ">" ? a > b : filter.op === ">=" ? a >= b : filter.op === "<" ? a < b : a <= b;
  }
  return false;
}

// ONE FOLDING PATH FOR THE WHOLE APP. lib/text/unicode-patterns.ts's
// foldForMatch already handles case, diacritics and Greek final sigma
// (ς -> σ), and it is the function the safety filters use. A second
// implementation here would be a second place for "ΑΘΗΝΑ" not to match
// "Αθήνα" — which is exactly the bug that made an entire Greek filter
// match nothing one workstream ago.
const fold = foldForMatch;

export function runQuery(
  query: DataQuery,
  profile: TableProfile,
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): QueryResult {
  const columnOf = (name: string) => profile.columns.find((c) => c.name === name);
  const indexOf = (name: string) => headers.indexOf(name);

  const preparedFilters = query.filters.map((filter) => {
    const column = columnOf(filter.column);
    const kind: "number" | "date" | "text" =
      column && (column.type === "number" || column.type === "integer")
        ? "number"
        : column && column.type === "date"
          ? "date"
          : "text";
    return { filter, index: indexOf(filter.column), kind };
  });

  const measureColumn = query.measure ? columnOf(query.measure) : undefined;
  const measureIndex = query.measure ? indexOf(query.measure) : -1;
  const groupIndex = query.groupBy ? indexOf(query.groupBy) : -1;

  const buckets = new Map<string, number[]>();
  let matchedRows = 0;

  for (const row of rows) {
    let matches = true;
    for (const { filter, index, kind } of preparedFilters) {
      if (index < 0 || !compare(row[index] ?? "", filter, kind)) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    matchedRows++;

    const group = groupIndex >= 0 ? (isBlank(row[groupIndex] ?? "") ? "(blank)" : (row[groupIndex] ?? "").trim()) : "all";

    if (query.aggregation === "count") {
      const bucket = buckets.get(group) ?? [];
      bucket.push(1);
      buckets.set(group, bucket);
      continue;
    }
    if (measureIndex < 0) continue;
    const value = parseNumber(row[measureIndex] ?? "", measureColumn?.numberFormat ?? "plain");
    // A ROW WITH NO MEASURE IS NOT A ZERO — it is a row that cannot
    // contribute. Counting it as zero drags every mean down.
    if (value === null) continue;
    const bucket = buckets.get(group) ?? [];
    bucket.push(value);
    buckets.set(group, bucket);
  }

  const out: QueryRow[] = [...buckets.entries()].map(([group, values]) => ({
    group,
    value: aggregate(query.aggregation, values),
    rows: values.length,
  }));
  out.sort((a, b) => b.value - a.value || a.group.localeCompare(b.group));

  return { query, rows: out.slice(0, query.limit), matchedRows, totalRows: rows.length };
}


/**
 * THE CHECK THAT MAKES THE ANSWER TRUSTWORTHY.
 *
 * Returns every number in the model's sentence that is not in the
 * computed result. A non-empty list means the model produced a figure of
 * its own, which is the exact failure this whole two-step design exists
 * to prevent — so the caller shows the computed table and drops the
 * sentence rather than showing a plausible invention.
 *
 * Tolerant about FORMATTING and strict about VALUE: 1234.5 written as
 * "1,234.5" or rounded to "1235" or "1.2k" is the same number, and
 * treating those as inventions would reject every well-written answer.
 * A number that is not within rounding distance of anything computed is
 * an invention.
 */
export function numbersNotInEvidence(answer: string, result: QueryResult): string[] {
  const evidence = new Set<number>();
  const remember = (n: number) => {
    if (!Number.isFinite(n)) return;
    evidence.add(round2(n));
    evidence.add(Math.round(n));
  };
  remember(result.matchedRows);
  remember(result.totalRows);
  for (const row of result.rows) {
    remember(row.value);
    remember(row.rows);
    // A percentage of the matched rows is a legitimate thing for the
    // sentence to state, and it is arithmetic on numbers that ARE in the
    // evidence rather than a new fact.
    if (result.matchedRows > 0) remember((row.rows / result.matchedRows) * 100);
  }

  const offenders: string[] = [];
  for (const match of answer.matchAll(/-?\d[\d,._]*\d|\d/g)) {
    const literal = match[0];
    const numeric = Number(literal.replace(/[,_ ]/g, ""));
    if (!Number.isFinite(numeric)) continue;
    // Small integers are ordinals, list numbers and years in prose
    // ("the top 3", "in 2024"), not claims about the data.
    if (Number.isInteger(numeric) && Math.abs(numeric) <= 12) continue;
    if (evidence.has(round2(numeric)) || evidence.has(Math.round(numeric))) continue;
    // Within half a percent of something computed: the same number,
    // rounded for readability.
    let close = false;
    for (const value of evidence) {
      if (value === 0) continue;
      if (Math.abs(value - numeric) / Math.abs(value) < 0.005) {
        close = true;
        break;
      }
    }
    if (!close) offenders.push(literal);
  }
  return [...new Set(offenders)];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const QUESTION_SYSTEM = `You turn a question about a spreadsheet into a QUERY. You never answer it yourself: you cannot see the rows, and the application will run your query over the real data and compute the numbers.

You are shown the column names, their types and their statistics. Use the column names EXACTLY as written.

Reply with JSON only:
{
  "query": {
    "groupBy": "exact_column_name or omit for the whole table",
    "measure": "exact numeric column name, omit when aggregation is count",
    "aggregation": "sum|mean|count|min|max",
    "filters": [{"column": "exact_column_name", "op": "=|!=|>|>=|<|<=|contains", "value": "..."}],
    "limit": 10
  },
  "framing": "one sentence introducing what the result shows, WITHOUT any numbers in it"
}

The framing must contain NO figures. The application fills in the numbers from the real result; any number you write there will be removed.
If the question cannot be answered from these columns, reply {"error": "why not"} instead.`;
