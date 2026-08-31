#!/usr/bin/env node
/*
 * IS A MUTANT IN THE TREE RIGHT NOW?
 *
 * ------------------------------------------------------------------
 * WHY check-mutation-markers.mjs IS NOT ENOUGH, MEASURED
 * ------------------------------------------------------------------
 *
 * That file looks for the SHAPES a defanged guard takes: `if (true)`,
 * `if (false)`, `/(?!)/`, an eslint no-unreachable disable. Every one was
 * measured at zero occurrences before it was written, which is why it has
 * no false positives and why people do not learn to bypass it.
 *
 * It cannot see a mutation that leaves no shape behind. This was run as an
 * experiment rather than reasoned about: the exact mutant a killed run
 * left in the tree during the session that wrote this file —
 *
 *     -    if (stripped.length === ch.length) folded = stripped;
 *     +    folded = stripped;
 *
 * — produces `mutation-markers: clean (1274 files)` and exit 0. There is
 * no marker. It is a deleted line, and a deleted line looks exactly like
 * a deliberate simplification. That guard is load-bearing for Korean,
 * Thai, Hebrew, Devanagari and Arabic.
 *
 * ------------------------------------------------------------------
 * SO THIS ASKS A DIFFERENT QUESTION
 * ------------------------------------------------------------------
 *
 * Not "does the tree contain a suspicious shape" but "is a mutation this
 * repository knows how to make CURRENTLY APPLIED". Three ways, in
 * decreasing order of certainty:
 *
 *   1. A SIDECAR EXISTS. Both kinds — the shared one and the guard
 *      scanner's directory — are deleted on a clean finish, so either one
 *      existing means a run died holding a mutation. No ambiguity, no
 *      false positives, and it is the check that would have caught the
 *      incident above.
 *
 *   2. A LITERAL MUTATION IS IN PLACE. Every *.mutation.mjs declares its
 *      mutations as `from`/`to` string pairs. If a target file no longer
 *      contains the `from` but does contain the `to`, that mutation is
 *      applied. Exact, and it names which suite and which mutation.
 *
 *   3. A MUTATION TARGET IS DIRTY. The weakest of the three and the only
 *      one that can be wrong: a developer editing one of those files has
 *      a dirty tree for an ordinary reason. So it FAILS IN CI, where the
 *      tree starts clean and dirtiness can only be a leftover, and prints
 *      loudly everywhere else. A rule with false positives is a rule
 *      people learn to pass with --no-verify — that lesson is in
 *      check-mutation-markers.mjs's own header and it applies here.
 *
 * Run: node scripts/check-mutation-tree.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const DIR = "scripts/tests";
const SHARED_SIDECAR = join(DIR, ".mutation-sidecar.json");
const GUARD_SIDECAR_DIR = join(DIR, ".guard-sidecar");

const problems = [];
const notes = [];

// ---------------------------------------------------------------------
// 1. A sidecar exists at all.
// ---------------------------------------------------------------------
if (existsSync(SHARED_SIDECAR)) {
  let files = [];
  try {
    files = Object.keys(JSON.parse(readFileSync(SHARED_SIDECAR, "utf8")));
  } catch {
    files = ["(unreadable)"];
  }
  problems.push(
    `A mutation run was killed and never restored:\n` +
      files.map((f) => `      ${f}`).join("\n") +
      `\n    Run any mutation suite, or \`node -e 'await import("./scripts/tests/lib/sidecar-write.mjs")'\`, to heal it.`
  );
}
if (existsSync(GUARD_SIDECAR_DIR) && readdirSync(GUARD_SIDECAR_DIR).length > 0) {
  problems.push(
    `scripts/tests/unguarded-guards.mjs was killed holding a guard removed:\n` +
      readdirSync(GUARD_SIDECAR_DIR).map((f) => `      ${f}`).join("\n") +
      `\n    Re-run that script to heal it — it restores from the sidecar on startup.`
  );
}

// ---------------------------------------------------------------------
// 2. A literal mutation from a suite is currently applied.
// ---------------------------------------------------------------------
// Parsed from the source rather than by importing the suites: importing
// one runs it, which would mutate the tree this is trying to inspect.
const PAIR = /\bfile:\s*(?:"([^"]+)"|([A-Z_][A-Z_0-9]*))\s*,\s*\n\s*(?:\/\/[^\n]*\n\s*)*from:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,\s*\n\s*(?:\/\/[^\n]*\n\s*)*to:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;

function unquote(literal) {
  try {
    return JSON.parse(literal.startsWith("'") ? `"${literal.slice(1, -1).replace(/"/g, '\\"')}"` : literal);
  } catch {
    return null;
  }
}

let pairsSeen = 0;
const applied = [];
for (const suite of readdirSync(DIR).filter((f) => f.endsWith(".mutation.mjs"))) {
  const src = readFileSync(join(DIR, suite), "utf8");
  // The file constants a suite declares, so `file: GATE` resolves.
  const consts = new Map();
  for (const m of src.matchAll(/^const ([A-Z_][A-Z_0-9]*)\s*=\s*"([^"]+)";$/gm)) consts.set(m[1], m[2]);

  for (const m of src.matchAll(PAIR)) {
    const target = m[1] ?? consts.get(m[2]);
    const from = unquote(m[3]);
    const to = unquote(m[4]);
    if (!target || from === null || to === null) continue;
    pairsSeen++;
    // A `to` that is empty or trivially short cannot be searched for
    // without false positives; those are covered by check 3.
    if (to.trim().length < 12) continue;
    if (!existsSync(target)) continue;
    let text;
    try {
      text = readFileSync(target, "utf8");
    } catch {
      continue;
    }
    if (!text.includes(from) && text.includes(to)) {
      applied.push(`${target}\n      applied by ${suite}: ${to.trim().slice(0, 70).replace(/\n/g, " ⏎ ")}`);
    }
  }
}
notes.push(`${pairsSeen} literal mutation(s) declared across the suites`);
if (applied.length > 0) {
  problems.push(`A declared mutation is APPLIED in the working tree:\n      ${applied.join("\n      ")}`);
}

// ---------------------------------------------------------------------
// 3. A file any suite mutates is dirty.
// ---------------------------------------------------------------------
const targets = new Set();
for (const suite of readdirSync(DIR).filter((f) => f.endsWith(".mutation.mjs"))) {
  const src = readFileSync(join(DIR, suite), "utf8");
  const consts = new Map();
  for (const m of src.matchAll(/^const ([A-Z_][A-Z_0-9]*)\s*=\s*"([^"]+)";$/gm)) consts.set(m[1], m[2]);
  for (const m of src.matchAll(/\bfile:\s*(?:"([^"]+)"|([A-Z_][A-Z_0-9]*))/g)) {
    const t = m[1] ?? consts.get(m[2]);
    if (t && existsSync(t) && statSync(t).isFile()) targets.add(t);
  }
}
// unguarded-guards.mjs mutates every file it scans, and it names them by
// scanning rather than by listing — so its whole corpus counts.
targets.add("src/lib/text/unicode-patterns.ts");
notes.push(`${targets.size} file(s) are mutated by at least one suite`);

let dirty = [];
try {
  const out = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" });
  dirty = out
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter((p) => p && targets.has(p));
} catch {
  notes.push("git status could not be read — check 3 skipped");
}

const inCI = Boolean(process.env.CI);
if (dirty.length > 0) {
  const message =
    `${dirty.length} file(s) a mutation suite touches are uncommitted:\n      ` +
    dirty.join("\n      ") +
    `\n    In CI the tree starts clean, so this can only be a leftover.`;
  if (inCI) problems.push(message);
  else notes.push(`WARNING (not failing outside CI): ${message}`);
}

// ---------------------------------------------------------------------
console.log(`mutation-tree: ${notes.join("; ")}`);
if (problems.length > 0) {
  console.error("\nMUTATION LEFT IN THE TREE:\n");
  for (const p of problems) console.error(`  - ${p}\n`);
  console.error(
    "check-mutation-markers.mjs cannot see this: a deleted line has no marker,\n" +
      "and a deleted line is what a killed mutation usually leaves behind.\n"
  );
  process.exit(1);
}
console.log("mutation-tree: no mutation is applied in the working tree.");
