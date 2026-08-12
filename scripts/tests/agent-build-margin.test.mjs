// "agent_build χρεώνει 2.03x — χάνουμε χρήματα σε κάθε build."
//
// Reported: a build that really cost $0.06 was charged 14 credits, where
// 4x on Ultimate's €0.008/credit is 28. The settlement had apparently
// "seen" $0.0304 — almost exactly half. agent_run, measured the same way,
// read a healthy 4.35x.
//
// This file is the forensics. It reproduces every reported number from
// the code, identifies which of them is real, and pins the fix.
//
// THE ANSWER, up front, because the arithmetic below is the proof and not
// the summary:
//
//   The cache-token hypothesis is WRONG. priceUsage has always priced
//   cache_creation_input_tokens (1.25x) and cache_read_input_tokens
//   (0.1x), and agent_build does not use prompt caching at all — its
//   system prompt is a plain string with no cache_control anywhere. A
//   cache-pricing bug cannot be the cause of a symptom in the one feature
//   that has no cache.
//
//   What is real: ONE agent design produces TWO settlements. The
//   clarifying-questions round settles and returns questions; the user
//   answers; the resubmission is a second job with a second reservation
//   and a second settlement. Both were logged as feature "agent_build".
//   Each row is margin-guaranteed against its OWN cost — no money is lost
//   — but each row holds roughly half of what the Anthropic Console shows
//   for the interaction. Reading one row against the Console total is
//   what produces 14 credits, $0.0304, and 2.03x. All three, exactly.
//
//   agent_run reads correctly for the same reason inverted: it has no
//   clarifying-questions pre-check, so one run is one row.
//
// Run: node scripts/tests/agent-build-margin.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const { loadTs } = await import("./load-ts.mjs");
const cf = await loadTs("src/lib/billing/credit-formula.ts");
const mp = await loadTs("src/lib/billing/margin-policy.ts");
const pc = await loadTs("src/lib/billing/pricing-config.ts");
const pricing = await loadTs("src/lib/billing/model-pricing.ts");
const { CostAccumulator } = await loadTs("src/lib/billing/cost-accumulator.ts");
const { PLANS, getPlan } = await loadTs("src/lib/billing/plans.ts");

const C = pc.DEFAULTS;

// The reported figures, verbatim.
const REPORTED_TOTAL_USD = 0.06;
const REPORTED_SETTLED_USD = 0.0304;
const REPORTED_CREDITS = 14;
const REPORTED_MARGIN = 2.03;
const EXPECTED_CREDITS = 28;

/** What settlement does, end to end, for one measured cost on one plan. */
function settle(feature, slug, usd, pack = null) {
  const plan = getPlan(slug);
  const { margin } = mp.resolveMarginFor(feature, slug, C, {});
  const eur = cf.usdToEur(usd, C);
  const credits = cf.creditsForRealCostOnAccount(eur, plan, pack, C, margin);
  const rate = cf.effectiveCreditPriceEurForAccount(plan, pack, C);
  return {
    credits,
    rate,
    target: margin,
    eur,
    achieved: cf.achievedMarginOnAccount(credits, eur, plan, pack, C),
  };
}

// ---------------------------------------------------------------------------
console.log("== 1. THE HYPOTHESIS: does priceUsage ignore cache tokens? ==");
// Stated plainly so the answer is on the record: no, and it never did.
const MODEL = "claude-sonnet-4-6";
const base = pricing.priceUsage({ input_tokens: 1000, output_tokens: 500 }, MODEL).usdCost;
const withWrite = pricing.priceUsage(
  { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 100_000 },
  MODEL
).usdCost;
const withRead = pricing.priceUsage(
  { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 100_000 },
  MODEL
).usdCost;
check("cache_creation_input_tokens IS priced", withWrite > base + 1e-12);
check("cache_read_input_tokens IS priced", withRead > base + 1e-12);
check(
  "a cache write costs 1.25x a plain input token",
  Math.abs((withWrite - base) / (100_000 / 1e6) - 3 * 1.25) < 1e-9
);
check(
  "a cache read costs 0.1x a plain input token",
  Math.abs((withRead - base) / (100_000 / 1e6) - 3 * 0.1) < 1e-9
);

