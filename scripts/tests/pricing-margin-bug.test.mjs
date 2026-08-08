// Reproduction test for "a chat message that cost $0.10 was charged
// 2 credits" — a 0.17x margin, i.e. a straight loss on every message.
//
// ROOT CAUSE, in two stacked parts:
//
//   1. MODEL_PRICING_USD knew exactly ONE model (claude-sonnet-4-6), and
//      FALLBACK_MODEL_PRICING — "the most expensive KNOWN model" — was
//      therefore... Sonnet. A turn actually served by any pricier model
//      (Opus at $5/$25, Fable at $10/$50 per MTok) was silently priced at
//      less than a third of its real cost. Every call site also passed the
//      REQUESTED model constant to costs.record(), not the model the
//      response says served it, so nothing could even notice the mismatch.
//
//   2. The margin alert could not fire, BY CONSTRUCTION: the stored
//      achieved_margin is computed from the same understated cost, so it
//      read a healthy 4.00x while the real multiple was 0.17x. The only
//      observable fact is that an unknown model was priced by guess — which
//      is exactly what settlement now alerts on.
//
// THE FIX, asserted below:
//   - the pricing table covers every current Claude model, with cache
//     write/read rates, and the fallback is genuinely the most expensive;
//   - every costs.record() call site prices response.model, so an upgrade
//     or alias is priced at what actually served the call;
//   - settlement raises billing:unknownModelPricing + the margin email
//     when any usage was priced by fallback;
//   - per-feature and per-plan margins combine as max(...) and never fall
//     below 4x;
//   - brute force: every feature x plan x model x size lands >= its
//     resolved margin, which is >= 4x.
//
// Run: node scripts/tests/pricing-margin-bug.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const pricingMod = await loadTs("src/lib/billing/model-pricing.ts");
const {
  MODEL_PRICING_USD,
  FALLBACK_MODEL_PRICING,
  pricingForModel,
  normalizeModelId,
  isKnownModel,
  priceUsage,
} = pricingMod;
const accMod = await loadTs("src/lib/billing/cost-accumulator.ts");
const { CostAccumulator } = accMod;
const formulaMod = await loadTs("src/lib/billing/credit-formula.ts");
const {
  creditsForRealCostOnAccount,
  achievedMarginOnAccount,
  effectiveCreditPriceEurForAccount,
  usdToEur,
} = formulaMod;
const policyMod = await loadTs("src/lib/billing/margin-policy.ts");
const { resolveMarginFor, PLAN_MARGIN_DEFAULTS, FEATURE_MARGIN_GROUPS } = policyMod;
const plansMod = await loadTs("src/lib/billing/plans.ts");
const { PLANS, getPlan } = plansMod;
const configMod = await loadTs("src/lib/billing/pricing-config.ts");
const { DEFAULTS } = configMod;

// ---------------------------------------------------------------------------
console.log("== 1. the pricing table covers every current Claude model ==");
// List prices per MTok as published: Sonnet-tier $3/$15, Opus-tier $5/$25,
// Haiku $1/$5, Fable/Mythos $10/$50; cache write = 1.25x input, cache
// read = 0.1x input.
const EXPECTED = {
  "claude-sonnet-4-5": [3, 15],
  "claude-sonnet-4-6": [3, 15],
  "claude-sonnet-5": [3, 15],
  "claude-opus-4-5": [5, 25],
  "claude-opus-4-6": [5, 25],
  "claude-opus-4-7": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-opus-5": [5, 25],
  "claude-haiku-4-5": [1, 5],
  "claude-fable-5": [10, 50],
  "claude-mythos-5": [10, 50],
};
for (const [model, [inp, out]] of Object.entries(EXPECTED)) {
  const p = MODEL_PRICING_USD[model];
  check(
    `${model}: $${inp}/$${out} with correct cache rates`,
    p &&
      p.inputPerMTok === inp &&
      p.outputPerMTok === out &&
      approx(p.cacheWritePerMTok, inp * 1.25) &&
      approx(p.cacheReadPerMTok, inp * 0.1),
    JSON.stringify(p)
  );
}
check(
  "the fallback is genuinely the most expensive known model (Fable tier)",
  FALLBACK_MODEL_PRICING.inputPerMTok === 10 && FALLBACK_MODEL_PRICING.outputPerMTok === 50
);
check(
  "a dated snapshot id resolves to its alias row",
  normalizeModelId("claude-haiku-4-5-20251001") === "claude-haiku-4-5" &&
    isKnownModel("claude-haiku-4-5-20251001")
);
check(
  "a deployment-variant suffix resolves to its alias row",
  normalizeModelId("claude-sonnet-4-6[1m]") === "claude-sonnet-4-6" &&
    isKnownModel("claude-sonnet-4-6[1m]")
);
check("a truly unknown model is NOT silently known", !isKnownModel("claude-imaginary-9"));
check(
  "...and prices at the most expensive rates, never cheaper",
  pricingForModel("claude-imaginary-9").outputPerMTok === 50
);

