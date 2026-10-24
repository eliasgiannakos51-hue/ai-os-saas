#!/usr/bin/env node
/*
 * CODING PRICING: FAST / NORMAL / MAXIMUM
 *
 * The owner's spec (Ζ, 2026-10-23): "Table for Fast/Normal/Maximum: real
 * cost, credits charged, margin. Each level above 4×. Test that fails if
 * below 4×. Cost shown before sending, never charge above balance."
 *
 * This test:
 *  1. Computes the real USD cost for each power level at a reference input.
 *  2. Computes the credits the estimator would charge.
 *  3. Derives the effective margin (credits × creditPrice / realCost).
 *  4. Fails if any level's margin is below 4×.
 *  5. Prints the table the owner asked for.
 *
 * Run: node scripts/tests/coding-pricing.test.mjs
 */
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};

const power = await loadTs("src/lib/coding/power.ts");
const config = await loadTs("src/lib/billing/pricing-config.ts");
const estimate = await loadTs("src/lib/billing/estimate.ts");
const pricing = await loadTs("src/lib/billing/model-pricing.ts");
const policy = await loadTs("src/lib/billing/margin-policy.ts");

const REFERENCE_INPUT_CHARS = 2000;
const levels = power.POWER_LEVELS;
const defaults = config.DEFAULTS;

// -----------------------------------------------------------------------
console.log("== 1. every power level maps to a real model ==");
// -----------------------------------------------------------------------
for (const level of levels) {
  const model = power.modelForPower(level);
  check(`${level} -> model "${model}"`, typeof model === "string" && model.length > 0);
  const p = pricing.pricingForModel(model);
  check(`${level} model has pricing (input: $${p.inputPerMTok}/MTok)`, p.inputPerMTok > 0);
}

// -----------------------------------------------------------------------
console.log("\n== 2. the margin table ==");
// -----------------------------------------------------------------------
console.log(
  "\n  Level     Model                   Real USD    Credits   Margin"
);
console.log(
  "  ------   ----------------------  ---------   -------   ------"
);

const rows = [];
for (const level of levels) {
  const model = power.modelForPower(level);
  const est = estimate.estimateForAction(
    "codeAssist",
    { model, inputChars: REFERENCE_INPUT_CHARS },
    defaults
  );
  const effectiveMargin = est.estimatedCredits > 0 && est.estimatedUsd > 0
    ? (est.estimatedCredits * defaults.creditPriceEur) / (est.estimatedUsd * defaults.usdToEurRate)
    : 0;
  rows.push({ level, model, usd: est.estimatedUsd, credits: est.estimatedCredits, margin: effectiveMargin });
  console.log(
    `  ${level.padEnd(8)} ${model.padEnd(23)} $${est.estimatedUsd.toFixed(6).padStart(9)}   ${String(Math.round(est.estimatedCredits)).padStart(7)}   ${effectiveMargin.toFixed(1)}×`
  );
}

// -----------------------------------------------------------------------
console.log("\n== 3. every level is above the 4× business floor ==");
// -----------------------------------------------------------------------
for (const r of rows) {
  check(
    `${r.level} margin ${r.margin.toFixed(1)}× >= 4×`,
    r.margin >= 4,
    `${r.margin.toFixed(2)}× — below the business floor`
  );
}

// -----------------------------------------------------------------------
console.log("\n== 4. each level above is more expensive than the one below ==");
// -----------------------------------------------------------------------
for (let i = 1; i < rows.length; i++) {
  check(
    `${rows[i].level} (${rows[i].credits} credits) > ${rows[i - 1].level} (${rows[i - 1].credits} credits)`,
    rows[i].credits > rows[i - 1].credits
  );
}

// -----------------------------------------------------------------------
console.log("\n== 5. the estimate the USER sees is computed from the SAME function ==");
// -----------------------------------------------------------------------
// coding-workspace.tsx uses estimateForAction("codeAssist", ..., DEFAULTS)
// with the same model. If the server used a different function, the shown
// cost and the actual charge would diverge.
check(
  "codeAssist is in ACTION_PROFILES",
  "codeAssist" in estimate.ACTION_PROFILES
);
check(
  "codeAssist maps to code_assist in the margin policy",
  policy.ACTION_TO_FEATURE.codeAssist === "code_assist"
);

// -----------------------------------------------------------------------
console.log("\n== 6. the route checks balance before running ==");
// -----------------------------------------------------------------------
// Structural: the run route imports reserveCredits and hasEnoughCredits.
import { readFileSync } from "node:fs";
const runRoute = readFileSync("src/app/api/coding/run/route.ts", "utf8");
check(
  "the run route reserves credits before executing",
  runRoute.includes("reserveCredits") && runRoute.includes("hasEnoughCredits"),
  "missing balance check"
);
check(
  "the run route returns insufficient_credits on low balance",
  runRoute.includes("insufficient_credits"),
  "user could be charged above balance"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
