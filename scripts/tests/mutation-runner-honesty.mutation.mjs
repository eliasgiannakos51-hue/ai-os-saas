#!/usr/bin/env node
/*
 * CAN mutation-runner-honesty.test.mjs SEE A SKIP BECOME A PASS AGAIN?
 *
 * The gate it guards is the one that reports on the other ninety, so the
 * defect it exists for is one word wide: a suite that never ran counted
 * into a green tally. Eight mutations put that back in eight different
 * places — twice inside the classifier, five times inside the runner
 * that prints the number, and once inside the gate's OWN reader, because
 * a fixture that quietly matches nothing would let every other clause
 * here pass on an empty list.
 *
 * Run: node scripts/tests/mutation-runner-honesty.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/mutation-runner-honesty.test.mjs";
const LIB = "scripts/tests/lib/mutation-outcome.mjs";
const RUNNER = "scripts/tests/run-mutations.mjs";

const MUTANTS = [
  {
    // 1. THE REGEX BUG THAT REALLY HAPPENED WHILE WRITING THIS. `?` binds
    // to the last character, so /SKIPPED?/ requires "SKIPPE" and reads
    // "SKIP:" as ordinary prose. One of the sixteen skip lines in this
    // directory is exactly "SKIP:", and under the first draft that suite
    // would have gone on counting as green.
    name: "the skip reader loses the short SKIP form (SKIPPED? instead of SKIP(?:PED)?)",
    file: LIB,
    from: "const SKIP = /^\\s*(?:\\S+:\\s*)?SKIP(?:PED)?\\b\\s*[:—-]/m;",
    to: "const SKIP = /^\\s*(?:\\S+:\\s*)?SKIPPED?\\b\\s*[:—-]/m;",
    expect: "mrr-paid-only.dbtest.mjs",
  },
  {
    // 2. THE ANSWER GOES BACK TO GREEN. Not the detection — the verdict.
    // Everything still recognises the skip; the classifier just calls it
    // a pass, which is the state the runner was in for its whole life.
    name: 'a recognised skip is reported as "green" again',
    file: LIB,
    from: 'if (!CAUGHT.test(stdout) && SKIP.test(stdout)) return { outcome: "skipped", missed, stale };',
    to: 'if (!CAUGHT.test(stdout) && SKIP.test(stdout)) return { outcome: "green", missed, stale };',
    expect: 'is "skipped"',
  },
  {
    // 3. THE POISONED-TREE CLAUSE. A suite that exits 0 having left a
    // mutation on disk is the failure this runner was written for in the
    // first place; dropping `leaked` from the verdict undoes that half.
    name: "a suite that left the tree mutated stops counting as red",
    file: LIB,
    from: 'if (status !== 0 || leaked.length > 0) return { outcome: "red", missed, stale };',
    to: 'if (status !== 0) return { outcome: "red", missed, stale };',
    expect: "left the tree mutated is red even at exit 0",
  },
  {
    // 4. THE SUBTRACTION. This is the line that lied: green derived as
    // "everything that is not red", which makes a skipped suite green by
    // arithmetic no matter how carefully it was classified above.
    name: "the summary goes back to deriving green as total-minus-red",
    file: RUNNER,
    from: "`${results.length} suites · ${green.length} green · ${skippedSuites.length} skipped · ${red.length} red`",
    to: "`${results.length} suites · ${results.length - red.length} green · ${red.length} red`",
    expect: "no longer derives green by subtracting red from the total",
  },
  {
    // 5. THE CLOSING SENTENCE, UNCONDITIONAL. Every count above can be
    // right and the last line still tells the reader what they wanted to
    // hear. It is the line people quote.
    name: '"ALL MUTATION SUITES GREEN" is printed whatever was skipped',
    file: RUNNER,
    from: '    : skippedSuites.length === 0\n      ? "\\nALL MUTATION SUITES GREEN"',
    to: '    : true\n      ? "\\nALL MUTATION SUITES GREEN"',
    expect: "is guarded by there being no skipped suite",
  },
  {
    // 6. THE PER-SUITE LINE. `OK   user-isolation  0s` is what a reader
    // scrolling the log actually sees, and it is where the lie is most
    // convincing: it names the file.
    name: "a skipped suite is flagged OK again in the per-suite line",
    file: RUNNER,
    from: 'const flag = outcome === "green" ? "OK " : outcome === "skipped" ? "SKIP" : "RED";',
    to: 'const flag = ok ? "OK " : "RED";',
    expect: "flagged SKIP in the per-suite line",
  },
  {
    // 7. THE FLOOR SET TO THE SIZE OF THE PROBLEM. 30 was right when
    // there were 30 suites. At 90 it would let sixty files vanish
    // without a word, which is the same "an empty list satisfies the
    // check" shape the floor exists to stop.
    name: "the suite floor drops back to a third of the real count",
    file: RUNNER,
    from: "const FLOOR = 85;",
    to: "const FLOOR = 30;",
    expect: "suite floor",
  },
  {
    // 8. THE GATE'S OWN READER. Section 2 checks every skip line in the
    // directory by finding them; a reader that finds none reports the
    // same clean "all recognised" as one that finds sixteen. Only the
    // floor above it can tell those apart, so this is the mutation that
    // proves the floor is load-bearing rather than decorative.
    name: "the gate's skip-line reader matches nothing, so section 2 checks an empty list",
    file: GATE,
    from: "    if (/SKIPP?E?D?\\s*[:—-]/.test(line)) skipLines.push({ file: f, line });",
    to: "    if (false) skipLines.push({ file: f, line });",
    expect: "print a skip line",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("mutation-runner-honesty mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
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
console.log("A skip counted as green, in the classifier, in the tally, in the closing line, and in this gate's own reader, are each red.");
