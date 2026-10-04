#!/usr/bin/env node
/*
 * CAN ci-step-timeouts.test.mjs SEE A CI STEP THAT CAN HANG THE JOB?
 *
 * The three ways the rule could quietly lapse: a step loses its limit, a
 * job loses its own, and a step's limit is raised to or past its job's,
 * where it would never be the one that fires.
 *
 * Run: node scripts/tests/ci-step-timeouts.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/ci-step-timeouts.test.mjs";
const WORKFLOW = ".github/workflows/verify.yml";
const TARGETS = [GATE, WORKFLOW];

const MUTANTS = [
  {
    name: "the mutation suites step loses its limit",
    file: WORKFLOW,
    from: "      - name: mutation suites\n        timeout-minutes: 75\n",
    to: "      - name: mutation suites\n",
    expect: "verify: every step has timeout-minutes",
  },
  {
    name: "the alert job loses its own limit",
    file: WORKFLOW,
    from: "    if: failure()\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n",
    to: "    if: failure()\n    runs-on: ubuntu-latest\n",
    expect: "alert: the job has timeout-minutes",
  },
  {
    name: "a step's limit is raised past its job's",
    file: WORKFLOW,
    from: "      - name: mutation suites\n        timeout-minutes: 75\n",
    to: "      - name: mutation suites\n        timeout-minutes: 120\n",
    expect: "verify: no step's limit reaches the job's",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 60_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("ci-step-timeouts mutations\n");

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
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.",
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
