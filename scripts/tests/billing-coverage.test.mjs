// Every Anthropic call must be paid for, at >= the guaranteed margin, on
// EVERY plan. This file is the thing that makes that true tomorrow, not
// just today.
//
// THE PROBLEM IT EXISTS FOR. The margin machinery — reserve, measure real
// usage, settle at ceil(costEur * M / theAccountsOwnCreditPrice) — is
// correct and is genuinely plan-aware. But it only protects the features
// that actually go through it. Anything still charging a FLAT
// CREDIT_COSTS number bypasses it completely, and a flat number cannot
// hold a multiplier, because what a credit is worth depends on the plan:
//
//     list     EUR 0.0200 per credit
//     Starter  EUR 0.0200   (20 / 1000)
//     Growth   EUR 0.0167   (50 / 3000)
//     Pro      EUR 0.0100   (100 / 10000)
//     Ultimate EUR 0.0080   (200 / 25000)
//
// On Ultimate one credit is EUR 0.008, so a flat 1-credit charge can only
// clear 4x if the call cost under EUR 0.002 (~$0.0022). A single Sonnet
// message of 1,000 in / 500 out costs $0.0105 — five times that. The
// margin does not dip on those features, it is absent.
//
// So this test does three things:
//   1. inventories EVERY messages.create / messages.stream in the tree and
//      fails on any that is not declared here. A new AI feature cannot be
//      added silently; the author has to say how it bills.
//   2. brute-forces margin across plan x pack x cost and fails under 4x.
//   3. runs the exact reported Ultimate scenario.
//
// It runs in `npm run build` (see package.json prebuild), so a feature
// that does not bill correctly cannot be deployed.
//
// Run: node scripts/tests/billing-coverage.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}

const { loadTs } = await import("./load-ts.mjs");
const formula = await loadTs("src/lib/billing/credit-formula.ts");
const pricing = await loadTs("src/lib/billing/model-pricing.ts");
const configMod = await loadTs("src/lib/billing/pricing-config.ts");
const config = configMod.resolvePricingConfig();
const M = config.marginMultiplier;

