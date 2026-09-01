#!/usr/bin/env node
/*
 * CAN chart-datakeys.test.mjs TELL A LIVE BINDING FROM AN EMPTY CHART?
 *
 * Recharts resolves `dataKey="value"` at runtime against each datum. A typo
 * compiles, throws nothing, logs nothing, and draws an empty chart — which
 * the reader takes as "there is none of this in your data". Two of the five
 * chart files in this repository describe that trap in prose, and nothing
 * was checking for it.
 *
 * So the mutations are the two ways it really happens: a KEY mistyped, and a
 * FIELD RENAMED with the key left behind. Both are applied to the real
 * files, and the gate is run against them.
 *
 * The gate's own resolver is mutated too, because it is three pieces of
 * cleverness deep — brace-matched type bodies, one level of type reference,
 * and a fresh regex per file — and every one of those was WRONG in the
 * first version, each producing confident false results.
 *
 * Run: node scripts/tests/chart-datakeys.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/chart-datakeys.test.mjs";
const CHART = "src/components/data-analysis/analysis-chart.tsx";
const CHARTS_LIB = "src/lib/data-analysis/charts.ts";
const CARD = "src/components/overview/health-score-card.tsx";

const TARGETS = [GATE, CHART, CHARTS_LIB, CARD];

const MUTANTS = [
  // ---- the two ways it happens in real life --------------------------
  {
    name: "one dataKey is mistyped",
    file: CHART,
    from: 'dataKey="value" fill={COLOURS[0]}',
    to: 'dataKey="valeu" fill={COLOURS[0]}',
    expect: "every chart key names a real field",
  },
  {
    // THE RENAME. tsc is perfectly happy: the type changed and every typed
    // use changed with it. The five strings did not.
    name: "ChartPoint renames value, and the keys are left behind",
    file: CHARTS_LIB,
    from: "export type ChartPoint = { label: string; value: number };",
    to: "export type ChartPoint = { label: string; amount: number };",
    expect: "every chart key names a real field",
  },
  {
    // The inline shape, in a different file, so this is not one file's luck.
    name: "a chart built inline loses the field its key names",
    file: CARD,
    from: "const chartData = trend?.map((count, i) => ({ i, count }));",
    to: "const chartData = trend?.map((total, i) => ({ i, total }));",
    expect: "every chart key names a real field",
  },

  // ---- the gate's own resolver, every piece of which was wrong once ---
  {
    // The first version required the closing brace on its own line, so a
    // one-line type — which ChartPoint is — was invisible, and the gate
    // reported eleven false positives.
    name: "type bodies are read to the end of the line instead of the brace",
    file: GATE,
    from: "      if (depth === 0) return code.slice(openIndex + 1, i);",
    to: "      if (depth === 0) return code.slice(openIndex + 1, openIndex + 2);",
    expect: "every chart key names a real field",
  },
  {
    // The chart file names BuiltChart and never ChartPoint. Stop following
    // the reference and the file this gate exists for stops resolving.
    name: "the resolver stops following one type into another",
    file: GATE,
    from: "function fieldsOf(typeName, depth = 3, seen = new Set()) {",
    to: "function fieldsOf(typeName, depth = 0, seen = new Set()) {",
    expect: "every chart key names a real field",
  },
  {
    // A global regex remembers where it stopped, so .test() in a filter
    // skips every other file. This found four of five.
    //
    // AND THE FLOOR DID NOT CATCH IT. .test() advances lastIndex only on
    // a MATCH and resets on a miss, so the skip needs two chart files
    // ADJACENT in SOURCES — which today's directory order does not
    // produce. This was a survivor for exactly that reason: a real bug
    // that the current file layout hides. The gate now asks the filter
    // the same question twice instead of trusting the corpus to contain
    // the hazard.
    name: "the file filter goes back to the shared global regex",
    file: GATE,
    from: "const hasChartKey = (source) => new RegExp(KEY_ATTR.source).test(source);",
    to: "const hasChartKey = (source) => KEY_ATTR.test(source);",
    expect: "the filter answers the same question twice",
  },
  {
    name: "the attribute pattern stops matching nameKey and dataKey",
    file: GATE,
    from: "const KEY_ATTR = /\\b(?:dataKey|nameKey)=\\{?[\"']([\\w.]+)[\"']\\}?/g;",
    to: "const KEY_ATTR = /\\b(?:dataKeyX)=\\{?[\"']([\\w.]+)[\"']\\}?/g;",
    expect: "chart files were found",
  },
  {
    name: "the scan reads no source at all",
    file: GATE,
    from: "    else if (/\\.tsx?$/.test(entry.name)) out.push(full);",
    to: "    else if (false) out.push(full);",
    expect: "the source was walked",
  },
  // THE COMPARISON CLAUSE HAS NO SECOND READER. Defanging `names.has(key)`
  // leaves a healthy tree green, and pairing it with a real typo changes
  // nothing either — the red-proof section builds its own samples and never
  // looks at the tree. What proves that clause load-bearing is its three
  // SOURCE mutants above: a mistyped key, a renamed type field, and a
  // renamed inline shape, each caught. Saying so is better than a pairing
  // invented to make the count look complete.
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]),
    };
  }
}

console.log("chart-datakeys mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(
    `baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`,
  );
  if (!base.green) {
    console.log(
      `\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`,
    );
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => !originals.get(e.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({
        ...m,
        why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}`,
      });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      byFile.set(e.file, current.replace(e.from, e.to));
    }
    if (
      [...byFile.entries()].every(
        ([file, text]) => text === originals.get(file),
      )
    ) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({
        ...m,
        why: "the gate stayed green — nothing here is load-bearing",
      });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(
        `  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`,
      );
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.",
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
