import type { TableProfile } from "@/lib/data-analysis/profile";

/**
 * EVERY NUMBER IN A FINDING SAYS HOW IT WAS MADE (MASTER 16, package 16:
 * «ανεβάζω Excel, παίρνω γράφημα και εξήγηση, και βλέπω πώς βγήκε κάθε
 * αριθμός»), behind the switch "analysis-provenance".
 *
 * analyse.ts already keeps the model away from the rows: it is handed
 * statistics computed here and asked what they mean. What it still did was
 * TYPE the numbers back into its prose — "sales averaged 1,240" — and a
 * typed number is one nobody can follow back to the file: rounded, mixed
 * up with another column's, or simply invented.
 *
 * So every statistic the brief shows becomes a FACT with an id, [F7], and
 * the model writes {F7} where the number goes. The application puts the
 * number in, formatted for the reader, and the screen can say of each one
 * what it is: "the sum of «Έσοδα», over 120 rows with a value".
 *
 * A NUMBER THE MODEL TYPES ANYWAY is matched against the facts: one that
 * is a fact's value, as rounded as it was written, becomes that fact; one
 * that is not stops the finding it is in (and the summary sentence) from
 * being shown — the same rule analyse.ts applies to a column that does not
 * exist. A figure on the screen is a figure the code computed, or it is
 * not on the screen.
 *
 * Pure. api/data-analysis/[id]/analyse runs it; scripts/tests/
 * analysis-numbers.test.mjs reads a real workbook through it.
 */

export const FACT_KINDS = [
  "rows",
  "duplicates",
  "sum",
  "mean",
  "median",
  "min",
  "max",
  "missing",
  "distinct",
  "outliers",
  "topCount",
  "r",
  "from",
  "to",
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export type Fact = {
  id: string;
  kind: FactKind;
  /** The number. A date fact (from, to) carries NaN and its date in `label`. */
  value: number;
  column?: string;
  /** The second column of a correlation. */
  other?: string;
  /** The value counted (topCount), or the date (from, to). */
  label?: string;
  /** How many rows it was computed over, where that is one number. */
  rows?: number;
};

/** Enough for a wide file; the brief stays bounded by its columns. */
export const MAX_FACTS = 200;
const TOP_VALUES_AS_FACTS = 5;

export function buildFacts(profile: TableProfile): Fact[] {
  const facts: Fact[] = [];
  const add = (fact: Omit<Fact, "id">) => {
    if (facts.length < MAX_FACTS) facts.push({ id: `F${facts.length + 1}`, ...fact });
  };
  add({ kind: "rows", value: profile.rowCount, rows: profile.rowCount });
  if (profile.duplicateRows > 0) add({ kind: "duplicates", value: profile.duplicateRows, rows: profile.rowCount });
  for (const column of profile.columns) {
    const c = column.name;
    if (column.missing > 0) add({ kind: "missing", value: column.missing, column: c, rows: profile.rowCount });
    add({ kind: "distinct", value: column.unique, column: c, rows: column.filled });
    if (column.numeric) {
      const n = column.numeric;
      add({ kind: "sum", value: n.sum, column: c, rows: column.filled });
      add({ kind: "mean", value: n.mean, column: c, rows: column.filled });
      add({ kind: "median", value: n.median, column: c, rows: column.filled });
      add({ kind: "min", value: n.min, column: c, rows: column.filled });
      add({ kind: "max", value: n.max, column: c, rows: column.filled });
      if (n.outlierCount > 0) add({ kind: "outliers", value: n.outlierCount, column: c, rows: column.filled });
    }
    if (column.dateRange) {
      add({ kind: "from", value: Number.NaN, column: c, label: column.dateRange.min });
      add({ kind: "to", value: Number.NaN, column: c, label: column.dateRange.max });
    }
    if (column.type === "text" || column.type === "boolean") {
      for (const top of column.topValues.slice(0, TOP_VALUES_AS_FACTS)) {
        add({ kind: "topCount", value: top.count, column: c, label: top.value, rows: column.filled });
      }
    }
  }
  for (const pair of profile.correlations) add({ kind: "r", value: pair.r, column: pair.a, other: pair.b });
  return facts;
}

/** What the brief shows the model: the same rounding the brief already uses. */
export function roundForBrief(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) >= 1000 ? Math.round(value) : Math.round(value * 100) / 100;
}