// ---------------------------------------------------------------------------
console.log("\n== 2. THE INCIDENT, reproduced: $0.10 chat message -> 2 credits ==");
// A chat turn genuinely served by claude-fable-5. Real usage of the WHOLE
// turn (all tool rounds + memory extraction), chosen so the real cost is
// exactly $0.10:
//   2,000 input x $10/M + 4,400 cache-write x $12.50/M + 500 output x $50/M
//   = 0.020 + 0.055 + 0.025 = $0.100
const FULL_TURN_USAGE = {
  input_tokens: 2000,
  output_tokens: 500,
  cache_creation_input_tokens: 4400,
  cache_read_input_tokens: 0,
};
const realBreakdown = priceUsage(FULL_TURN_USAGE, "claude-fable-5");
check("the turn really cost $0.10", approx(realBreakdown.usdCost, 0.1, 1e-9), `$${realBreakdown.usdCost}`);

// What the OLD pipeline did to that turn. Two stacked failures:
//   (a) it priced the hardcoded REQUESTED model, and its one-model table
//       made every id price at Sonnet rates;
//   (b) the deployed settlement predated the record-every-round fix, so
//       only the final round's slice of usage (350 in / 200 out) was ever
//       recorded — the tool rounds and cache writes were invisible.
const OLD_SONNET_PRICING = { inputPerMTok: 3, outputPerMTok: 15, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.3 };
const lastRound = { input: 350, output: 200 };
const oldComputedUsd =
  (lastRound.input / 1_000_000) * OLD_SONNET_PRICING.inputPerMTok +
  (lastRound.output / 1_000_000) * OLD_SONNET_PRICING.outputPerMTok;
const ultimate = getPlan("ultimate");
const oldComputedEur = usdToEur(oldComputedUsd, DEFAULTS);
const oldCredits = creditsForRealCostOnAccount(oldComputedEur, ultimate, null, DEFAULTS, 4);
const realEur = usdToEur(realBreakdown.usdCost, DEFAULTS);
const oldRealMargin = achievedMarginOnAccount(oldCredits, realEur, ultimate, null, DEFAULTS);
check("old pipeline charged exactly 2 credits for it (Ultimate plan)", oldCredits === 2, `${oldCredits} credits`);
check(
  "which is the reported 0.17x margin — a loss on every message",
  oldRealMargin > 0.16 && oldRealMargin < 0.18,
  `${oldRealMargin?.toFixed(3)}x`
);
// And the alert saw nothing: the STORED margin was computed from the same
// understated cost, so it read as a healthy >= 4x.
const oldStoredMargin = achievedMarginOnAccount(oldCredits, oldComputedEur, ultimate, null, DEFAULTS);
check(
  "while the STORED margin read healthy — why the alert never fired",
  oldStoredMargin !== null && oldStoredMargin >= 4,
  `stored ${oldStoredMargin?.toFixed(2)}x vs real ${oldRealMargin?.toFixed(2)}x`
);

