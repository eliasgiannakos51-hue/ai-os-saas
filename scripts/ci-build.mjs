#!/usr/bin/env node
/**
 * RUN THE BUILD THE WAY THE BUILDER WILL.
 *
 * Run: npm run build:ci
 *
 * `npm run build` on a development machine runs with that machine's
 * environment. Vercel's runs with the project's configured variables —
 * every key the application needs — plus NODE_ENV=production, CI=1,
 * VERCEL=1. Those are different environments, and merge commit aec56a2
 * is what the difference costs: a gate green here, red there, on
 * byte-identical code, because it asserted what a program prints when
 * ANTHROPIC_API_KEY is MISSING and Vercel has one.
 *
 * This runs the real `npm run build` under the second environment. The
 * values are sentinels, not secrets — nothing here can reach a paid API
 * or a real database, and that is the point: the question is whether a
 * gate's ANSWER changes when a variable is PRESENT, not what the value
 * is. A gate that needs the value to be real is a gate that calls a
 * live service during a build, which is its own finding.
 *
 * It is the slower, complete answer. scripts/env-sensitivity.mjs is the
 * faster one that says WHICH gate disagrees, and
 * scripts/tests/env-independence.test.mjs is the cheap structural rule
 * that runs on every build.
 */
import { spawnSync } from "node:child_process";
import { deployedEnv, probedNames } from "./env-sensitivity.mjs";

/**
 * TWO ENVIRONMENTS, NOT ONE, AND THE SECOND IS THE ONE THAT WAS MISSING.
 *
 * This ran a single pass with every project variable set to a SENTINEL,
 * and called the result "a deployed environment". It is one deployed
 * environment. It is not the one most deployments are in.
 *
 * On Vercel a variable the owner has not set is ABSENT. A variable they
 * have set is a REAL value. The sentinel pass covers neither: it covers
 * "set, to something wrong", which is a third state. So a gate that
 * behaves differently when a variable is MISSING — and this repository
 * has already shipped one, the spelling gate that asserted a runner
 * prints MISSING ANTHROPIC_API_KEY — passes here and fails there.
 *
 * That is precisely the false confidence the owner named after five
 * red Vercel builds against a green `build:ci`. The absent case is now
 * a pass of its own.
 *
 * WHY NOT THREE PASSES. The real-values case cannot be simulated: this
 * machine does not have the owner's keys and must not. What it CAN do is
 * bracket the truth — every variable wrong, and every variable gone —
 * and a gate that survives both is one no value can surprise.
 */
const PASSES = [
  {
    name: "every project variable SET, to a sentinel",
    why: "catches a gate that reads a value and trusts its shape",
    env: deployedEnv(),
  },
  {
    // ONLY WHAT THE MACHINE ITSELF NEEDS. PATH and HOME are not
    // configuration — they are how a process runs at all, and sweeping
    // PATH into the sentinel list is what made this script report four
    // failures it had never observed (see below).
    name: "every project variable ABSENT, as on a fresh deployment",
    why: "catches a gate that behaves differently when a key is simply not there",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      CI: "1",
      VERCEL: "1",
      VERCEL_ENV: "production",
    },
  },
];

console.log(`Running the real build ${PASSES.length} times, in ${PASSES.length} different environments.`);
console.log(`  ${probedNames().size} project variables are known to this repository.\n`);

let r = { status: 0 };
for (const pass of PASSES) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`PASS: ${pass.name}`);
  console.log(`      ${pass.why}`);
  console.log(`${"=".repeat(70)}\n`);
  r = spawnSync("npm", ["run", "build"], { stdio: "inherit", env: pass.env, shell: false });
  if (r.error || r.status === null) break;
  if (r.status !== 0) {
    console.log(`\nFAILED IN: ${pass.name}`);
    break;
  }
}

// THREE OUTCOMES, NOT TWO, and the third is the one this got wrong.
//
// On 2026-09-19 this printed "The build FAILS in a deployed environment
// (exit null)" with no build output above it, four times, while
// `npm run build` was green. The build had never started: PATH had been
// swept into the sentinel list (see env-sensitivity.mjs's probedNames),
// so spawnSync could not find `npm` and returned ENOENT with a null
// status. `r.status === 0` is false for null, so the else branch
// announced a failure nobody had observed.
//
// A null status is not a verdict. It means the child was never run, or
// was killed by a signal, and either way this script has measured
// nothing — which is exactly the shape CLAUDE.md opens with. It says so
// now, and it prints the error rather than a number.
if (r.error || r.status === null) {
  console.log("\nTHE BUILD DID NOT RUN — this says nothing about the build.");
  console.log(`  ${r.error ? String(r.error) : `killed by signal ${r.signal}`}`);
  console.log("  Nothing above this line is a verdict. Fix the harness, then re-run.");
  process.exit(2);
}
if (r.status === 0) {
  console.log(`\nThe build passes in all ${PASSES.length} environments, and in this one.`);
} else {
  console.log(`\nThe build FAILS in a deployed environment (exit ${r.status}) while it may pass here.`);
  console.log("scripts/env-sensitivity.mjs names the gate.");
}
process.exit(r.status);
