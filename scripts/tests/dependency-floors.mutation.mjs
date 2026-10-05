#!/usr/bin/env node
/*
 * CAN dependency-floors.test.mjs SEE A VULNERABLE VERSION COME BACK?
 *
 *   1. the lockfile resolves sharp below its floor again.
 *   2. a nested copy of nanoid appears below its floor — the case the
 *      gate reads every copy for.
 *   3. package.json goes back to the old sharp range.
 *   4. the version comparison degrades to string order, under which
 *      "3.3.9" sorts above "3.3.18".
 *
 * Run: node scripts/tests/dependency-floors.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/dependency-floors.test.mjs";
const LOCK = "package-lock.json";
const PKG = "package.json";

const MUTANTS = [
  {
    name: "the lockfile resolves sharp below its floor",
    file: LOCK,
    from: '"node_modules/sharp": {\n      "version": "0.35.5"',
    to: '"node_modules/sharp": {\n      "version": "0.35.3"',
    expect: "every copy of sharp is at least",
  },
  {
    name: "a nested nanoid below the floor comes back",
    file: LOCK,
    from: '    "node_modules/sharp": {',
    to: '    "node_modules/next/node_modules/nanoid": {\n      "version": "3.3.11"\n    },\n    "node_modules/sharp": {',
    expect: "every copy of nanoid is at least",
  },
  {
    name: "package.json goes back to the old sharp range",
    file: PKG,
    from: '"sharp": "^0.35.5"',
    to: '"sharp": "^0.35.3"',
    expect: "package.json declares sharp at or above",
  },
  {
    name: "the comparison degrades to string order",
    file: GATE,
    from: "    const d = (pa[i] || 0) - (pb[i] || 0);",
    to: "    const d = String(pa[i] || 0).localeCompare(String(pb[i] || 0));",
    expect: "does not compare as strings",
  },
];

runMutations({ name: "dependency-floors", gate: GATE, targets: [GATE, LOCK, PKG], mutants: MUTANTS });