console.log("\n== 3. the SAME turn through the FIXED pipeline ==");
const costs = new CostAccumulator();
// The route now records the model the RESPONSE reports, for every round.
costs.record("generation", FULL_TURN_USAGE, "claude-fable-5");
check("measured cost is the real $0.10", approx(costs.totalUsdCost, 0.1, 1e-9), `$${costs.totalUsdCost}`);
for (const plan of PLANS) {
  const { margin: target } = resolveMarginFor("chat_message", plan.slug, DEFAULTS, {});
  const credits = creditsForRealCostOnAccount(realEur, plan, null, DEFAULTS, target);
  const achieved = achievedMarginOnAccount(credits, realEur, plan, null, DEFAULTS);
  const rate = effectiveCreditPriceEurForAccount(plan, null, DEFAULTS);
  check(
    `${plan.slug}: ${credits} credits = €${(credits * rate).toFixed(3)} revenue -> ${achieved.toFixed(2)}x >= ${target}x`,
    achieved !== null && achieved >= target - 1e-9 && target >= 4,
    `credits=${credits} achieved=${achieved}`
  );
}
// The one thing the old pipeline could never do: NOTICE an unknown model.
const costsUnknown = new CostAccumulator();
costsUnknown.record("generation", FULL_TURN_USAGE, "claude-brand-new-model");
check(
  "usage from a model the table does not know is flagged for the alert",
  costsUnknown.unknownModels().includes("claude-brand-new-model")
);
check("known models are not flagged", costs.unknownModels().length === 0);

// ---------------------------------------------------------------------------
console.log("\n== 4. margin policy: per-plan defaults, per-feature overrides, max() rule ==");
check(
  "plan margin defaults are FREE 6 / STARTER 5 / GROWTH 4.5 / PRO 4 / ULT 4 / ENT 4",
  PLAN_MARGIN_DEFAULTS.free === 6 &&
    PLAN_MARGIN_DEFAULTS.starter === 5 &&
    PLAN_MARGIN_DEFAULTS.growth === 4.5 &&
    PLAN_MARGIN_DEFAULTS.professional === 4 &&
    PLAN_MARGIN_DEFAULTS.ultimate === 4 &&
    PLAN_MARGIN_DEFAULTS.enterprise === 4
);
{
  const r = resolveMarginFor("chat_message", "free", DEFAULTS, {});
  check("free plan resolves 6x from its default", r.margin === 6 && r.source === "plan", JSON.stringify(r));
}
{
  const r = resolveMarginFor("deep_research", "professional", DEFAULTS, { CREDIT_MARGIN_DEEP_RESEARCH: "8" });
  check("CREDIT_MARGIN_DEEP_RESEARCH=8 wins on Professional", r.margin === 8 && r.source === "feature");
}
{
  const r = resolveMarginFor("chat_message", "free", DEFAULTS, { CREDIT_MARGIN_CHAT: "5" });
  check("feature 5x vs plan 6x -> the HIGHER (plan) wins", r.margin === 6 && r.source === "plan");
}
{
  const r = resolveMarginFor("chat_message", "free", DEFAULTS, { CREDIT_MARGIN_CHAT: "8" });
  check("feature 8x vs plan 6x -> the HIGHER (feature) wins", r.margin === 8 && r.source === "feature");
}
{
  const r = resolveMarginFor("deep_research", "ultimate", DEFAULTS, { CREDIT_MARGIN_DEEP_RESEARCH: "3" });
  check("out-of-range 3 is ignored -> general default", r.margin === 4 && r.featureMargin === null);
}
{
  const r = resolveMarginFor("deep_research", "ultimate", DEFAULTS, { CREDIT_MARGIN_DEEP_RESEARCH: "11" });
  check("out-of-range 11 is ignored -> general default", r.margin === 4 && r.featureMargin === null);
}
{
  const r = resolveMarginFor("deep_research", "ultimate", DEFAULTS, { CREDIT_MARGIN_DEEP_RESEARCH: "banana" });
  check("garbage is ignored -> general default", r.margin === 4 && r.featureMargin === null);
}
{
  const r = resolveMarginFor("agent_run", "starter", DEFAULTS, { CREDIT_MARGIN_AGENT_RUN: "7" });
  const r2 = resolveMarginFor("scheduled_agent_run", "starter", DEFAULTS, { CREDIT_MARGIN_AGENT_RUN: "7" });
  check("CREDIT_MARGIN_AGENT_RUN covers both manual and scheduled runs", r.margin === 7 && r2.margin === 7);
}
{
  const exact = resolveMarginFor("scheduled_agent_run", "starter", DEFAULTS, {
    CREDIT_MARGIN_AGENT_RUN: "7",
    CREDIT_MARGIN_SCHEDULED_AGENT_RUN: "9",
  });
  check("an exact per-feature key beats its group key", exact.margin === 9);
}
{
  const r = resolveMarginFor(null, null, DEFAULTS, {});
  check("no feature, no plan -> the general 4x", r.margin === 4 && r.source === "general");
}
check(
  "the documented group aliases exist (CHAT / WEBSITE_GENERATE / DEEP_RESEARCH / AGENT_RUN)",
  FEATURE_MARGIN_GROUPS.chat_message === "CREDIT_MARGIN_CHAT" &&
    FEATURE_MARGIN_GROUPS.website_generate === "CREDIT_MARGIN_WEBSITE_GENERATE" &&
    FEATURE_MARGIN_GROUPS.deep_research === "CREDIT_MARGIN_DEEP_RESEARCH" &&
    FEATURE_MARGIN_GROUPS.agent_run === "CREDIT_MARGIN_AGENT_RUN"
);

