#!/usr/bin/env node
/*
 * THE TWO QUESTIONS billing-coverage.test.mjs ASKS OF EVERY MODEL CALL,
 * and whether either of them is load-bearing.
 *
 * Section 1b: does the usage reach an accumulator? A call that records
 * nothing bills nothing, and the declaration table above it still reads
 * "settled".
 *
 * Section 1c: does the call NAME its model? Added 2026-09-07, after
 * writing scripts/check-site-spelling.mjs and finding there was no model
 * to report: lib/websites-greek-spelling-check.ts named none, so
 * providers/complete.ts read it as tier "mid" and served claude-sonnet-4-6
 * at 3/15 per MTok instead of the claude-haiku-4-5 at 1/5 that "one cheap
 * classification call" reads like. It was the only such caller in the
 * tree. The money is small — about eight hundredths of a cent per website
 * — and the point is that nobody chose it.
 *
 * A finding whose fix is not held by a gate is a finding that comes back,
 * which is why the second mutation below exists at all.
 *
 * Run: node scripts/tests/billing-coverage.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/billing-coverage.test.mjs";
const SPELLING = "src/lib/websites-greek-spelling-check.ts";
const TARGETS = [GATE, SPELLING];

const MUTANTS = [
  {
    // 1. THE USAGE GOES NOWHERE. The owner pays the provider; the user is
    // charged nothing; every table in this file still says settled.
    name: "a runCompletion caller stops recording its usage",
    file: SPELLING,
    from: '    costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);',
    to: "",
    expect: "no runCompletion() call site drops its usage on the floor",
  },
  {
    // 2. THE MODEL GOES BACK TO BEING A DEFAULT — the exact state this
    // round found. Note that `const MODEL` stays: the mutation removes
    // only its USE, which is the shape the original defect had. A gate
    // that checked for the constant's existence rather than its use would
    // stay green here.
    name: "a runCompletion caller stops naming its model",
    file: SPELLING,
    from: "        model: MODEL,\n",
    to: "",
    expect: "no runCompletion() call site leaves its model to the default tier",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("billing-coverage mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
