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
import { readFileSync } from "node:fs";
import { deployedEnv, probedNames } from "./env-sensitivity.mjs";

/**
 * THE THREE THINGS THIS SCRIPT USED TO ASSUME ABOUT THE BUILDER.
 *
 * It ran `npm run build` under a constructed environment and called that
 * "the way the builder will". Three of the builder's inputs were never
 * checked, only assumed, and an assumption that is wrong is exactly the
 * false confidence a green build:ci against a red Vercel build is made
 * of:
 *
 *   1. WHICH COMMAND. Vercel runs vercel.json's `buildCommand` when the
 *      file declares one, and only falls back to `npm run build` when it
 *      does not. This script hard-coded the fallback, so the day somebody
 *      adds a buildCommand it silently stops running what ships.
 *   2. WHICH NODE. package.json's `engines.node` is what Vercel reads to
 *      pick the runtime. This machine's node is whatever it is. A build
 *      green on one major and red on another is a real failure mode and
 *      this script could not see it.
 *   3. WHICH CLOCK. The build bakes `new Date().toISOString()` into
 *      NEXT_PUBLIC_BUILD_AT (see next.config.mjs) and gates compare dates.
 *      Left to the host, the answer depends on the machine's zone.
 *
 * All three are now derived and asserted rather than assumed. Two of them
 * can make this script REFUSE TO RUN, which is the honest outcome: a run
 * under the wrong node measures the wrong thing, and "did not run" is not
 * a verdict (see the null-status branch at the foot of this file).
 */

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
/**
 * WHAT VERCEL WILL ACTUALLY RUN, read out of vercel.json rather than
 * guessed. A project with no `buildCommand` gets the framework default,
 * which for Next.js is `npm run build`; the fallback is named here so a
 * reader can see it is a fallback and not a rule.
 */
function vercelBuildCommand() {
  let cfg;
  try {
    cfg = JSON.parse(readFileSync("vercel.json", "utf8"));
  } catch (e) {
    console.log("vercel.json could not be read or parsed — this script cannot know");
    console.log("what the builder runs, so it is not going to guess.");
    console.log(`  ${String(e)}`);
    process.exit(2);
  }
  const declared = typeof cfg.buildCommand === "string" ? cfg.buildCommand.trim() : "";
  if (declared) return { label: `vercel.json buildCommand: ${declared}`, shell: true, argv: [declared] };
  return { label: "npm run build (vercel.json declares no buildCommand)", shell: false, argv: ["npm", ["run", "build"]] };
}

/**
 * THE SAME NODE THE BUILDER WILL USE, or nothing.
 *
 * Vercel picks the build runtime from package.json's `engines.node`.
 * .nvmrc is what a human's version manager reads; the two disagreeing is
 * a repository bug of its own, so both are checked and both must agree.
 *
 * This EXITS rather than warns. A pass under node 20 says nothing about a
 * build on node 22, and a green line that says nothing is the thing this
 * repository keeps having to unlearn.
 */
function assertNodeMatchesTheBuilder() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const declared = String(pkg.engines?.node ?? "").trim();
  const wantMajor = declared.match(/(\d+)/)?.[1];
  if (!wantMajor) {
    console.log("package.json declares no engines.node, so nothing says which node Vercel");
    console.log("will use. Declare it, then this script can check it.");
    process.exit(2);
  }
  let nvmrc = "";
  try {
    nvmrc = readFileSync(".nvmrc", "utf8").trim();
  } catch {
    nvmrc = "";
  }
  const nvmrcMajor = nvmrc.match(/(\d+)/)?.[1];
  if (nvmrcMajor && nvmrcMajor !== wantMajor) {
    console.log(`.nvmrc says node ${nvmrc} and package.json engines.node says ${declared}.`);
    console.log("They pick different runtimes for a human and for Vercel. Fix one.");
    process.exit(2);
  }
  const haveMajor = process.versions.node.split(".")[0];
  if (haveMajor !== wantMajor) {
    console.log(`This machine runs node v${process.versions.node}; Vercel will run ${declared}.`);
    console.log("A build measured on the wrong major says nothing about the one that ships,");
    console.log("so this is not going to run and call the result a pass.");
    process.exit(2);
  }
  return { declared, version: process.versions.node };
}

const BUILD = vercelBuildCommand();
const NODE = assertNodeMatchesTheBuilder();

/**
 * THE CLOCK, PINNED. Vercel's build containers run in UTC; a developer's
 * machine runs in theirs. next.config.mjs bakes the build time into the
 * bundle and gates read dates out of it, so the zone is an input to the
 * answer. Pinning it here means a machine in Athens and a machine in the
 * builder get the same verdict — and it is a pin, not a measurement: if
 * Vercel ever stopped being UTC this line would be the thing to change.
 */
const BUILDER_TZ = "UTC";

const PASSES = [
  {
    name: "every project variable SET, to a sentinel",
    why: "catches a gate that reads a value and trusts its shape",
    env: { ...deployedEnv(), TZ: BUILDER_TZ },
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
      TZ: BUILDER_TZ,
    },
  },
];

console.log(`Running the real build ${PASSES.length} times, in ${PASSES.length} different environments.`);
console.log(`  command : ${BUILD.label}`);
console.log(`  node    : v${NODE.version} (package.json engines.node: ${NODE.declared})`);
console.log(`  TZ      : ${BUILDER_TZ}, pinned`);
console.log(`  ${probedNames().size} project variables are known to this repository.\n`);

let r = { status: 0 };
for (const pass of PASSES) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`PASS: ${pass.name}`);
  console.log(`      ${pass.why}`);
  console.log(`${"=".repeat(70)}\n`);
  r = BUILD.shell
    ? spawnSync(BUILD.argv[0], { stdio: "inherit", env: pass.env, shell: true })
    : spawnSync(BUILD.argv[0], BUILD.argv[1], { stdio: "inherit", env: pass.env, shell: false });
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