const KIND_WORDS: Record<FactKind, string> = {
  rows: "rows in the file",
  duplicates: "rows identical to an earlier row",
  sum: "sum of",
  mean: "mean of",
  median: "median of",
  min: "smallest value of",
  max: "largest value of",
  missing: "rows with no value in",
  distinct: "distinct values in",
  outliers: "values beyond 3 standard deviations in",
  topCount: "rows where",
  r: "Pearson's r between",
  from: "first date in",
  to: "last date in",
};

/** The facts block appended to the brief, one per line: `[F7] sum of "Έσοδα" = 4950.8 (5 rows)`. */
export function renderFactsForModel(facts: readonly Fact[]): string {
  const lines = facts.map((f) => {
    const what =
      f.kind === "rows" || f.kind === "duplicates"
        ? KIND_WORDS[f.kind]
        : f.kind === "topCount"
          ? `${KIND_WORDS.topCount} "${f.column}" is "${f.label}"`
          : f.kind === "r"
            ? `${KIND_WORDS.r} "${f.column}" and "${f.other}"`
            : `${KIND_WORDS[f.kind]} "${f.column}"`;
    const value = f.kind === "from" || f.kind === "to" ? f.label : f.kind === "r" ? f.value.toFixed(2) : String(roundForBrief(f.value));
    return `[${f.id}] ${what} = ${value}${f.rows !== undefined && f.kind !== "rows" ? ` (${f.rows} rows)` : ""}`;
  });
  return `FACTS (every number you may use; write {F1}, {F2}… where the number goes, never the digits):\n${lines.join("\n")}`;
}

/** Put in the brief, before the facts, when the switch is on. */
export const FACTS_RULE = `
NUMBERS: this brief ends with a FACTS list. In "summary", "headline" and "detail", write every number and every date as its fact's reference in braces — "{F7}" — and never type the digits yourself. The application puts the number in and shows the reader how it was computed. A sentence that needs a number that is not in FACTS is a sentence you cannot write.`;

export type TextPart = { text: string } | { fact: string };

const REF = /\{(F\d{1,3})\}/g;
// A number as a person or a model writes it: 1,240 · 1.240,5 · 12.5 · -3 · 45%.
const NUMBER = /-?\d[\d.,]*\d|-?\d/g;

/** The written number, read both ways a spreadsheet writes it; and how many decimals it shows. */
function readWritten(written: string): { values: number[]; decimals: number[] } {
  const values: number[] = [];
  const decimals: number[] = [];
  const plain = written.replace(/,/g, "");
  const european = written.replace(/\./g, "").replace(",", ".");
  for (const candidate of [plain, european]) {
    const value = Number(candidate);
    if (!Number.isFinite(value)) continue;
    values.push(value);
    decimals.push(candidate.includes(".") ? candidate.length - candidate.indexOf(".") - 1 : 0);
  }
  return { values, decimals };
}

/**
 * The facts a typed number can only be: equal to the fact's value once it
 * is rounded as the number was written (1,240 is a mean of 1,240.4; 1,240
 * is not a mean of 1,250).
 */
export function factsMatching(written: string, facts: readonly Fact[]): Fact[] {
  const { values, decimals } = readWritten(written);
  return facts.filter((f) => {
    if (!Number.isFinite(f.value)) return false;
    return values.some((v, i) => {
      const step = 10 ** -decimals[i];
      const shown = f.kind === "r" ? Math.round(f.value * 100) / 100 : f.value;
      return Math.abs(shown - v) <= step / 2 + 1e-9;
    });
  });
}

