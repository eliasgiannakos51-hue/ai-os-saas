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

const env = deployedEnv();
console.log(`Running the build with ${Object.keys(env).length} environment variables:`);
console.log(`  ${probedNames().size} project variables, each set to a sentinel`);
console.log(`  CI=1  VERCEL=1  VERCEL_ENV=production  NODE_ENV=production\n`);

const r = spawnSync("npm", ["run", "build"], { stdio: "inherit", env, shell: false });
if (r.status === 0) {
  console.log("\nThe build passes in a deployed environment as well as in this one.");
} else {
  console.log(`\nThe build FAILS in a deployed environment (exit ${r.status}) while it may pass here.`);
  console.log("scripts/env-sensitivity.mjs names the gate.");
}
process.exit(r.status ?? 1);
