import { validateChartSpec, type ChartSpec } from "@/lib/data-analysis/charts";
import { jsonSliceOf } from "@/lib/json-from-text";
import { truncate } from "@/lib/text/truncate";
import type { TableProfile } from "@/lib/data-analysis/profile";

/**
 * WHAT THE MODEL IS ASKED, AND WHAT IS DONE WITH THE ANSWER.
 *
 * The division is the same one profile.ts describes and it is the whole
 * safety property of this feature:
 *
 *   THE MODEL NEVER PRODUCES A NUMBER THAT IS DISPLAYED AS FACT. It is
 *   handed statistics that were computed in TypeScript and asked what
 *   they MEAN. Every figure on the screen — every mean, every
 *   correlation, every bar — came out of profile.ts or charts.ts.
 *
 *   EVERY CHART IT PROPOSES IS VALIDATED against the real column list
 *   before it is stored. A model naming "Revenue" when the file says
 *   "revenue_eur" is the commonest failure here, and it renders an empty
 *   axis rather than an error.
 *
 *   A FINDING THAT NAMES A COLUMN THE FILE DOES NOT HAVE IS DROPPED. The
 *   same failure in prose: "sales in the Northeast region rose" about a
 *   file with no region column is a sentence about somebody else's data.
 *
 * Pure. The route does the call; this builds what goes in and checks what
 * comes back.
 */

export type Finding = {
  headline: string;
  detail: string;
  /** Which columns it is about. Checked against the profile. */
  columns: string[];
};

export type AnalysisFindings = {
  summary: string;
  findings: Finding[];
  charts: ChartSpec[];
  /** Questions the data could answer, offered as one-click follow-ups. */
  suggestedQuestions: string[];
};

export type ParseOutcome = {
  findings: AnalysisFindings;
  /** Everything thrown away, with the reason. Surfaced rather than
   *  swallowed: a model that keeps proposing charts for columns that do
   *  not exist is a prompt problem, and a silent filter hides it. */
  rejected: string[];
};

/** How many example rows the model sees. Enough to recognise a format,
 *  few enough that a 50,000-row file and a 50-row file cost the same to
 *  analyse — and few enough that the model is not being handed the
 *  user's whole dataset. */
export const SAMPLE_ROWS = 8;
const MAX_FINDINGS = 8;
const MAX_CHARTS = 4;
const MAX_QUESTIONS = 5;



/**
 * The brief the model reads.
 *
 * IT IS A SUMMARY, NOT THE FILE. The rows are capped at SAMPLE_ROWS and
 * each cell at 80 characters, so the prompt size is set by the number of
 * COLUMNS and not by the size of the upload. That is what makes the price
 * honest (see ACTION_PROFILES.dataAnalyse) and it is also the smaller
 * disclosure: analysing a customer export should not mean posting fifty
 * thousand customer records to a provider.
 */
export function buildProfileBrief(params: {
  fileName: string;
  profile: TableProfile;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}): string {
  const { profile } = params;
  const lines: string[] = [];

  lines.push(`FILE: ${truncate(params.fileName, 120)}`);
  lines.push(`ROWS: ${profile.rowCount}`);
  if (profile.duplicateRows > 0) lines.push(`EXACT DUPLICATE ROWS: ${profile.duplicateRows}`);
  lines.push("");
  lines.push("COLUMNS (name | type | filled/missing | distinct | statistics):");

  for (const column of profile.columns) {
    const bits: string[] = [
      column.name,
      column.type,
      `${column.filled} filled / ${column.missing} missing`,
      `${column.unique} distinct`,
    ];
    if (column.numeric) {
      const n = column.numeric;
      bits.push(
        `min ${round(n.min)}, max ${round(n.max)}, mean ${round(n.mean)}, median ${round(n.median)}, sd ${round(n.stdDev)}, sum ${round(n.sum)}` +
          (n.outlierCount > 0 ? `, ${n.outlierCount} beyond 3sd (e.g. ${n.outlierExamples.map(round).join(", ")})` : "")
      );
    }
    if (column.dateRange) bits.push(`from ${column.dateRange.min} to ${column.dateRange.max}`);
    if (column.type === "text" || column.type === "boolean") {
      bits.push(`commonest: ${column.topValues.map((t) => `${t.value} (${t.count})`).join(", ")}`);
    }
    lines.push(`- ${bits.join(" | ")}`);
  }

  if (profile.correlations.length > 0) {
    lines.push("");
    lines.push("PAIRS THAT MOVE TOGETHER (Pearson's r, computed from the data):");
    for (const c of profile.correlations) lines.push(`- ${c.a} and ${c.b}: r = ${c.r.toFixed(2)}`);
  }

  lines.push("");
  lines.push(`FIRST ${Math.min(SAMPLE_ROWS, params.rows.length)} ROWS (for format only — the statistics above are over the WHOLE file):`);
  lines.push(params.headers.join(" | "));
  for (const row of params.rows.slice(0, SAMPLE_ROWS)) {
    lines.push(row.map((cell) => truncate(String(cell), 80)).join(" | "));
  }

  return lines.join("\n");
}

