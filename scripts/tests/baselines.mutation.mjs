#!/usr/bin/env node
/*
 * WOULD A BASELINE NOBODY LOWERED STILL BE NOTICED?
 *
 * The first mutation below is not an invention: it puts
 * CLIENT_FALLBACK_BASELINE back to 31 against a measured 28, which is
 * where it actually stood until V5 #13. Every gate in the repository was
 * green in that state, i18n-coverage included, because "28 <= 31" is as
 * true as "28 <= 28". If this suite cannot turn that red, the register
 * has bought nothing.
 *
 * The rest remove the ways this gate could stop looking: publish no
 * numbers, forget an entry, let a gate go silent, or grow a tolerance
 * without an argument for it.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/baselines.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/baselines.test.mjs";
const I18N = "scripts/tests/i18n-coverage.test.mjs";
const HELPER = "scripts/tests/lib/baseline.mjs";
const ANCHORS = "scripts/tests/mutation-anchors.test.mjs";

const MUTANTS = [
  {
    // 1. THE DEFECT ITSELF, restored. Three fallbacks were paid off and
    // the number was not lowered; every gate stayed green for as long as
    // that was true.
    name: "a baseline is left three above what it measures",
    file: I18N,
    from: "const CLIENT_FALLBACK_BASELINE = 28;",
    to: "const CLIENT_FALLBACK_BASELINE = 31;",
    expect: "no baseline has more room than it is allowed",
  },
  {
    // 2. A CEILING BELOW REALITY is the other direction, and it must not
    // be reported as healthy slack: it means the count has already grown
    // past the number.
    name: "a floor is registered as a ceiling, so a breach reads as room",
    file: GATE,
    from: '    name: "MUTATION_SUITE_FLOOR",\n    direction: "floor",',
    to: '    name: "MUTATION_SUITE_FLOOR",\n    direction: "ceiling",',
    expect: "no baseline has more room than it is allowed",
  },
  {
    // 3. THE NUMBERS STOP BEING PUBLISHED. Nothing to compare, nothing to
    // report, and a gate that reads an empty list is a gate that always
    // agrees with it.
    name: "the helper stops printing what it measured",
    file: HELPER,
    from: "  console.log(`BASELINE ${name} declared=${declared} measured=${measured}`);",
    to: "  void [name, declared, measured];",
    expect: "gates that own baselines were run and printed",
  },
  {
    // 4. A GATE GOES QUIET about one of its baselines — the shape a
    // refactor takes when somebody moves a check and forgets the line
    // beside it.
    name: "a gate stops publishing one of its baselines",
    file: ANCHORS,
    from: 'reportBaseline("FALLBACK_CEILING", FALLBACK_CEILING, fellBack.length);',
    to: "void FALLBACK_CEILING;",
    expect: "gates that own baselines were run and printed",
  },
  {
    // 5. THE REGISTER LOSES AN ENTRY while the gate goes on emitting it.
    // An allowlist that only checks one direction is how a table becomes
    // a place to put things.
    name: "a baseline is emitted but no longer registered",
    file: GATE,
    from: '    name: "STATE_ONLY_CEILING",',
    to: '    name: "STATE_ONLY_CEILING_RENAMED",',
    expect: "every baseline a gate emits is in the register",
  },
  {
    // 6. A TOLERANCE WITHOUT AN ARGUMENT. Slack is the exception; a
    // register where any entry can quietly grow one permits exactly the
    // drift it exists to catch.
    name: "slack is granted without quoting the argument for it",
    file: GATE,
    from: "    why: \"Gates with a mutation suite. Its own comment sets the tolerance: five, 'so deleting one suite on purpose does not need a build fix in the same commit'.\",",
    to: '    why: "Gates with a mutation suite. Five is fine and has always been fine, no need to justify.",',
    expect: "quotes the argument for it",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("baselines mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
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
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
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
console.log("A number left at the size of a problem it no longer has turns this red.");
