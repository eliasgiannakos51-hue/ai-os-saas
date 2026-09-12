#!/usr/bin/env node
/*
 * THE $0.10 CHAT MESSAGE THAT BILLED TWO CREDITS.
 *
 * MODEL_PRICING_USD held one model. A turn served by a pricier one was
 * priced off the cheap row, the credit formula did its arithmetic
 * faithfully on a wrong input, and the cost log reported a comfortable 4x
 * margin the whole time. pricing-margin-bug.test.mjs reproduces that turn
 * through the old pipeline and the fixed one, and then brute-forces every
 * feature x plan x model x size to prove the floor holds everywhere.
 *
 * Every mutant here is a way for money to leak that a green build would
 * not mention: a missing price row, a floor removed, a max() turned into a
 * min(), a fallback that guesses cheap instead of expensive.
 *
 * Run: node scripts/tests/pricing-margin-bug.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/pricing-margin-bug.test.mjs";
const PRICING = "src/lib/billing/model-pricing.ts";
const FORMULA = "src/lib/billing/credit-formula.ts";
const POLICY = "src/lib/billing/margin-policy.ts";

const MUTANTS = [
  {
    // THE INCIDENT ITSELF. Take the model every AI feature in this app
    // requests out of the table and it prices off the fallback instead —
    // the exact shape of "the table held one model" that started this.
    name: "the model every feature requests is missing from the pricing table",
    file: PRICING,
    from: '  "claude-sonnet-4-6": tier(3, 15),',
    to: '  "claude-sonnet-4-6-removed-by-mutation": tier(3, 15),',
    expect: "with correct cache rates",
  },
  {
    // THE FALLBACK'S DIRECTION. An unknown model prices at the MOST
    // expensive known row on purpose: guessing cheap under-bills silently,
    // guessing dear over-bills visibly and somebody complains. Reduced to
    // the cheapest, every model this table has not heard of leaks money.
    name: "an unknown model falls back to the cheapest known price instead of the dearest",
    file: PRICING,
    from: "export const FALLBACK_MODEL_PRICING: ModelPricing = Object.values(MODEL_PRICING_USD).reduce(",
    to: "export const FALLBACK_MODEL_PRICING: ModelPricing = [Object.values(MODEL_PRICING_USD).reduce(\n  (a, b) => (a.inputPerMTok < b.inputPerMTok ? a : b)\n)][0] ?? Object.values(MODEL_PRICING_USD).reduce(",
    expect: "the most expensive rates, never cheaper",
  },
  {
    // ROUNDING DIRECTION. ceil is what keeps a fraction of a credit from
    // being given away on every call; floor turns every sub-credit charge
    // into a free one, which is most of them.
    name: "credits round down instead of up, so every sub-credit charge is free",
    file: FORMULA,
    // ANCHORED ON THE ACCOUNT FORMULA, which is the one the brute force
    // calls. credit-formula.ts carries two: creditsForRealCostEur for a
    // flat credit price and creditsForRealCostOnAccount for a price that
    // depends on the plan and any pack. The first draft of this mutant hit
    // the flat one and the gate stayed green, because section 5 never
    // touches it.
    from: "  return Math.ceil(\n    (realCostEur * (marginMultiplier ?? c.marginMultiplier)) /\n      effectiveCreditPriceEurForAccount(plan, purchasedPackPriceEur, c)\n  );",
    to: "  return Math.floor(\n    (realCostEur * (marginMultiplier ?? c.marginMultiplier)) /\n      effectiveCreditPriceEurForAccount(plan, purchasedPackPriceEur, c)\n  );",
    expect: "meet their resolved margin",
  },
  {
    // The margin stops being applied at all: the customer is charged the
    // raw provider cost, and the business runs at exactly 1x for ever.
    name: "the margin multiplier is dropped from the credit formula",
    file: FORMULA,
    from: "  return Math.ceil(\n    (realCostEur * (marginMultiplier ?? c.marginMultiplier)) /\n      effectiveCreditPriceEurForAccount(plan, purchasedPackPriceEur, c)\n  );",
    to: "  return Math.ceil(\n    realCostEur / effectiveCreditPriceEurForAccount(plan, purchasedPackPriceEur, c)\n  );",
    expect: "meet their resolved margin",
  },
  {
    // THE PER-PLAN MARGIN, IGNORED. Every plan default was written to
    // RAISE the multiplier where the plan's credit price is lower; drop
    // the branch that applies it and every account falls back to the
    // general number.
    //
    // NOT `Math.max(general, MIN)` turned into min(): that reads like the
    // same defect and is not one. MIN is 4 and every general value is
    // already at or above it, so min() returns 4 and the plan branch three
    // lines below raises it again. A mutant has to change an outcome.
    name: "the per-plan margin stops being applied, so every plan bills at the general rate",
    file: POLICY,
    from: "  if (planMargin !== null && planMargin > margin) {",
    to: "  if (false) {",
    expect: "the HIGHER (plan) wins",
  },
  {
    // The business floor removed. Nothing then stops a future edit to one
    // input from taking a whole plan below 4x, which is the number the
    // brute-force section exists to hold.
    name: "the per-plan default for the free tier drops below the business floor",
    file: POLICY,
    from: "  free: 6,",
    to: "  free: 2,",
    expect: "plan margin defaults are FREE",
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

console.log("pricing-margin-bug mutations\n");
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
console.log("No turn can be billed below the margin floor without this going red.");
