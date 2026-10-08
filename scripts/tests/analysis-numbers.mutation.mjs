#!/usr/bin/env node
/*
 * CAN analysis-numbers.test.mjs SEE A NUMBER SHOWN THAT WAS NOT COMPUTED,
 * A FACT THAT IS NOT WHAT IT SAYS, A CHART VALUE WITHOUT ITS ROWS, OR A
 * PRICE THAT IS NOT THE HOLD?
 *
 * A typed number kept, a missing reference kept, a summary sentence kept
 * whole, rounding ignored, a date or a column name read as a number, the
 * sum computed as the mean, a missing count over the wrong rows, the
 * chart's rows dropped, the price quoted without the facts, the reply
 * read without them, the screen drawing plain text, a number rounded away.
 *
 * Run: node scripts/tests/analysis-numbers.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/analysis-numbers.test.mjs";
const FACTS = "src/lib/data-analysis/facts.ts";
const ANALYSE = "src/lib/data-analysis/analyse.ts";
const CHARTS = "src/lib/data-analysis/charts.ts";
const ROUTE = "src/app/api/data-analysis/[id]/analyse/route.ts";
const PRICE = "src/app/api/data-analysis/[id]/price/route.ts";
const SHELL = "src/components/data-analysis/analysis-shell.tsx";

const MUTANTS = [
  {
    name: "a typed number that is no fact is shown",
    file: ANALYSE,
    from: "    if (unknown.length > 0 || stray.length > 0) {",
    to: "    if (unknown.length > 0) {",
    expect: "a typed number that is no fact drops its finding",
  },
  {
    name: "a reference to no fact is shown",
    file: ANALYSE,
    from: "    if (unknown.length > 0 || stray.length > 0) {",
    to: "    if (stray.length > 0) {",
    expect: "a reference to a fact that does not exist drops its finding",
  },
  {
    name: "the summary keeps a sentence with a number that is no fact",
    file: ANALYSE,
    from: "    if (read.unknown.length > 0 || read.stray.length > 0) {",
    to: "    if (false) {",
    expect: "the summary keeps its true sentences and loses the one with 999",
  },
  {
    name: "a typed number must equal the fact exactly",
    file: FACTS,
    from: "      return Math.abs(shown - v) <= step / 2 + 1e-9;",
    to: "      return shown === v;",
    expect: "a typed number rounded as written is the fact it rounds",
  },
  {
    name: "a date written out is read as numbers",
    file: FACTS,
    from: '  const dates = facts.filter((f) => (f.kind === "from" || f.kind === "to") && f.label);',
    to: "  const dates: Fact[] = [];",
    expect: "...a date written out is the date fact",
  },
  {
    name: "a column's value with a digit is read as a number",
    file: FACTS,
    from: "  const named = [...new Set(names.filter((n) => /\\d/.test(n)))].sort((a, b) => b.length - a.length);",
    to: "  const named: string[] = [];",
    expect: "...while «Q1», a value of the file, stays a word",
  },
  {
    name: "a shared number goes to the first fact, not the finding's column",
    file: FACTS,
    from: "      const chosen = matching.find((f) => f.column && preferColumns.includes(f.column)) ?? matching[0];",
    to: "      const chosen = matching[0];",
    expect: "a typed number two facts share is the one about the finding's own column",
  },
  {
    name: "the sum fact is the mean",
    file: FACTS,
    from: '      add({ kind: "sum", value: n.sum, column: c, rows: column.filled });',
    to: '      add({ kind: "sum", value: n.mean, column: c, rows: column.filled });',
    expect: "the sum of «Έσοδα» is",
  },
  {
    name: "a missing count is said over the rows with a value",
    file: FACTS,
    from: '    if (column.missing > 0) add({ kind: "missing", value: column.missing, column: c, rows: profile.rowCount });',
    to: '    if (column.missing > 0) add({ kind: "missing", value: column.missing, column: c, rows: column.filled });',
    expect: "...and the row without a value is counted as missing, not as zero",
  },
  {
    name: "a chart value loses its rows",
    file: CHARTS,
    from: "    rows: values.length,\n",
    to: "",
    expect: "Νάξος: the sum of its three rows with a value, and it says three",
  },
  {
    name: "Other loses the rows it gathered",
    file: CHARTS,
    from: ', rows: rest.reduce((s, p) => s + (p.rows ?? 0), 0) });',
    to: " });",
    expect: "what is gathered into Other carries the rows it gathered",
  },
  {
    name: "the price is quoted without the facts",
    file: PRICE,
    from: '      await isFeatureOn("analysis-provenance", user)\n',
    to: "      false\n",
    expect: "the hold and the quote are both the system prompt and the brief with its facts",
  },
  {
    name: "the reply is read without the facts",
    file: ROUTE,
    from: "    const parsed = withFacts ? parseAnalysisWithFacts(outcome.text, profile, facts, locale) : parseAnalysis(outcome.text, profile);",
    to: "    const parsed = parseAnalysis(outcome.text, profile);",
    expect: "...and reads the reply against the facts it sent",
  },
  {
    name: "the screen draws a finding's detail as plain text",
    file: SHELL,
    from: "{provenance && finding.detailParts ? <FactText parts={finding.detailParts} facts={facts} /> : finding.detail}",
    to: "{finding.detail}",
    expect: "with it, the summary and every finding draw their numbers as facts",
  },
  {
    name: "a computed number is rounded away on the screen",
    file: FACTS,
    from: "  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits:",
    to: "  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0, minimumFractionDigits:",
    expect: "its plain text carries the numbers as Greek writes them",
  },
];

runMutations({ name: "analysis-numbers", gate: GATE, targets: [FACTS, ANALYSE, CHARTS, ROUTE, PRICE, SHELL], mutants: MUTANTS });
