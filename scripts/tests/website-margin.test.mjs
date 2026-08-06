// Reproduction test for "charged 44 credits (€0.88) for a website that cost
// $0.30 (€0.28) at Anthropic = 3.1x, below the guaranteed 4x".
//
// ROOT CAUSE. A single website generation makes FOUR billable AI calls,
// split across two routes:
//
//   api/websites/generate          (START)
//     1. checkNeedsClarification   -> clarification.ts
//     2. classifyWebsiteDescription-> website-builder.ts
//   api/websites/generate/process  (WORKER)
//     3. generateWebsiteHtml       (+ up to 2 continuation rounds)
//     4. reviewWebsiteContentSafety
//
// Both library functions take an optional `costs?: CostAccumulator`. The
// WORKER passes one and settles on measured usage, so calls 3 and 4 hit 4x
// exactly. The START route passed NEITHER, so calls 1 and 2 were:
//
//   - never measured   (no usage recorded anywhere)
//   - never logged     (invisible to ai_cost_log and the margin report)
//   - charged a FLAT 1 credit for the clarification, and NOTHING for the
//     classifier
//
// Their real cost is therefore paid by the business at 0x while the rest
// earns 4x, and the blended margin lands below the guarantee. The estimate
// profile has always modelled all three auxiliary calls
// (ACTION_PROFILES.websiteGenerate), so the RESERVE was right and only the
// SETTLEMENT was wrong — which is exactly why it produced a plausible
// number instead of an obviously broken one.
//
// THE FIX. The START route now accumulates its own calls and settles them
// through settleReservation on measured usage, the same machinery the
// worker uses. Every AI call in the flow is charged at the same multiplier.
//
// Run: node scripts/tests/website-margin.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const START = "src/app/api/websites/generate/route.ts";
const WORKER = "src/app/api/websites/generate/process/route.ts";
const startSrc = strip(readFileSync(START, "utf8"));
const workerSrc = strip(readFileSync(WORKER, "utf8"));

console.log("== 1. every AI call in the flow is MEASURED ==");
checkTrue(`${START}: builds a CostAccumulator`, /new CostAccumulator\(\)/.test(startSrc));
// The bug, stated directly: these two calls were made without one.
checkTrue(
  `${START}: passes it to the clarification check`,
  /checkNeedsClarification\([^)]*costs\)/.test(startSrc)
);
checkTrue(
  `${START}: passes it to the off-topic classifier`,
  /classifyWebsiteDescription\([^)]*costs\)/.test(startSrc)
);
checkTrue(`${WORKER}: still measures generation`, /new CostAccumulator\(\)/.test(workerSrc));

