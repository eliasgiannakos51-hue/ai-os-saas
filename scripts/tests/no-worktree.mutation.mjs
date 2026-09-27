#!/usr/bin/env node
/*
 * IS THE NO-WORKTREE GATE LOAD-BEARING, OR A DESCRIPTION OF ONE?
 *
 * Run: node scripts/tests/no-worktree.mutation.mjs
 *
 * The gate it measures was written the day a build that had been red
 * fifteen times in a row was reproduced on demand, and the thing it
 * exists to stop is a gate demanding an answer only a working tree can
 * give. A gate written for that reason has to go red when that reason
 * comes back — which is a claim, and this is the measurement of it.
 *
 * FOUR MUTANTS, and two of them are aimed at the gate rather than at the
 * defect. The defect half puts the original failure back, in both of the
 * places it lived. The vacuity half takes away what the gate measures
 * WITH — the shim, and the population — because a gate that hides git
 * from nothing, or runs nothing under it, prints exactly the same green
 * as one that works.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/no-worktree.test.mjs";
const TREE = "scripts/tests/mutation-tree.test.mjs";

const MUTANTS = [
  {
    // THE DEFECT, EXACTLY, in the place it killed the build: section 4's
    // dirty-target warning, demanded whether or not the question has an
    // answer. This is the clause `npm run build` died on at gate 167 of
    // 292 in a fresh clone with no .git.
    name: "the dirty-target warning is demanded again, worktree or not",
    file: TREE,
    from: '  if (HAS_WORKTREE) {\n    check("...but it still says so, loudly"',
    to: '  if (true) {\n    check("...but it still says so, loudly"',
    expect: "programs run with git hidden, all exit 0",
  },
  {
    // THE SAME DEFECT AT THE OTHER SITE. Section 2 deletes a guard and
    // requires the checker to name unicode-patterns.ts. Two sites, one
    // shape; a gate that caught only one would let the next round put it
    // back in the other.
    name: "the deleted-guard warning is demanded again, worktree or not",
    file: TREE,
    from: '  if (HAS_WORKTREE) {\n    check("check-mutation-tree WARNS about it on a developer machine"',
    to: '  if (true) {\n    check("check-mutation-tree WARNS about it on a developer machine"',
    expect: "programs run with git hidden, all exit 0",
  },
  {
    // VACUITY 1: THE SHIM STOPS HIDING ANYTHING. With the real git on
    // PATH every program in the population is running in this
    // repository, which is the exact blindness that let two gates ship
    // broken — so section 0 is not decoration and this proves it.
    name: "the shim is bypassed, so every program sees the real git",
    file: GATE,
    from: 'const NOGIT = { ...process.env, PATH: `${shimDir}:${process.env.PATH}` };',
    to: "const NOGIT = { ...process.env };",
    expect: "and under the shim it does not",
  },
  {
    // VACUITY 2: THE POPULATION EMPTIES. Section 2 reports "all exit 0"
    // over whatever it was handed, and over nothing that is true. The
    // floor on the link is what has to catch it.
    name: "no gate is found to reach a git-using program",
    file: GATE,
    from: "  if (g === SELF) return false;",
    to: "  if (g === SELF) return false;\n  return false;",
    expect: "gates spawn or read one of them",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 900_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("no-worktree mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const baseline = runGate();
  if (!baseline.green) {
    console.log("BASELINE IS ALREADY RED — fix the gate before measuring it.");
    console.log(baseline.failed.map((f) => `  ${f}`).join("\n"));
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
console.log("A build that cannot run without a working tree goes red here, not on Vercel.");