// And the feature under suspicion does not cache at all.
const builderSrc = readFileSync("src/lib/agents/agent-builder.ts", "utf8");
const clarificationSrc = readFileSync("src/lib/clarification.ts", "utf8");
check(
  "the agent builder's system prompt carries NO cache_control",
  !/cache_control/.test(builderSrc),
  "if this ever changes, the hypothesis becomes testable — until then it cannot be the cause"
);
check(
  "neither does the clarifying-questions pre-check",
  !/cache_control/.test(clarificationSrc)
);
check(
  "so agent_build reports zero cache tokens, and zero tokens cannot be mispriced",
  pricing.priceUsage({ input_tokens: 1000, output_tokens: 500 }, MODEL).cacheWriteTokens === 0
);

// ---------------------------------------------------------------------------
console.log("\n== 2. THE REPORTED NUMBERS, reproduced exactly ==");
// Every reported figure falls out of one assumption: the account is on a
// €0.008/credit rate (Ultimate or Enterprise) and the settlement measured
// $0.0304 rather than $0.06.
const full = settle("agent_build", "ultimate", REPORTED_TOTAL_USD);
const half = settle("agent_build", "ultimate", REPORTED_SETTLED_USD);
check(
  `€${full.rate}/credit is Ultimate's rate, the divisor in the report`,
  Math.abs(full.rate - 0.008) < 1e-9
);
check(
  `$0.06 at 4x charges ${full.credits} credits — the reported "should have been ${EXPECTED_CREDITS}"`,
  full.credits === EXPECTED_CREDITS,
  `got ${full.credits}`
);
check(
  `$0.0304 charges ${half.credits} credits — the reported charge of ${REPORTED_CREDITS}`,
  half.credits === REPORTED_CREDITS,
  `got ${half.credits}`
);
const apparent = (half.credits * half.rate) / cf.usdToEur(REPORTED_TOTAL_USD, C);
check(
  `${REPORTED_CREDITS} credits read against the FULL $0.06 gives ${apparent.toFixed(3)}x — the reported ${REPORTED_MARGIN}x`,
  Math.abs(apparent - REPORTED_MARGIN) < 0.005,
  `got ${apparent.toFixed(4)}x`
);
check(
  "…while the same charge against the cost it was actually computed from is at target",
  half.achieved >= half.target - 1e-9,
  `${half.achieved.toFixed(3)}x vs target ${half.target}x`
);
// This is the whole diagnosis in one line: 2.03x is not a margin the
// system produced, it is 4x divided by the fraction of the interaction
// that one row covers.
check(
  "2.03x is exactly 4x scaled by the half of the cost that row measured",
  Math.abs(apparent - full.target * (REPORTED_SETTLED_USD / REPORTED_TOTAL_USD)) < 0.02
);

// ---------------------------------------------------------------------------
console.log("\n== 3. THE REQUIREMENT: $0.06 must charge 28 credits at >= 4x ==");
for (const plan of PLANS) {
  const r = settle("agent_build", plan.slug, REPORTED_TOTAL_USD);
  check(
    `${plan.slug.padEnd(13)} $0.06 -> ${String(r.credits).padStart(3)} credits, ${r.achieved.toFixed(2)}x >= target ${r.target}x`,
    r.achieved >= r.target - 1e-9 && r.achieved >= 4 - 1e-9
  );
}
const ultimate = settle("agent_build", "ultimate", REPORTED_TOTAL_USD);
check("on Ultimate specifically: exactly 28 credits", ultimate.credits === 28);
check(`and the margin is >= 4x (${ultimate.achieved.toFixed(3)}x)`, ultimate.achieved >= 4 - 1e-9);
// The same requirement with a credit pack in play, which is the cheapest
// rate any account can reach.
const packed = settle("agent_build", "ultimate", REPORTED_TOTAL_USD, 100 / 8000);
check(
  `with the cheapest pack (€0.0125) it charges ${packed.credits} and still makes ${packed.achieved.toFixed(2)}x`,
  packed.achieved >= 4 - 1e-9
);