function round(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) >= 1000 ? Math.round(value) : Math.round(value * 100) / 100;
}

/**
 * The instruction. Written here rather than in the route so the build
 * gate can assert the four refusals are in it.
 */
export const ANALYSIS_SYSTEM = `You are reading a summary of a spreadsheet a user uploaded. Every statistic you are shown was computed from the whole file by the application, not by you.

YOUR JOB is to say what the numbers MEAN — patterns, anomalies, and what is worth looking at next.

FOUR THINGS YOU MUST NOT DO:
1. NEVER state a number that is not in the brief. You cannot see the file. If a figure is not above, you do not know it.
2. NEVER name a column that is not in the COLUMNS list. Use the names exactly as written, including underscores and case.
3. NEVER say what caused something. Two columns moving together is not one causing the other, and you cannot tell the difference from this data. Say what moves with what.
4. NEVER give business, financial, legal or medical advice. Describe what is in the data. The user decides what to do.

If the data does not support an observation, say so and make fewer observations. Four real findings are worth more than eight padded ones.

Reply with JSON only, in exactly this shape:
{
  "summary": "two or three sentences on what this dataset is and its overall shape",
  "findings": [{"headline": "short", "detail": "one or two sentences", "columns": ["exact_column_name"]}],
  "charts": [{"kind": "bar|line|area|pie|scatter", "title": "short", "x": "exact_column_name", "y": "exact_column_name", "aggregation": "sum|mean|count|min|max", "reason": "why this is worth seeing"}],
  "suggestedQuestions": ["a question this data can actually answer"]
}
A chart with aggregation "count" needs no "y". A line or area chart needs a date or numeric x. Reply with the JSON object and nothing else.`;

/**
 * Reads the model's reply, and throws away everything it cannot stand
 * behind.
 */
export function parseAnalysis(raw: string, profile: TableProfile): ParseOutcome {
  const rejected: string[] = [];
  const empty: AnalysisFindings = { summary: "", findings: [], charts: [], suggestedQuestions: [] };

  const json = extractJson(raw);
  if (!json) {
    rejected.push("the reply was not JSON");
    return { findings: empty, rejected };
  }

  const known = new Set(profile.columns.map((c) => c.name));

  const summary = typeof json.summary === "string" ? truncate(json.summary, 800) : "";

  const findings: Finding[] = [];
  for (const candidate of asArray(json.findings)) {
    if (!candidate || typeof candidate !== "object") continue;
    const f = candidate as Record<string, unknown>;
    const headline = typeof f.headline === "string" ? truncate(f.headline, 160) : "";
    const detail = typeof f.detail === "string" ? truncate(f.detail, 600) : "";
    if (!headline) {
      rejected.push("a finding with no headline");
      continue;
    }
    const columns = asArray(f.columns).filter((c): c is string => typeof c === "string");
    // A FINDING ABOUT A COLUMN THAT DOES NOT EXIST is a finding about
    // somebody else's data. Dropped rather than shown with the name
    // silently corrected, because there is nothing to correct it to.
    const unknown = columns.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      rejected.push(`"${headline}" names columns that are not in the file: ${unknown.join(", ")}`);
      continue;
    }
    findings.push({ headline, detail, columns });
    if (findings.length >= MAX_FINDINGS) break;
  }

  const charts: ChartSpec[] = [];
  for (const candidate of asArray(json.charts)) {
    const verdict = validateChartSpec(candidate, profile);
    if (!verdict.ok) {
      rejected.push(`a chart was refused: ${verdict.reason}`);
      continue;
    }
    charts.push(verdict.spec);
    if (charts.length >= MAX_CHARTS) break;
  }

  const suggestedQuestions = asArray(json.suggestedQuestions)
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => truncate(q, 200))
    .slice(0, MAX_QUESTIONS);

  return { findings: { summary, findings, charts, suggestedQuestions }, rejected };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * The JSON out of a reply that may be wrapped in a fence or preceded by
 * a sentence.
 *
 * BALANCED, not `indexOf("{")` to `lastIndexOf("}")`. A reply containing
 * a JSON object followed by prose containing a brace produces a slice
 * that is not parseable, and a reply with a brace inside a string value
 * defeats the naive version in the other direction.
 */
export function extractJson(raw: string): Record<string, unknown> | null {
  // ONE SCANNER — see lib/json-from-text.ts. This function had its own,
  // and its own looked only for `{`: given `[{"a":1}]` it found the brace
  // INSIDE the array and returned the first element as if it were the
  // whole answer. A wrong value that looks like a right one.
  const slice = jsonSliceOf(raw);
  if (slice === null) return null;
  try {
    const parsed = JSON.parse(slice);
    // AN ARRAY IS NOT AN OBJECT, and this function promises an object.
    // Refusing is the honest answer; the old code substituted an element.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