console.log("\n== 2. those measurements are SETTLED, not flat-charged ==");
checkTrue(`${START}: settles on measured usage`, /settleReservation\(/.test(startSrc));
// A flat per-call fee is what broke the guarantee — it cannot track cost.
check(
  `${START}: no flat CREDIT_COSTS charge for the pre-check`,
  /deductCredits\(\s*\n?\s*user\.id,\s*\n?\s*CREDIT_COSTS\.clarificationCheck/.test(startSrc),
  false
);
checkTrue(
  `${START}: settlement carries the accumulator`,
  /settleReservation\(\{[\s\S]{0,400}costs\b/.test(startSrc)
);
checkTrue(
  `${START}: settlement carries the plan (so the account's real rate is used)`,
  /settleReservation\(\{[\s\S]{0,400}plan\b/.test(startSrc)
);
checkTrue(
  `${START}: admins/beta still bypass the charge but are still logged`,
  /settleReservation\(\{[\s\S]{0,500}bypassCharge/.test(startSrc)
);

console.log("\n== 3. the arithmetic actually holds at 4x ==");
// Drive the REAL formula, not a restatement of it. loadTs resolves the
// "@/" aliases these billing modules import each other through — an
// ad-hoc single-file transpile cannot, which is what scripts/tests/load-ts.mjs
// exists for.
const formula = await loadTs("src/lib/billing/credit-formula.ts");
const cfgMod = await loadTs("src/lib/billing/pricing-config.ts");
const config = cfgMod.resolvePricingConfig();
checkTrue(`the configured multiplier is 4x (${config.marginMultiplier})`, config.marginMultiplier >= 4);

// The reported incident, reproduced with the real numbers.
const REAL_COST_EUR = 0.28; // $0.30 at Anthropic
const creditsAt4x = formula.creditsForRealCostOnRate(REAL_COST_EUR, config.creditPriceEur, config);
const revenueEur = creditsAt4x * config.creditPriceEur;
const achieved = revenueEur / REAL_COST_EUR;
console.log(
  `        €${REAL_COST_EUR} real -> ${creditsAt4x} credits = €${revenueEur.toFixed(2)} (${achieved.toFixed(2)}x)`
);
checkTrue(`charging the FULL measured cost reaches 4x (${achieved.toFixed(2)}x)`, achieved >= 4);
console.log(`        the incident charged 44 credits = €0.88 = 3.14x, because only part of the cost was settled`);
checkTrue("44 credits would indeed have been short", 44 < creditsAt4x);

// And the property that actually matters for a flow split across TWO
// settlements (start route + worker): each part independently clears 4x,
// so their sum does too. Charging in parts can never drop below the
// guarantee, whatever the split.
//
// Stated as "every part clears 4x" rather than "parts sum to >= the whole".
// The latter looks equivalent and is not testable as written: 0.09 + 0.19
// is 0.28000000000000003 in binary, Math.ceil sees 56.000000000000007 and
// charges 57 where settling 0.28 once charges 56. That is float noise in
// the ARITHMETIC OF THE TEST, not a defect — and it errs by overcharging a
// single credit, i.e. in the direction that protects the margin.
const SPLITS = [
  [0.09, 0.19],
  [0.01, 0.27],
  [0.001, 0.4],
  [0.15, 0.15],
];
for (const [partA, partB] of SPLITS) {
  const cA = formula.creditsForRealCostOnRate(partA, config.creditPriceEur, config);
  const cB = formula.creditsForRealCostOnRate(partB, config.creditPriceEur, config);
  const marginA = (cA * config.creditPriceEur) / partA;
  const marginB = (cB * config.creditPriceEur) / partB;
  const blended = ((cA + cB) * config.creditPriceEur) / (partA + partB);
  checkTrue(
    `split €${partA}+€${partB}: each part >= 4x and blended ${blended.toFixed(2)}x >= 4x`,
    marginA >= config.marginMultiplier &&
      marginB >= config.marginMultiplier &&
      blended >= config.marginMultiplier
  );
}
// The incident in one line: settling only PART of the cost is what breaks
// it. 4x on the worker's share alone is 3.1x on the whole.
const workerOnly = formula.creditsForRealCostOnRate(0.22, config.creditPriceEur, config);
const blendedWhenPrechecksAreFree = (workerOnly * config.creditPriceEur) / REAL_COST_EUR;
checkTrue(
  `leaving the pre-checks unbilled lands below 4x (${blendedWhenPrechecksAreFree.toFixed(2)}x) — the reported symptom`,
  blendedWhenPrechecksAreFree < config.marginMultiplier
);

console.log("\n== 4. the estimate already modelled all three aux calls ==");
// It did — which is why the RESERVE was right and only the settlement was
// wrong. Asserted so a future edit cannot quietly drop one and re-open the
// same gap from the other side.
const est = readFileSync("src/lib/billing/estimate.ts", "utf8");
const profile = est.slice(est.indexOf("websiteGenerate: {"), est.indexOf("websiteEdit: {"));
const auxCalls = [...profile.matchAll(/\{ inputTokens:/g)].length;
check("websiteGenerate models 3 auxiliary calls", auxCalls, 3);
checkTrue("...including the security review's larger input", /inputTokens: 4000/.test(profile));

console.log("\n== 5. nothing in the flow is billed at 0x ==");
// Every recorded stage must be reachable by a settlement. A stage recorded
// into an accumulator nobody settles is the original bug's exact shape.
const STAGES = [
  ["clarification", "src/lib/clarification.ts"],
  ["classification", "src/lib/website-builder.ts"],
  ["security_review", "src/lib/website-security-review.ts"],
];
for (const [stage, file] of STAGES) {
  checkTrue(`${stage} is recorded in ${file}`, new RegExp(`costs\\?\\.record\\("${stage}"`).test(readFileSync(file, "utf8")));
}
// The two start-route stages must be settled by the start route, and the
// worker's by the worker — no stage may be orphaned between them.
checkTrue(
  "the start route settles under its own feature name",
  /settleReservation\(\{[\s\S]{0,400}feature: "website_generate_precheck"/.test(startSrc)
);
checkTrue(
  "the worker settles under its own",
  /settleReservation\(\{[\s\S]{0,400}feature: "website_generate"/.test(workerSrc)
);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
