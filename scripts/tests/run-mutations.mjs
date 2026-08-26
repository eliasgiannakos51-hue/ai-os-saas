// Runs every *.mutation.mjs suite and reports how many go red.
//
// WHY THIS FILE EXISTS AT ALL. There were thirty mutation suites in
// scripts/tests and not one npm script ran any of them. `npm run
// test:integration` globs `*.test.mjs`; `*.mutation.mjs` matches nothing in
// any script in package.json. So the suites that check whether the GATES
// can fail were themselves never run — which is the same failure shape they
// exist to catch, one level up.
//
// WHY IT IS NOT A ONE-LINE `for f in ...; do node $f || exit 1; done`.
// Two reasons, both measured rather than guessed:
//
//   1. THE SUITES MUTATE THE REAL WORKING TREE. Every one of them does
//      `writeFileSync(file, mutated)` on a tracked source file and restores
//      it in a `finally`. A suite killed by a timeout, or one that throws
//      outside that block, leaves the mutation on disk. Observed: a run of
//      ai-providers.mutation.mjs left
//
//          -  if (perPurpose.order.length > 0) {
//          +  if (false) {
//
//      in src/lib/ai/providers/registry.ts. Every suite that ran afterwards
//      then reported "BASELINE IS RED" and exited 1 — four suites reported
//      red for one poisoned file, and none of the four had anything wrong
//      with it. Worse, `if (false)` was sitting in the working tree, one
//      `git add -A` away from production.
//
//      So the tree is checked with `git status --porcelain` after each
//      suite, and a suite that leaves a tracked file dirty is named and the
//      file is restored before the next one starts. A poisoned tree is
//      reported as its own failure, not as the next suite's.
//
//   2. `|| exit 1` STOPS AT THE FIRST RED. Each suite takes 10-100 seconds;
//      thirty of them is over fifteen minutes. Learning about one failure
//      per fifteen-minute run is not a gate anyone will run twice. All of
//      them run, and the summary at the end is the answer.
//
// Run: node scripts/tests/run-mutations.mjs
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const DIR = "scripts/tests";
const suites = readdirSync(DIR)
  .filter((f) => f.endsWith(".mutation.mjs"))
  .sort();

if (suites.length === 0) {
  console.error("No *.mutation.mjs suites found — this runner is pointed at nothing.");
  process.exit(1);
}

// A floor, for the same reason every gate in this directory has one: an
// empty list satisfies "none of them failed". Thirty today.
const FLOOR = 30;

function trackedDirty() {
  const out = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    encoding: "utf8",
  });
  if (out.status !== 0) return null; // not a git checkout — skip the guard
  return out.stdout
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

const before = trackedDirty();
const baseline = new Set(before ?? []);
if (before === null) {
  console.log("  ....  not a git checkout — the poisoned-tree guard is off");
} else if (before.length > 0) {
  console.log(`  ....  ${before.length} file(s) already modified before the run; those are ignored`);
}

console.log(`Running ${suites.length} mutation suites\n`);

const results = [];
for (const file of suites) {
  const name = file.replace(/\.mutation\.mjs$/, "");
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(DIR, file)], {
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  const stdout = run.stdout ?? "";
  const missed = [...stdout.matchAll(/^\s*MISSED\s+(.*)$/gm)].map((m) => m[1].trim());

  // The tree, before the next suite gets blamed for this one's leftovers.
  const after = trackedDirty();
  const leaked = (after ?? []).filter((f) => !baseline.has(f));
  if (leaked.length > 0) {
    spawnSync("git", ["checkout", "--", ...leaked], { encoding: "utf8" });
  }

  const ok = run.status === 0 && leaked.length === 0;
  results.push({ name, ok, code: run.status, seconds, missed, leaked, killed: Boolean(run.error) });
  const flag = ok ? "OK " : "RED";
  const note = leaked.length > 0 ? `LEFT ${leaked.length} FILE(S) MUTATED: ${leaked.join(", ")}` : "";
  console.log(
    `${flag}  ${name.padEnd(42)} ${String(seconds).padStart(4)}s  ${missed.length ? `missed=${missed.length}` : ""} ${note}`
  );
  for (const m of missed) console.log(`         MISSED  ${m}`);
}

const red = results.filter((r) => !r.ok);
const leaky = results.filter((r) => r.leaked.length > 0);

console.log(`\n${"=".repeat(70)}`);
console.log(`${results.length} suites · ${results.length - red.length} green · ${red.length} red`);
if (red.length > 0) {
  console.log("\nRED:");
  for (const r of red) {
    console.log(
      `  ${r.name}  (exit ${r.code}${r.killed ? ", killed" : ""}${r.missed.length ? `, ${r.missed.length} mutation(s) not caught` : ""})`
    );
  }
}
if (leaky.length > 0) {
  console.log("\nLEFT THE WORKING TREE MUTATED (restored by this runner):");
  for (const r of leaky) console.log(`  ${r.name}: ${r.leaked.join(", ")}`);
}

let fail = red.length;
if (results.length < FLOOR) {
  console.log(
    `\nRED: found ${results.length} suites, expected at least ${FLOOR} — the glob is reading fewer files than exist.`
  );
  fail++;
}
console.log(fail === 0 ? "\nALL MUTATION SUITES GREEN" : "");
process.exit(fail === 0 ? 0 : 1);
