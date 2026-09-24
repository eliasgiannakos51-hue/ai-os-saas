#!/usr/bin/env node
/*
 * CAN THE CEILING GATE SEE ITS OWN CLASSIFIER BREAK?
 *
 * The gate reports ZERO DECLARED vs DECLARED assertions across the tree,
 * which is a strong claim made by a function that could simply be
 * returning an empty array. Section 3 pins each rung with a fixture; this
 * asks the harder question — if the classifier is weakened in the exact
 * ways it was ALREADY WRONG during the round that wrote it, does the gate
 * notice?
 *
 * Three of these five are mistakes this scan really made, in order:
 *
 *   * `\bMAX_` — which never matches PRESENTATION_MAX_TOKENS, because
 *     the character before MAX is an underscore. The scan reported zero
 *     for a whole round while blind to every ceiling the deleted scan was
 *     built on. Caught by a fixture, not by reading.
 *   * an allowlist of observation function names, which filed
 *     `parseDeckToolInput(deck)` as a declaration and produced 151
 *     findings.
 *   * no def-use pass, which filed `v.deck.slides.length === MAX_SLIDES`
 *     as a declaration because the call that produced `v` was one line
 *     up. 117 findings.
 *
 * Run: node scripts/tests/ceiling-vs-outcome.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/ceiling-vs-outcome.test.mjs";
const SCAN = "scripts/scan-ceiling-vs-outcome.mjs";
const FIXTURES = "scripts/tests/fixtures/ceiling-rungs.mjs";

const TARGETS = [GATE, SCAN, FIXTURES];

const MUTANTS = [
  {
    // THE HOLE THE FIXTURE FOUND. MAX must be allowed in the middle of a
    // name or the scan cannot see WEBSITE_MAX_TOKENS at all, and its
    // zero means nothing.
    name: "the ceiling pattern stops matching MAX in the middle of a name",
    file: SCAN,
    from: "  /\\b([A-Z0-9]+_)*MAX_[A-Z0-9_]+\\b",
    to: "  /\\bMAX_[A-Z0-9_]+\\b",
    expect: "the deleted scan's own assertion IS caught",
  },
  {
    // THE CLASSIFIER GIVES UP AND CALLS EVERYTHING MEASURED. This is the
    // shape of a detector that can never report anything — the mirror of
    // the LITERAL detector that matched 264 of 275 gates.
    name: "every assertion is filed as measured",
    file: SCAN,
    from: "    const condition = conditionOf(lines.map(stripStrings), i);",
    to: "    const condition = conditionOf(lines.map(stripStrings), i);\n    if (true) { measured.push(row); continue; }",
    expect: "the deleted scan's own assertion IS caught",
  },
  {
    // THE DEF-USE PASS REMOVED — the 117-finding version. The tree's real
    // gates come back as findings and the zero breaks.
    name: "a value produced by a call no longer counts as an observation",
    file: SCAN,
    from: "    if (produced.size) {",
    to: "    if (false && produced.size) {",
    expect: "DECLARED vs DECLARED is zero",
  },
  {
    // ENFORCEMENT RECLASSIFIED. A product `if (bytes > MAX) reject` is
    // not a prediction, and a scan that reports it buries the real thing
    // under 240 lines of the feature working correctly.
    name: "enforcing a limit is treated as a finding",
    file: SCAN,
    from: "      if (ENFORCEMENT_RE.test(window)) enforcement.push(row);",
    to: "      if (ENFORCEMENT_RE.test(window)) findings.push(row);",
    expect: "the enforcement fixture is in NO gate bucket",
  },
  {
    // THE CENSUS EMPTIED. A walk that reads nothing reports zero findings
    // and looks identical to a clean tree in a green log — the reason
    // section 1 exists at all.
    name: "the walk reads nothing, so every bucket is empty",
    file: SCAN,
    from: 'const ROOTS = ["scripts", "src"];',
    to: 'const ROOTS = [];',
    expect: "ceilings are enforced in the product",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]) };
  }
}

console.log("ceiling-vs-outcome mutations\n");

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
    console.log(`\nBASELINE IS RED — nothing below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const mutated = originals.get(m.file).replace(m.from, () => m.to);
    if (mutated === originals.get(m.file)) {
      missed.push({ ...m, why: "the mutation left the file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, mutated);
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
      missed.push({ ...m, why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`);
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
console.log("Every clause of the gate is load-bearing.");
