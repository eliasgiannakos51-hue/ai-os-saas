#!/usr/bin/env node
/*
 * WHAT THE PRICING PAGE PROMISES, AND WHETHER IT EXISTS.
 *
 * Three surfaces make claims about what a plan buys — the plan bullets, the
 * comparison table on /pricing, and the capability grid on signup — and
 * none of them is code. A feature can be deleted, renamed, or never built,
 * and all three keep selling it. That is not a broken build; it is a
 * customer paying for something that is not there.
 *
 * The gate answers it by requiring every claim to name the file and symbol
 * that implements it, and then checking the tree. These mutants attack
 * both halves: a claim with nothing behind it, and an EVIDENCE table that
 * has drifted from the code it points at.
 *
 * Run: node scripts/tests/pricing-truth.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/pricing-truth.test.mjs";
const PLANS = "src/lib/billing/plans.ts";
const PRICING_PAGE = "src/app/pricing/page.tsx";
const MEMORY = "src/lib/chat/memory.ts";

const MUTANTS = [
  {
    // A NEW PROMISE ON THE PLAN BULLETS. The commonest way this goes
    // wrong: somebody adds a selling point to a plan and nobody builds it.
    name: "a plan advertises a feature nothing implements",
    file: PLANS,
    from: "    features: [",
    to: '    features: [\n      { textKey: "Priority overnight rendering" },',
    expect: "no claim is made without declaring what implements it",
  },
  {
    // The same lie on the comparison table, which is the surface a
    // customer actually reads side by side before paying.
    name: "the comparison table gains a row for a capability that does not exist",
    file: PRICING_PAGE,
    from: 'labelKey: "',
    to: 'labelKey: "Unlimited team seats", hidden: false }, { labelKey: "',
    expect: "no claim is made without declaring what implements it",
  },
  {
    // THE OTHER DIRECTION, and the one a green build hides best: the
    // feature is deleted and the claim is not. The evidence entry points
    // at a symbol that is gone.
    // A FULL rename to an UNRELATED name, and both halves of that took a
    // correction. Replacing only the declaration leaves the call site, so
    // the symbol is still in the file; renaming to
    // DEFAULT_MEMORY_LOAD_LIMIT_RENAMED leaves the old name as a prefix of
    // the new one, and the gate searches by substring. The gate was right
    // to stay green both times.
    name: "the symbol a claim points at is renamed away while the claim stays up",
    file: MEMORY,
    from: "DEFAULT_MEMORY_LOAD_LIMIT",
    to: "MEMORY_LOAD_CEILING",
    all: true,
    expect: "every claim's evidence still exists in the codebase",
  },
  {
    // The evidence table naming a file that is not there at all — a
    // rename or a move that nobody followed through into the claims.
    name: "a claim's evidence names a file that has moved",
    file: GATE,
    from: '    file: "src/lib/chat/memory.ts",',
    to: '    file: "src/lib/chat/memory-moved.ts",',
    expect: "every claim's evidence still exists in the codebase",
  },
  {
    // An evidence entry left behind after its claim was withdrawn. Not a
    // customer-facing lie, but it is how the table stops describing the
    // product and starts describing its history.
    name: "an evidence entry outlives the claim it was written for",
    file: GATE,
    from: "const EVIDENCE = {",
    to: 'const EVIDENCE = {\n  "A claim nobody makes any more": { file: "src/lib/chat/memory.ts", symbol: "DEFAULT_MEMORY_LOAD_LIMIT" },',
    expect: "no evidence entry outlives the claim it justified",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("pricing-truth mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
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
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("Nothing can be sold that is not in the tree without this going red.");
