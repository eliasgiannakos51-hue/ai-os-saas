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
 *   5. image-size goes back to the 1.x pptxgenjs declares, or the
 *      override that lifts it is dropped; source-map-js goes back below
 *      its fix (ΑΣ-8.1, 2026-10-08).
 *
 * The clause that pptxgenjs never loads image-size has no mutant here:
 * its target is a file pptxgenjs ships, under node_modules, which a
 * suite must not write (the local install is shared with other
 * checkouts). It was settled by hand instead, on 2026-10-08 and again on
 * 2026-10-09: a deck with a picture was written with image-size made
 * unloadable (docs/PROGRESS.md, 2026-10-09).
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
    name: "the lockfile goes back to the Next with the critical advisories",
    file: LOCK,
    from: '"node_modules/next": {\n      "version": "16.3.8"',
    to: '"node_modules/next": {\n      "version": "14.2.35"',
    expect: "every copy of next is at least",
  },
  {
    name: "package.json goes back to Next 14",
    file: PKG,
    from: '"next": "^16.3.8"',
    to: '"next": "^14.2.35"',
    expect: "package.json declares next at or above",
  },
  {
    name: "the lockfile goes back to the image-size pptxgenjs declares",
    file: LOCK,
    from: '"node_modules/image-size": {\n      "version": "2.0.4"',
    to: '"node_modules/image-size": {\n      "version": "1.2.1"',
    expect: "every copy of image-size is at least",
  },
  {
    name: "the override that lifts image-size is dropped",
    file: PKG,
    from: '"overrides": {\n    "image-size": "^2.0.4"\n  }',
    to: '"overrides": {}',
    expect: "package.json overrides image-size at or above",
  },
  {
    name: "the lockfile goes back to the source-map-js with the advisory",
    file: LOCK,
    from: '"node_modules/source-map-js": {\n      "version": "1.2.2"',
    to: '"node_modules/source-map-js": {\n      "version": "1.2.1"',
    expect: "every copy of source-map-js is at least",
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