// ---------------------------------------------------------------------------
console.log("\n== 4. THE MECHANISM: one design, two settlements ==");
// Confirmed from the source, not assumed: the client resubmits after the
// user answers, which is a second POST and therefore a second job.
const workspace = readFileSync("src/components/agents/agents-workspace.tsx", "utf8");
check(
  "answering the questions calls build() again with skipClarification=true",
  /onAnswer=\{[\s\S]{0,200}build\([\s\S]{0,120},\s*true\)/.test(workspace)
);
check("so does skipping them", /onSkip=\{\(\)\s*=>\s*build\(requestText,\s*true\)/.test(workspace));
check(
  "and build() POSTs /api/agents/build, which starts a job each time",
  /fetch\("\/api\/agents\/build"/.test(workspace)
);
const route = readFileSync("src/app/api/agents/build/route.ts", "utf8");
check("each POST reserves and starts its own job", /startJob\(\{[\s\S]{0,300}kind: "agent_build"/.test(route));

// The money question: does splitting one action into two settled rows
// lose margin? It cannot — ceil() rounds each row UP — and here is the
// arithmetic for the reported split.
const roundA = settle("agent_build_precheck", "ultimate", REPORTED_TOTAL_USD - REPORTED_SETTLED_USD);
const roundB = settle("agent_build", "ultimate", REPORTED_SETTLED_USD);
const combinedRevenue = roundA.credits * roundA.rate + roundB.credits * roundB.rate;
const combinedMargin = combinedRevenue / cf.usdToEur(REPORTED_TOTAL_USD, C);
console.log(
  `        round 1 (pre-check): $${(REPORTED_TOTAL_USD - REPORTED_SETTLED_USD).toFixed(4)} -> ${roundA.credits} credits\n` +
    `        round 2 (build):     $${REPORTED_SETTLED_USD.toFixed(4)} -> ${roundB.credits} credits\n` +
    `        combined:            $${REPORTED_TOTAL_USD.toFixed(4)} -> ${roundA.credits + roundB.credits} credits = ${combinedMargin.toFixed(3)}x`
);
check(
  `the two rows together earn ${combinedMargin.toFixed(2)}x on the full cost — at or above target`,
  combinedMargin >= 4 - 1e-9,
  "if this ever fails, splitting an action really does leak margin"
);
check(
  `and together they charge ${roundA.credits + roundB.credits} credits, at least the ${EXPECTED_CREDITS} a single row would`,
  roundA.credits + roundB.credits >= EXPECTED_CREDITS
);

// ---------------------------------------------------------------------------
console.log("\n== 5. THE FIX: the two rows are no longer averaged together ==");
const handler = readFileSync("src/lib/jobs/handlers/agent-build.ts", "utf8");
check(
  "the clarification-only outcome settles as agent_build_precheck",
  /needsClarification: true[\s\S]{0,1400}feature: "agent_build_precheck"/.test(handler)
);
check(
  "the full build does NOT override the feature — it stays agent_build",
  !/built: true[\s\S]{0,600}feature:/.test(handler)
);
const runJob = readFileSync("src/lib/jobs/run-job.ts", "utf8");
check(
  "runJob honours the handler's feature override",
  /feature: handled\.feature \?\? kind/.test(runJob)
);
check(
  "and still records the job kind in metadata, so the rows can be found together",
  /metadata: \{ jobId, kind, attempts \}/.test(runJob)
);
check(
  "the create job's pre-check is split the same way",
  /feature: "create_precheck"/.test(readFileSync("src/lib/jobs/handlers/create.ts", "utf8"))
);

// The split must not weaken the guarantee: both new feature names have to
// resolve a margin >= 4 on every plan, and share their parent's env var.
check(
  "agent_build_precheck groups onto CREDIT_MARGIN_AGENT_BUILD",
  mp.FEATURE_MARGIN_GROUPS.agent_build_precheck === "CREDIT_MARGIN_AGENT_BUILD"
);
check(
  "create_precheck groups onto CREDIT_MARGIN_CREATE",
  mp.FEATURE_MARGIN_GROUPS.create_precheck === "CREDIT_MARGIN_CREATE"
);
for (const feature of ["agent_build_precheck", "create_precheck"]) {
  for (const plan of PLANS) {
    const { margin } = mp.resolveMarginFor(feature, plan.slug, C, {});
    check(`${feature} on ${plan.slug}: target ${margin}x >= 4x`, margin >= 4);
  }
}
// A pre-check round is TINY. The guarantee has to survive rounding at that
// scale too — this is where ceil() earns its place.
for (const plan of PLANS) {
  const tiny = settle("agent_build_precheck", plan.slug, 0.0003);
  check(
    `${plan.slug.padEnd(13)} a $0.0003 pre-check charges ${tiny.credits} credit(s), ${tiny.achieved.toFixed(1)}x`,
    tiny.credits >= 1 && tiny.achieved >= tiny.target - 1e-9
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 6. a REAL agent_build, end to end through the accumulator ==");
// Both calls of a full build, measured the way the code measures them,
// then settled the way settlement settles them. No harness arithmetic:
// the numbers come from priceUsage and CostAccumulator themselves.
const acc = new CostAccumulator();
acc.record("clarification", { input_tokens: 1_100, output_tokens: 90 }, MODEL);
acc.record("generation", { input_tokens: 1_400, output_tokens: 620 }, MODEL);
const totals = acc.totals();
check("both calls were recorded", acc.callCount === 2);
check("no model was priced by fallback", acc.unknownModels().length === 0);
check("no unpriced service tier", acc.unpricedServiceTiers().length === 0);
check("the measured cost is positive", totals.usdCost > 0);
const realBuild = settle("agent_build", "ultimate", totals.usdCost);
console.log(
  `        measured $${totals.usdCost.toFixed(6)} -> ${realBuild.credits} credits -> ${realBuild.achieved.toFixed(2)}x`
);
check(`a real build settles at >= 4x (${realBuild.achieved.toFixed(2)}x)`, realBuild.achieved >= 4 - 1e-9);

// Scaled up to the reported $0.06 with the SAME shape, the charge is 28.
const scale = REPORTED_TOTAL_USD / totals.usdCost;
const scaled = new CostAccumulator();
scaled.record("clarification", { input_tokens: Math.round(1_100 * scale), output_tokens: Math.round(90 * scale) }, MODEL);
scaled.record("generation", { input_tokens: Math.round(1_400 * scale), output_tokens: Math.round(620 * scale) }, MODEL);
const scaledCost = scaled.totals().usdCost;
const scaledSettle = settle("agent_build", "ultimate", scaledCost);
check(
  `a $${scaledCost.toFixed(4)} build charges ${scaledSettle.credits} credits (>= ${EXPECTED_CREDITS}) at ${scaledSettle.achieved.toFixed(2)}x`,
  scaledSettle.credits >= EXPECTED_CREDITS && scaledSettle.achieved >= 4 - 1e-9
);

// ---------------------------------------------------------------------------
console.log("\n== 7. and if agent_build ever DOES start caching ==");
// The hypothesis was wrong today. It must stay wrong: if a future change
// adds cache_control to the builder, the cache tokens have to be priced
// and the margin has to hold anyway.
const cached = new CostAccumulator();
cached.record(
  "generation",
  {
    input_tokens: 400,
    output_tokens: 620,
    cache_creation_input_tokens: 3_000,
    cache_creation: { ephemeral_5m_input_tokens: 3_000, ephemeral_1h_input_tokens: 0 },
    cache_read_input_tokens: 12_000,
  },
  MODEL
);
const cachedTotals = cached.totals();
check("cache writes reach the totals", cachedTotals.cacheWriteTokens === 3_000);
check("cache reads reach the totals", cachedTotals.cacheReadTokens === 12_000);
const cachedSettle = settle("agent_build", "ultimate", cachedTotals.usdCost);
check(
  `a cached build still settles at >= 4x (${cachedSettle.achieved.toFixed(2)}x)`,
  cachedSettle.achieved >= 4 - 1e-9
);
// The same call, one-hour cached: strictly more expensive, never less.
const oneHour = pricing.priceUsage(
  {
    input_tokens: 400,
    output_tokens: 620,
    cache_creation_input_tokens: 3_000,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 3_000 },
    cache_read_input_tokens: 12_000,
  },
  MODEL
).usdCost;
check("a 1-hour cached build costs MORE than the 5-minute one", oneHour > cachedTotals.usdCost);

// ---------------------------------------------------------------------------
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
