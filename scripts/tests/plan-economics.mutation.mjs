#!/usr/bin/env node
/*
 * WHETHER A PLAN MAKES MONEY IN ITS WORST MONTH.
 *
 * Every other money gate checks one charge at a time and finds it healthy.
 * This one asks the question those cannot: if a subscriber spends every
 * credit their plan grants AND uses every free chat message, does the
 * price still cover the cost? Credit-settled work clears 4x on its own —
 * free chat is what eats the difference, and nothing else in the tree
 * prices the two together.
 *
 * Its ceilings are RATCHETS: pinned at where the product actually is, so
 * the number cannot get worse without somebody editing the line. Writing
 * this suite is what showed both had gone slack — 37.5% recorded against
 * 24.3% measured, and 15% against 4.3% — loose enough that cutting the
 * entry plan's price by 60%% and tripling the top plan's free allowance
 * both left the gate green. Both are at the measured values now.
 *
 * Run: node scripts/tests/plan-economics.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/plan-economics.test.mjs";
const FREE_CHAT = "src/lib/billing/free-chat.ts";
const PLANS = "src/lib/billing/plans.ts";
const POLICY = "src/lib/billing/margin-policy.ts";

const MUTANTS = [
  {
    // The generous product decision nobody prices. Tripling the free
    // allowance on the top plan is a one-line change that reads like
    // marketing and lands as margin.
    name: "the free-chat allowance is tripled on the top plan",
    file: FREE_CHAT,
    from: "  ultimate: 430,",
    to: "  ultimate: 1290,",
    expect: "free chat is",
  },
  {
    // The per-message ceiling raised. Every free message may now cost
    // five times as much, and the whole free-chat budget moves with it.
    name: "each free message is allowed to cost five times as much",
    file: FREE_CHAT,
    from: "export const DEFAULT_FREE_CHAT_MAX_COST_EUR = 0.02;",
    to: "export const DEFAULT_FREE_CHAT_MAX_COST_EUR = 0.1;",
    expect: "free chat is",
  },
  {
    // A price cut with no matching change to what the plan grants. The
    // worst-case month then costs a larger share of a smaller price,
    // twice over.
    name: "the entry plan's price is cut without cutting what it grants",
    file: PLANS,
    from: "    price: 20,\n    monthlyCredits: 1000,",
    to: "    price: 8,\n    monthlyCredits: 1000,",
    expect: "worst case",
  },
  {
    // THE FREE PLAN'S ALLOWANCE. Free has no price for a margin to be a
    // fraction of, so the only thing bounding it is the absolute EUR 1.00
    // ceiling — and granting ten times the credits walks straight through
    // it at EUR 3.33 an account per month.
    name: "the free plan grants ten times the credits, with no price to cover them",
    file: PLANS,
    from: "    price: 0,\n    monthlyCredits: 100,",
    to: "    price: 0,\n    monthlyCredits: 1000,",
    expect: "free costs at most",
  },
  {
    // FREE IS AN ACQUISITION COST AND A BOUNDED ONE. Raise what a free
    // account may consume and the bound is the only thing that notices —
    // there is no revenue on that plan for a margin to be a fraction of.
    name: "a free account may consume ten times as much",
    file: FREE_CHAT,
    from: "  free: 15,",
    to: "  free: 150,",
    expect: "free costs at most",
  },
  {
    // The credit margin itself weakened. Section 1 is the one part of
    // this file that credit-formula.ts also proves, and it is what stops
    // a plan clearing the blended ceiling by charging too little per call.
    name: "the free plan's credit margin drops below the floor",
    file: POLICY,
    from: "  free: 6,",
    to: "  free: 3,",
    expect: "credit-settled margin",
  },
];

// A MUTANT THAT LOOKED LIKE A DEFECT AND IS NOT. Granting four times the
// credits for the same price leaves this gate green, and correctly:
// creditPriceFor() is `min(LIST_CREDIT_PRICE, price / monthlyCredits)`, so
// `credits x creditPrice` collapses to the plan's own price and the
// worst-case credit cost is `price / margin` however many credits are
// granted. The two edits cancel exactly. Requiring a gate to go red on an
// arithmetic identity would be reporting a hole for the crime of being
// right — the entry plan's PRICE being cut, which does not cancel, is the
// mutant above that carries this ground.

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

console.log("plan-economics mutations\n");
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
    writeFileSync(m.file, original.replace(m.from, m.to));
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
console.log("No plan can be made to lose money in its worst month without this going red.");