// ---------------------------------------------------------------------
// 1. The inventory. Every entry states how that call is paid for.
//    "settled"  -> measured usage through reserve/settle. Margin held.
//    "flat"     -> a fixed CREDIT_COSTS number. NOT margin-guaranteed.
//    "unbilled" -> nothing is charged at all.
// Adding a call without adding it here fails the build.
// ---------------------------------------------------------------------
const DECLARED = {
  "src/lib/website-builder.ts": { calls: 4, billing: "settled", note: "generate/edit stream + classifier + patch, all via CostAccumulator" },
  "src/lib/mission-agents.ts": { calls: 3, billing: "settled", note: "planner/reviewer, costs passed in" },
  "src/lib/website-security-review.ts": { calls: 1, billing: "settled", note: "recorded onto the generation's accumulator" },
  "src/lib/mission-step-runner.ts": { calls: 1, billing: "settled" },
  "src/lib/clarification.ts": { calls: 1, billing: "settled" },
  "src/app/api/create/route.ts": { calls: 1, billing: "settled" },
  "src/app/api/create-studio/detect/route.ts": { calls: 1, billing: "settled" },
  "src/app/api/chat/route.ts": { calls: 1, billing: "settled" },

  // --- the gaps this inventory was written to make visible -----------
  "src/app/api/records/ask/route.ts": {
    calls: 1,
    billing: "flat",
    note: "CREDIT_COSTS.chatMessage = 1 credit. On Ultimate that is EUR 0.008 of revenue against an Ask-AI call carrying a whole record as context.",
  },
  "src/app/api/text-actions/route.ts": {
    calls: 1,
    billing: "flat",
    note: "CREDIT_COSTS.textAction = 1 credit, same problem.",
  },
  "src/lib/reflection-agent.ts": {
    calls: 1,
    billing: "flat",
    note: "api/reflection/generate charges CREDIT_COSTS.weeklyReflection = 2 credits, and records no usage at all.",
  },
  "src/lib/chat/memory.ts": {
    calls: 1,
    billing: "unbilled",
    note: "memory extraction inside a chat turn. Only a CALL COUNT reaches the circuit breaker; the tokens are never priced or charged.",
  },
  "src/lib/lead-classification.ts": {
    calls: 1,
    billing: "unbilled",
    note: "reached from api/websites/[id]/submit-form, which is PUBLIC. An anonymous visitor to a generated website triggers a Claude call that no account pays for and no credit balance bounds.",
  },
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

console.log("== 1. every Anthropic call site is declared ==");
const found = {};
for (const file of walk("src")) {
  const n = (readFileSync(file, "utf8").match(/messages\s*\.\s*(create|stream)\s*\(/g) ?? []).length;
  if (n > 0) found[file.split(path.sep).join("/")] = n;
}
const undeclared = Object.keys(found).filter((f) => !DECLARED[f]);
check("no undeclared AI call site", undeclared, []);
if (undeclared.length) {
  console.log("        A new Anthropic call was added without saying how it bills.");
  console.log("        Add it to DECLARED in scripts/tests/billing-coverage.test.mjs");
}
const vanished = Object.keys(DECLARED).filter((f) => !found[f]);
check("no declared site has disappeared", vanished, []);
for (const [file, meta] of Object.entries(DECLARED)) {
  if (!found[file]) continue;
  check(`${file}: ${meta.calls} call(s)`, found[file], meta.calls);
}

console.log("\n== 2. the billing mode of each site ==");
const settled = Object.entries(DECLARED).filter(([, m]) => m.billing === "settled");
const flat = Object.entries(DECLARED).filter(([, m]) => m.billing === "flat");
const unbilled = Object.entries(DECLARED).filter(([, m]) => m.billing === "unbilled");
console.log(`   settled: ${settled.length}   flat: ${flat.length}   unbilled: ${unbilled.length}`);
for (const [file, m] of [...flat, ...unbilled]) {
  console.log(`   ${m.billing.toUpperCase().padEnd(8)} ${file}\n            ${m.note}`);
}
// These two counts are the whole point of the file. They are asserted at
// their CURRENT values so that the numbers can only be changed
// deliberately — moving a feature onto settlement lowers them and the
// test tells you to update it; adding another flat-fee feature raises
// them and the build fails.
check("flat-fee AI features (not margin-guaranteed)", flat.length, 3);
check("completely unbilled AI calls", unbilled.length, 2);

console.log("\n== 3. why a flat fee cannot hold the margin ==");
// Not an opinion: the largest real cost a flat charge can cover, per plan.
const PLANS = [
  { name: "Free", price: 0, monthlyCredits: 100 },
  { name: "Starter", price: 20, monthlyCredits: 1000 },
  { name: "Growth", price: 50, monthlyCredits: 3000 },
  { name: "Professional", price: 100, monthlyCredits: 10000 },
  { name: "Ultimate", price: 200, monthlyCredits: 25000 },
  { name: "Enterprise", price: "custom", monthlyCredits: "custom" },
];
console.log("   plan          EUR/credit   1 credit covers a call costing up to");
for (const plan of PLANS) {
  const rate = formula.effectiveCreditPriceEur(plan, config);
  const maxCostEur = rate / M;
  console.log(
    `   ${plan.name.padEnd(13)} ${rate.toFixed(4)}       EUR ${maxCostEur.toFixed(5)}  ($${(maxCostEur / config.usdToEurRate).toFixed(5)})`
  );
}
// A single small Sonnet turn: 1,000 in / 500 out.
const smallTurn = pricing.priceUsage({ input_tokens: 1000, output_tokens: 500 }, "claude-sonnet-4-6").usdCost;
const ultimateRate = formula.effectiveCreditPriceEur(PLANS[4], config);
checkTrue(
  `a 1k-in/500-out turn costs $${smallTurn.toFixed(4)}, more than 1 Ultimate credit can cover at ${M}x`,
  smallTurn * config.usdToEurRate > ultimateRate / M
);
check(
  "so a flat 1 credit is the wrong charge for it — it needs this many",
  formula.creditsForRealCostOnAccount(smallTurn * config.usdToEurRate, PLANS[4], null, config),
  Math.ceil((smallTurn * config.usdToEurRate * M) / ultimateRate)
);

console.log("\n== 4. the reported Ultimate scenario ==");
// Ultimate, a website generation costing EUR 0.28. 44 credits was
// reported. At EUR 0.008 per credit that is EUR 0.352 of revenue on
// EUR 0.28 of cost — 1.26x.
const COST_EUR = 0.28;
const ultimate = PLANS[4];
check("Ultimate is EUR 0.008 per credit", Number(ultimateRate.toFixed(6)), 0.008);
const shouldCharge = formula.creditsForRealCostOnAccount(COST_EUR, ultimate, null, config);
check("EUR 0.28 x 4 / EUR 0.008 = 140 credits", shouldCharge, 140);
const achieved = formula.achievedMarginOnAccount(shouldCharge, COST_EUR, ultimate, null, config);
checkTrue(`which is ${achieved.toFixed(4)}x, at or above ${M}x`, achieved >= M);
// And the reported charge, scored honestly.
const reportedMargin = formula.achievedMarginOnAccount(44, COST_EUR, ultimate, null, config);
checkTrue(`44 credits would have been ${reportedMargin.toFixed(3)}x — below ${M}x`, reportedMargin < M);
// The settled path produces 140, not 44, so a settled website generation
// cannot be the source of a 44-credit charge at this cost.
checkTrue("the settled formula does not produce 44 here", shouldCharge !== 44);

console.log("\n== 5. brute force: every plan x pack x cost clears the margin ==");
const PACKS = [null, 10 / 500, 25 / 1500, 50 / 3500, 100 / 8000];
let worst = Infinity,
  worstAt = null,
  combos = 0;
for (const plan of PLANS) {
  for (const pack of PACKS) {
    // From a trivial classifier call to a full 128k-output generation.
    for (let usd = 0.0001; usd < 3; usd *= 1.15) {
      const eur = usd * config.usdToEurRate;
      const credits = formula.creditsForRealCostOnAccount(eur, plan, pack, config);
      const m = formula.achievedMarginOnAccount(credits, eur, plan, pack, config);
      combos++;
      if (m !== null && m < worst) {
        worst = m;
        worstAt = { plan: plan.name, pack, usd: Number(usd.toFixed(6)), credits, margin: m };
      }
    }
  }
}
checkTrue(`worst of ${combos} combinations is ${worst.toFixed(6)}x, still >= ${M}`, worst >= M, JSON.stringify(worstAt));

console.log("\n== 6. worst case per plan: spend the whole allowance on one action ==");
// The guarantee restated as the business rule: if every credit is spent
// at >= Mx, total AI cost can never exceed 1/M of revenue.
console.log("   plan          credits   revenue   max AI cost   % of price");
for (const plan of PLANS) {
  if (typeof plan.price !== "number" || typeof plan.monthlyCredits !== "number" || plan.price <= 0) continue;
  const rate = formula.effectiveCreditPriceEur(plan, config);
  const revenue = plan.monthlyCredits * rate;
  const maxCost = revenue / M;
  const pct = (maxCost / plan.price) * 100;
  console.log(
    `   ${plan.name.padEnd(13)} ${String(plan.monthlyCredits).padEnd(9)} EUR ${revenue.toFixed(2).padEnd(9)} EUR ${maxCost.toFixed(2).padEnd(13)} ${pct.toFixed(1)}%`
  );
  checkTrue(`${plan.name}: AI cost <= 25% of the plan price (${pct.toFixed(1)}%)`, pct <= 25.001);
}

console.log("\n== 7. the settlement path really is plan-aware ==");
// The code that makes it so, asserted rather than described.
const src = readFileSync("src/lib/billing/reservations.ts", "utf8");
checkTrue("settlement divides by the ACCOUNT's rate", /creditsForRealCostOnAccount\(realCostEur, plan, packPriceEur, config\)/.test(src));
checkTrue("the plan is a required settlement input", /plan: Plan \| null;/.test(src));
checkTrue("a shortfall is logged, not swallowed", /billing:marginBelowTarget/.test(src));
const routeSrc = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
checkTrue("the generate route resolves the real plan", /resolveEffectivePlan\(user\)/.test(routeSrc));
checkTrue("and hands it to settlement", /\n\s*plan,\n/.test(routeSrc));
// Free and Enterprise have no per-credit rate, so they must fall back to
// the LIST price — never to zero, which would divide by zero.
for (const plan of [PLANS[0], PLANS[5], null, undefined]) {
  const r = formula.effectiveCreditPriceEur(plan, config);
  checkTrue(`${plan?.name ?? String(plan)} falls back to the list price`, r === config.creditPriceEur);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