export type ResolvedText = {
  parts: TextPart[];
  /** References to facts that do not exist. */
  unknown: string[];
  /** Numbers typed that are no fact's value. */
  stray: string[];
};

/**
 * A finding's text, as parts: words, and facts. `preferColumns` picks
 * between facts a typed number could equally be, by the columns the
 * finding is about.
 */
export function resolveText(
  text: string,
  facts: readonly Fact[],
  preferColumns: readonly string[] = [],
  /** Names that are words even with a digit in them: the file's columns and values ("Q3", "Region 2"). */
  names: readonly string[] = []
): ResolvedText {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const parts: TextPart[] = [];
  const unknown: string[] = [];
  const stray: string[] = [];
  const dates = facts.filter((f) => (f.kind === "from" || f.kind === "to") && f.label);
  const named = [...new Set(names.filter((n) => /\d/.test(n)))].sort((a, b) => b.length - a.length);

  const pushWords = (words: string) => {
    if (!words) return;
    // A NAME IS NOT A NUMBER: "Q3" in a finding about the column Q3.
    for (const name of named) {
      const at = words.indexOf(name);
      if (at >= 0) {
        pushWords(words.slice(0, at));
        parts.push({ text: name });
        pushWords(words.slice(at + name.length));
        return;
      }
    }
    // A date written out is the date fact it is.
    for (const d of dates) {
      const at = words.indexOf(d.label!);
      if (at >= 0) {
        pushWords(words.slice(0, at));
        parts.push({ fact: d.id });
        pushWords(words.slice(at + d.label!.length));
        return;
      }
    }
    let last = 0;
    for (const m of words.matchAll(NUMBER)) {
      const matching = factsMatching(m[0], facts);
      if (matching.length === 0) {
        stray.push(m[0]);
        continue;
      }
      const chosen = matching.find((f) => f.column && preferColumns.includes(f.column)) ?? matching[0];
      if (m.index! > last) parts.push({ text: words.slice(last, m.index) });
      parts.push({ fact: chosen.id });
      last = m.index! + m[0].length;
    }
    if (last < words.length) parts.push({ text: words.slice(last) });
  };

  let last = 0;
  for (const m of text.matchAll(REF)) {
    pushWords(text.slice(last, m.index));
    if (byId.has(m[1])) parts.push({ fact: m[1] });
    else unknown.push(m[1]);
    last = m.index! + m[0].length;
  }
  pushWords(text.slice(last));
  return { parts: mergeWords(parts), unknown, stray };
}

function mergeWords(parts: TextPart[]): TextPart[] {
  const out: TextPart[] = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    if ("text" in part && prev && "text" in prev) prev.text += part.text;
    else out.push({ ...part });
  }
  return out;
}

/**
 * A fact's number as the reader writes it — to two decimals, never
 * rounded further: the screen shows what was computed (1,500.5), even
 * where the brief rounded it for the model (1501).
 */
export function formatFact(fact: Fact, locale: string): string {
  if (fact.kind === "from" || fact.kind === "to") return fact.label ?? "";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: fact.kind === "r" ? 2 : 0 }).format(fact.value);
}

/** The parts as plain text, numbers in — what a page without the switch draws. */
export function partsToText(parts: readonly TextPart[], facts: readonly Fact[], locale: string): string {
  const byId = new Map(facts.map((f) => [f.id, f]));
  return parts.map((p) => ("text" in p ? p.text : byId.has(p.fact) ? formatFact(byId.get(p.fact)!, locale) : "")).join("");
}

/** The ids a set of parts refers to, in order, once each. */
export function factIdsIn(...texts: (readonly TextPart[] | undefined)[]): string[] {
  const ids: string[] = [];
  for (const parts of texts) for (const p of parts ?? []) if ("fact" in p && !ids.includes(p.fact)) ids.push(p.fact);
  return ids;
}