// ---------------------------------------------------------------------------
console.log("\n== 5. BRUTE FORCE: every feature x plan x model x size >= its margin >= 4x ==");
const FEATURES = [
  "chat_message", "chat_free", "website_generate", "website_generate_precheck",
  "website_edit", "create_anything", "clarification_check", "mission_plan",
  "mission_review", "create_studio_detect", "automation_run", "agent_build",
  "agent_run", "scheduled_agent_run", "ask_ai_record", "text_action",
  "weekly_reflection", "import_map", "import_paste", "insight_narrate",
  "file_ask", "deep_research", "research_plan", "lead_classification",
];
// Sizes from a two-word message to a 1M-token monster context.
const SIZES = [
  { input: 50, output: 20, cacheW: 0, cacheR: 0, searches: 0 },
  { input: 2_000, output: 800, cacheW: 0, cacheR: 0, searches: 0 },
  { input: 10_000, output: 2_048, cacheW: 4_000, cacheR: 0, searches: 3 },
  { input: 120_000, output: 8_000, cacheW: 30_000, cacheR: 60_000, searches: 6 },
  { input: 1_000_000, output: 128_000, cacheW: 100_000, cacheR: 500_000, searches: 20 },
];
const PACK_RATES = [null, 100 / 8000]; // no pack, and the cheapest pack (€0.0125)
let combos = 0;
let worstAchievedVsTarget = Infinity;
let broken = 0;
for (const feature of FEATURES) {
  for (const plan of PLANS) {
    const { margin: target } = resolveMarginFor(feature, plan.slug, DEFAULTS, {});
    if (target < 4) { broken++; continue; }
    for (const model of Object.keys(MODEL_PRICING_USD)) {
      for (const size of SIZES) {
        for (const pack of PACK_RATES) {
          combos++;
          const usage = priceUsage(
            {
              input_tokens: size.input,
              output_tokens: size.output,
              cache_creation_input_tokens: size.cacheW,
              cache_read_input_tokens: size.cacheR,
              server_tool_use: { web_search_requests: size.searches },
            },
            model
          );
          const eur = usdToEur(usage.usdCost, DEFAULTS);
          const credits = creditsForRealCostOnAccount(eur, plan, pack, DEFAULTS, target);
          const achieved = achievedMarginOnAccount(credits, eur, plan, pack, DEFAULTS);
          if (achieved === null || achieved < target - 1e-9) broken++;
          else worstAchievedVsTarget = Math.min(worstAchievedVsTarget, achieved / target);
        }
      }
    }
  }
}
check(
  `all ${combos} combinations meet their resolved margin (>= 4x)`,
  broken === 0,
  `${broken} broken`
);
check(
  "the worst combination still lands AT or above its target, never below",
  worstAchievedVsTarget >= 1 - 1e-9,
  `worst achieved/target = ${worstAchievedVsTarget}`
);

