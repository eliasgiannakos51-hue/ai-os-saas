#!/usr/bin/env node
/*
 * DOES ANYTHING STOP A TEST GOING BACK INTO THE BUILD?
 *
 * Run: node scripts/tests/ci-coverage.mutation.mjs
 *
 * WHAT THIS IS ABOUT, and it took fifteen rounds to see. `npm run
 * build` — the command Vercel runs — ran the function limits, the
 * marker check, the mutation-tree check, the i18n check and 294 unit
 * gates before compiling a line. Two minutes of checks about this
 * repository's own conventions, on the critical path of every
 * deployment, where a red one takes production with it. Eight causes
 * were proposed and discarded (node, timezone, lockfile, env vars, the
 * build cache, disk, file order, a missing .git) and every one of them
 * was a theory about the BUILD. The question nobody asked was what the
 * build was running.
 *
 * So the split is only worth something if it cannot quietly come back,
 * and "cannot quietly come back" is a claim about a gate. SIX MUTANTS:
 * three put a test back into the build in each of the ways it would
 * plausibly happen, and three empty the gate itself — because a check
 * that says "the build runs no checker" is trivially true of a build
 * script that is the empty string.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/ci-coverage.test.mjs";
const PKG = "package.json";
const WF = ".github/workflows/verify.yml";

const BUILD = '"build": "node scripts/apply-function-limits.mjs && next build"';

const MUTANTS = [
  {
    // THE DEFECT, PUT BACK EXACTLY. This is what shipped for months.
    name: "the unit suite goes back into the build",
    file: PKG,
    from: BUILD,
    to: '"build": "node scripts/apply-function-limits.mjs && npm run test:unit && next build"',
    expect: "the build runs no checker",
  },
  {
    // THE SAME THING BY THE OTHER DOOR. A checker rather than the
    // suite, which is how it grew the first time — one step at a time,
    // each one cheap on its own.
    name: "one checker creeps back into the build",
    file: PKG,
    from: BUILD,
    to: '"build": "node scripts/apply-function-limits.mjs && node scripts/check-i18n.js && next build"',
    expect: "the build runs no checker",
  },
  {
    // AND THE FORM A REGEX ON NAMES WOULD MISS: a suite invoked by
    // path rather than through an npm script.
    name: "a suite is run from the build by path",
    file: PKG,
    from: BUILD,
    to: '"build": "node scripts/apply-function-limits.mjs && node scripts/tests/posts.test.mjs && next build"',
    expect: "no suite of any kind",
  },
  {
    // VACUITY 1: the build stops producing. Every "runs no checker"
    // clause is true of an empty build, and an empty build is a worse
    // outcome than the one this file exists to prevent.
    name: "the build stops rewriting the function limits",
    file: PKG,
    from: BUILD,
    to: '"build": "next build"',
    expect: "still rewrites the function limits",
  },
  {
    // VACUITY 2: the checks move out of the build and into NOTHING.
    // This is the failure mode that would make the whole split a net
    // loss, and it is one deleted line away.
    name: "a checker leaves the build and lands nowhere",
    file: PKG,
    from: "node scripts/check-mutation-tree.mjs && ",
    to: "",
    expect: "every checker that left the build is in gates",
  },
  {
    // VACUITY 3: the gates exist and CI never runs them. Section 1
    // owns this claim; without it the rest is a rearrangement of
    // package.json.
    name: "CI stops running the gates",
    file: WF,
    from: "        run: npm run gates",
    to: "        run: echo skipped",
    expect: "and the workflow runs it",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 300_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("ci-coverage mutations\n");

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
console.log("A test cannot go back onto the deploy's critical path without this going red.");
