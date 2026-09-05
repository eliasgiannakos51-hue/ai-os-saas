// THE INSTRUMENT THAT REPORTS ON NINETY OTHER INSTRUMENTS, CHECKED.
//
// scripts/tests/run-mutations.mjs is the only thing that ever says
// whether the mutation suites work. Nothing checked it. On 2026-09-05 it
// printed, for a run with no DATABASE_URL:
//
//     OK   user-isolation                                0s
//     89 suites · 89 green · 0 red
//     ALL MUTATION SUITES GREEN
//
// user-isolation.mutation.mjs mutates the database schema. It printed
// "SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real
// Postgres.", exited 0, applied none of its nine mutants, and was
// counted as one of the eighty-nine green. Nine schema leaks could have
// been live and the line would have read the same.
//
// This file holds the fix two ways, because a check on a classifier is
// only half of it:
//
//   1. BEHAVIOUR — classify() from scripts/tests/lib/mutation-outcome.mjs
//      is run on the exact stdout shapes the real suites print, read out
//      of the real files rather than invented here.
//   2. WIRING — run-mutations.mjs actually calls it, and its summary
//      line and closing line cannot say "green" or "ALL ... GREEN" for a
//      run that skipped something. A perfect classifier nobody imports
//      is the same bug in a nicer place.
//
// Run: node scripts/tests/mutation-runner-honesty.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { classify } from "./lib/mutation-outcome.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const DIR = "scripts/tests";
const RUNNER = path.join(DIR, "run-mutations.mjs");
const runner = readFileSync(RUNNER, "utf8");

// ---------------------------------------------------------------------
console.log("\n== 1. a skip is not a pass ==");

const REAL_SKIP = "SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real Postgres.";
check(
  "the skip line this test uses is the one user-isolation.mutation.mjs really prints",
  readFileSync(path.join(DIR, "user-isolation.mutation.mjs"), "utf8").includes(REAL_SKIP),
  "if that suite's wording changed, this whole file is testing a string nobody prints"
);

check(
  'a suite whose whole stdout is that line, exit 0, is "skipped" — not "green"',
  classify({ stdout: REAL_SKIP + "\n", status: 0, leaked: [] }).outcome === "skipped"
);

check(
  "a suite that killed mutants is green",
  classify({ stdout: "  CAUGHT  a thing\n          -> FAIL  the gate\n\nPASS  15 correct, 0 wrong\n", status: 0 })
    .outcome === "green"
);

check(
  "a non-zero exit is red however friendly the stdout",
  classify({ stdout: "  CAUGHT  a thing\n", status: 1 }).outcome === "red"
);

check(
  "a suite that left the tree mutated is red even at exit 0",
  classify({ stdout: "  CAUGHT  a thing\n", status: 0, leaked: ["src/lib/stop-requests.ts"] }).outcome === "red"
);

// CAUGHT WINS OVER THE WORD SKIP. schema-canaries.mutation.mjs really
// does print the word inside a mutation description; a suite that ran
// and killed things is green no matter what its prose says.
check(
  'a suite that both caught mutants and says the word "skipped" somewhere is green',
  classify({
    stdout: "  CAUGHT  the count includes canaries that were SKIPPED: 16\n",
    status: 0,
  }).outcome === "green"
);

// ---------------------------------------------------------------------
console.log("\n== 2. every skip line any suite can print is recognised ==");

// Read them out of the files. A hand-written list here would go stale
// the first time somebody rewords one, and this gate would keep passing.
const skipLines = [];
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".mutation.mjs") || f.endsWith(".dbtest.mjs"))) {
  const src = readFileSync(path.join(DIR, f), "utf8");
  for (const m of src.matchAll(/console\.log\(\s*[`"']([^`"']*\bSKIPP?E?D?\b[^`"']*)[`"']/g)) {
    const line = m[1];
    if (/SKIPP?E?D?\s*[:—-]/.test(line)) skipLines.push({ file: f, line });
  }
}
check(
  `at least eight suites print a skip line (found ${skipLines.length})`,
  skipLines.length >= 8,
  "if this drops to zero the loop above stopped matching and section 2 proves nothing"
);
for (const { file, line } of skipLines) {
  const rendered = line.replace(/\$\{[^}]*\}/g, "no local initdb");
  check(`${file}: "${rendered.slice(0, 52)}..." reads as skipped`, classify({ stdout: rendered + "\n", status: 0 }).outcome === "skipped");
}

// ---------------------------------------------------------------------
console.log("\n== 3. the runner is wired to it ==");

check(
  "run-mutations.mjs imports classify from lib/mutation-outcome.mjs",
  /import\s*\{[^}]*\bclassify\b[^}]*\}\s*from\s*["']\.\/lib\/mutation-outcome\.mjs["']/.test(runner)
);

check(
  "run-mutations.mjs calls it on each suite's stdout, status and leaked files",
  /classify\(\s*\{\s*stdout\s*,\s*status:\s*run\.status\s*,\s*leaked\s*\}\s*\)/.test(runner)
);

// THE COUNT IS THE THING THAT LIED. Not the per-suite line — the tally.
const summary = runner.match(/console\.log\(\s*\n?\s*`\$\{results\.length\} suites[^`]*`/);
check("the summary line still exists", Boolean(summary), "if it moved, everything below is checking nothing");
if (summary) {
  const line = summary[0];
  check(
    "green in the summary counts only suites classified green",
    /\$\{green\.length\} green/.test(line),
    `reads: ${line.replace(/\s+/g, " ")}`
  );
  check("the summary prints the skipped count of its own", /\$\{skippedSuites\.length\} skipped/.test(line));
  check(
    "the summary no longer derives green by subtracting red from the total",
    !/results\.length\s*-\s*red\.length/.test(runner),
    "that subtraction IS the bug: it makes every non-red suite green"
  );
}

check(
  '"ALL MUTATION SUITES GREEN" is guarded by there being no skipped suite',
  /skippedSuites\.length === 0\s*\n?\s*\?\s*"\\nALL MUTATION SUITES GREEN"/.test(runner),
  "an unconditional closing line undoes the whole fix in one string"
);

check(
  "a skipped suite is flagged SKIP in the per-suite line, not OK",
  /outcome === "green" \? "OK " : outcome === "skipped" \? "SKIP"/.test(runner)
);

check(
  "skipped suites are named in their own section",
  /NOT RUN[^"]*these suites printed a skip line/.test(runner)
);

// ---------------------------------------------------------------------
console.log("\n== 4. the floor is not the size of the problem ==");

const floor = Number(runner.match(/const FLOOR = (\d+);/)?.[1]);
const suiteCount = readdirSync(DIR).filter((f) => f.endsWith(".mutation.mjs")).length;
check(`the suite floor (${floor}) is within ten of the real count (${suiteCount})`, floor >= suiteCount - 10 && floor <= suiteCount, "a floor far below the count would not notice most of the directory vanishing");

console.log(`\n${failures.length === 0 ? "PASS" : "FAIL"}  ${pass} correct, ${failures.length} wrong`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
