#!/usr/bin/env node
/*
 * RUN EVERY GATE, AND PRINT ALMOST NOTHING UNLESS ONE FAILS.
 *
 * ------------------------------------------------------------------
 * THE MEASUREMENT THAT PRODUCED THIS, 2026-09-25
 * ------------------------------------------------------------------
 *
 * `npm run build` printed 27,550 lines. 22,132 of them — EIGHTY PERCENT
 * — were the word PASS. The old runner was:
 *
 *     for f in scripts/tests/*.test.mjs; do echo "--- $f"; node "$f" || exit 1; done
 *
 * so every gate's entire output went to the log whether it mattered or
 * not.
 *
 * THE COST WAS NOT UNTIDINESS. The owner reported five red Vercel builds
 * and each time the log "showed PASS on the spreadsheet tests and then
 * cut off". csv-import.test.mjs is gate 67 of 290 and sits at line 3,291.
 * A build log that is truncated at a few thousand lines ENDS THERE — so
 * the log stops long before any failure is reached, and the failing line,
 * which is the only thing anybody needed, is never in the part that
 * survives.
 *
 * Five investigations went into "what breaks on Vercel" when the real
 * question was "why can nobody see it". Every clean-room reproduction
 * came back green, which was true and useless.
 *
 * ------------------------------------------------------------------
 * SO: SILENCE ON SUCCESS, EVERYTHING ON FAILURE
 * ------------------------------------------------------------------
 *
 * One line per gate when it passes. On the first failure, the whole of
 * THAT gate's output, verbatim, and nothing after it — so the last thing
 * in the log is always the thing that went wrong, however aggressively
 * the log is truncated at the top.
 *
 * WHAT IS NOT LOST. Every gate still runs and still decides; this changes
 * what is PRINTED, never what is checked. A gate's own tally is parsed
 * out of its output and shown, so the per-gate numbers this repository
 * relies on are still visible — and the totals are printed at the end,
 * where a truncated log is most likely to keep them.
 *
 * `--verbose` restores the old behaviour for a developer who wants to
 * read a passing gate's output.
 *
 * Run: node scripts/tests/run-gates.mjs
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const DIR = "scripts/tests";
const VERBOSE = process.argv.includes("--verbose");

const gates = readdirSync(DIR)
  .filter((f) => f.endsWith(".test.mjs"))
  .sort();

if (gates.length === 0) {
  // A RUNNER THAT FOUND NOTHING MUST NOT SAY "ALL PASS". An empty list
  // passes every assertion about it, which is the failure this
  // repository gates against in a dozen places.
  console.error("run-gates: no *.test.mjs found in " + DIR + " — nothing was checked.");
  process.exit(2);
}

/** The gate's own "N passed, M failed", if it printed one. */
function tallyOf(out) {
  const m =
    out.match(/(\d+) passed, (\d+) failed/) ??
    out.match(/ALL (\d+) CHECKS PASSED/);
  if (!m) return null;
  return m[2] === undefined ? { passed: Number(m[1]), failed: 0 } : { passed: Number(m[1]), failed: Number(m[2]) };
}

let totalPassed = 0;
let totalFailed = 0;
let ran = 0;
const started = Date.now();

for (const file of gates) {
  const path = join(DIR, file);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path], { encoding: "utf8", stdio: "pipe" });
  const ms = Date.now() - t0;
  const out = String(r.stdout ?? "") + String(r.stderr ?? "");
  ran++;

  // A NULL STATUS IS NOT A VERDICT — the child was killed or never ran,
  // and this has measured nothing. ci-build.mjs learned the same lesson
  // the hard way and says so in its own header.
  if (r.error || r.status === null) {
    console.log(`\n${"!".repeat(70)}`);
    console.log(`THE GATE DID NOT RUN: ${path}`);
    console.log(r.error ? String(r.error) : `killed by signal ${r.signal}`);
    console.log("Nothing above this line is a verdict.");
    console.log(`${"!".repeat(70)}`);
    process.exit(2);
  }

  const tally = tallyOf(out);
  if (tally) {
    totalPassed += tally.passed;
    totalFailed += tally.failed;
  }

  if (r.status !== 0) {
    // THE FAILURE IS THE LAST THING IN THE LOG, whole and unabridged.
    console.log(`\n${"=".repeat(70)}`);
    console.log(`FAILED: ${path}   (gate ${ran} of ${gates.length}, exit ${r.status})`);
    console.log(`${"=".repeat(70)}\n`);
    console.log(out.trimEnd());
    console.log(`\n${"=".repeat(70)}`);
    console.log(`THE BUILD FAILED IN: ${path}`);
    console.log(`${gates.length - ran} gate(s) after it were not run.`);
    console.log(`${"=".repeat(70)}`);
    process.exit(1);
  }

  if (VERBOSE) {
    console.log(`--- ${path}`);
    console.log(out.trimEnd());
  } else {
    const label = tally ? `${tally.passed} checks` : "ok";
    console.log(`  ok  ${file.padEnd(44)} ${String(label).padStart(10)}  ${ms}ms`);
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `\nALL ${gates.length} GATES PASSED — ${totalPassed} checks, ${totalFailed} failed, ${seconds}s`
);