// A table of real examples for the report.
console.log("\n   Ενέργεια          | tokens in/out | real cost  | margin | credits | έσοδα     | τελικό");
const EXAMPLES = [
  ["chat_message", "free", "claude-sonnet-4-6", 3000, 800],
  ["chat_message", "ultimate", "claude-fable-5", 2000, 500, 4400],
  ["website_generate", "starter", "claude-sonnet-4-6", 15000, 40000],
  ["deep_research", "professional", "claude-sonnet-4-6", 60000, 20000],
  ["agent_run", "growth", "claude-opus-5", 5000, 3000],
  ["text_action", "free", "claude-sonnet-4-6", 1200, 900],
];
for (const [feature, planSlug, model, inTok, outTok, cacheW = 0] of EXAMPLES) {
  const plan = getPlan(planSlug);
  const { margin: target } = resolveMarginFor(feature, planSlug, DEFAULTS, {});
  const u = priceUsage(
    { input_tokens: inTok, output_tokens: outTok, cache_creation_input_tokens: cacheW },
    model
  );
  const eur = usdToEur(u.usdCost, DEFAULTS);
  const credits = creditsForRealCostOnAccount(eur, plan, null, DEFAULTS, target);
  const rate = effectiveCreditPriceEurForAccount(plan, null, DEFAULTS);
  const achieved = achievedMarginOnAccount(credits, eur, plan, null, DEFAULTS);
  console.log(
    `   ${feature.padEnd(17)} | ${String(inTok).padStart(7)}/${String(outTok).padEnd(6)}` +
      `| $${u.usdCost.toFixed(4)} | ${String(target).padEnd(4)}x | ${String(credits).padStart(5)}   | €${(credits * rate).toFixed(4)} | ${achieved.toFixed(2)}x`
  );
  check(
    `   ...${feature}@${planSlug} on ${model} clears ${target}x`,
    achieved >= target - 1e-9
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 6. the route really settles the RESPONSE model, not the requested one ==");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const chatSrc = strip(readFileSync("src/app/api/chat/route.ts", "utf8"));
check(
  "api/chat records finalResponse.model",
  /costs\.record\("generation", finalResponse\.usage, finalResponse\.model \|\| MODEL\)/.test(chatSrc)
);
check("api/chat shares CHAT_MODEL with the free-chat economics", /const MODEL = CHAT_MODEL/.test(chatSrc));
const memSrc = strip(readFileSync("src/lib/chat/memory.ts", "utf8"));
check(
  "memory extraction records ITS response model too",
  /costs\?\.record\("other", result\.usage, result\.model \|\| MEMORY_MODEL\)/.test(memSrc)
);
// No call site anywhere still records a bare hardcoded model constant.
const { execSync } = await import("node:child_process");
const bareRecords = execSync(
  `grep -rn "\\.record(" src --include=*.ts --include=*.tsx | grep -v "reservations.ts\\|cost-accumulator.ts" | grep -v "\\.model" || true`,
  { encoding: "utf8" }
).trim();
check("no costs.record() call site ignores the response model", bareRecords === "", bareRecords);
const resSrc = strip(readFileSync("src/lib/billing/reservations.ts", "utf8"));
check(
  "settlement alerts on usage priced by fallback (unknown model)",
  /billing:unknownModelPricing/.test(resSrc) && /unknownModels\(\)/.test(resSrc)
);
check(
  "the below-target alert now compares against the RESOLVED margin",
  /margin < marginPolicy\.margin/.test(resSrc)
);
check(
  "the cost-log row stores which margin applied and why",
  /appliedMarginMultiplier: marginPolicy\.margin/.test(resSrc) && /marginSource: marginPolicy\.source/.test(resSrc)
);
check(
  "the stored margin_multiplier column is the resolved one",
  /p_margin_multiplier: marginPolicy\.margin/.test(resSrc)
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
