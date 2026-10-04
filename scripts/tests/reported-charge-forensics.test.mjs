// "It cost $0.44 and I was charged 110 credits — that's a 2.2x margin."
//
// This file exists to make that claim checkable from the code, because the
// arithmetic is the whole answer and it is not obvious.
//
// The report assumed Enterprise's rate (EUR 0.008/credit):
//     110 x 0.008 = EUR 0.88 revenue against EUR 0.40 cost = 2.2x.
//
// That multiplication is right. The premise is not: on Enterprise (as
// priced then — every rate in this file is the reported-era one), a $0.44
// generation was charged 203 credits, not 110. 110 credits for $0.44 was
// produced by exactly one plan in the product — Growth — and at Growth's
// own rate (EUR 0.0166.../credit, 4.5x) it achieves 4.53x, which is ABOVE
// target rather than half of it.
//
// So the number is either correct (the account is Growth) or the 110 was
// never the settled charge (on Enterprise, 110 is close to the ESTIMATE
// the UI shows before pressing generate — ~112 for a short description).
// The SQL to tell the two apart is in the answer accompanying this change;
// what this test pins is the arithmetic that makes the question decidable.
//
// Run: node scripts/tests/reported-charge-forensics.test.mjs
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
const est = await loadTs("src/lib/billing/estimate.ts");
const { PLANS, getPlan } = await loadTs("src/lib/billing/plans.ts");

const config = pc.DEFAULTS;
const REPORTED_USD = 0.44;
const REPORTED_CREDITS = 110;
// The cheapest published €/credit at the time the 110 was reported —
// before annual billing existed, so before there was a cheaper rate than
// monthly Ultimate. Kept as a named constant because the assertion below
// derives from it rather than restating a number that has since moved.
const MONTHLY_ERA_RATE = 0.008;
const eur = cf.usdToEur(REPORTED_USD, config);

// THE POLICY THE REPORT WAS FILED UNDER.
//
// Every figure in the diagnosis — 110 credits, 203 on Enterprise, "exactly
// one plan matches" — is arithmetic on these six multipliers. They are the
// per-plan defaults as they stood then, pinned as data rather than read
// from PLAN_MARGIN_DEFAULTS, because this file reproduces a past event and
// a past event does not change when policy does.
//
// The combined-ceiling change has since moved every paid plan to 5, so
// that the credit subsystem takes 20% of revenue rather than 25% and the
// free quotas registered in lib/billing/free-allowances.ts have a budget
// at all. Reading the live margins here made a correct policy change look
// like a regression in forensics that were, and remain, correct.
const INCIDENT_PLAN_MARGINS = {
  free: 6,
  starter: 5,
  growth: 4.5,
  professional: 4,
  ultimate: 4,
  enterprise: 4,
};

// THE PRICE OF A CREDIT ON EACH PLAN WHEN THE REPORT WAS FILED — before
// annual billing, and before 2026-10-03 made a credit one size (EUR 0.02)
// on every plan. Frozen as data for the same reason as the margins above:
// every reported figure is arithmetic on these rates, and none of them
// reproduces on today's. Enterprise was priced at the cheapest monthly
// rate then on sale, Ultimate's.
const INCIDENT_PLAN_RATES = {
  free: 0.02,
  starter: 20 / 1000,
  growth: 50 / 3000,
  professional: 100 / 10_000,
  ultimate: MONTHLY_ERA_RATE,
  enterprise: MONTHLY_ERA_RATE,
};

function chargeAt(slug, margin, rate) {
  const credits = cf.creditsForRealCostOnRate(eur, rate, config, margin);
  return { credits, achieved: (credits * rate) / eur, margin, rate, revenueEur: credits * rate };
}

/** The charge as it was when the report was filed. */
function chargeThen(slug) {
  return chargeAt(slug, INCIDENT_PLAN_MARGINS[slug], INCIDENT_PLAN_RATES[slug]);
}

/** The charge under the policy that is live right now. */
function chargeOn(slug) {
  const plan = getPlan(slug);
  const margin = mp.resolveMarginFor("website_generate", slug, config, {}).margin;
  const credits = cf.creditsForRealCostOnAccount(eur, plan, null, config, margin);
  const rate = cf.effectiveCreditPriceEurForAccount(plan, null, config);
  return {
    credits,
    achieved: cf.achievedMarginOnAccount(credits, eur, plan, null, config),
    margin,
    rate,
    revenueEur: credits * rate,
  };
}

console.log(`== the reported figures: $${REPORTED_USD} -> €${eur.toFixed(4)} ==`);
check("the USD->EUR rate is the documented 0.92", config.usdToEurRate === 0.92);

console.log("\n== 1. 110 credits is NOT what Enterprise would have charged ==");
const ent = chargeThen("enterprise");
check(`Enterprise charges ${ent.credits}, not ${REPORTED_CREDITS}`, ent.credits !== REPORTED_CREDITS);
// Enterprise was priced at the cheapest rate any published plan sold at,
// because its own negotiated rate was unknowable: Ultimate monthly, EUR
// 0.008. (Annual billing later moved that floor, and since 2026-10-03
// Enterprise prices at the EUR 0.02 list like every plan — section 3.)
const PRE_ANNUAL_CREDITS = 203;
check(`at the reported-era floor, Ultimate monthly — €${ent.rate}/credit`, ent.rate === MONTHLY_ERA_RATE);
check(`Enterprise charged ${PRE_ANNUAL_CREDITS} for it`, ent.credits === PRE_ANNUAL_CREDITS, `got ${ent.credits}`);
check("achieving at least 4x", ent.achieved >= 4);
check(
  "so the reported 2.2x mixes Growth's charge with Enterprise's rate",
  Math.abs((REPORTED_CREDITS * 0.008) / eur - 2.174) < 0.01
);

console.log("\n== 2. exactly one plan produces 110 credits for $0.44 ==");
const matches = PLANS.filter((p) => chargeThen(p.slug).credits === REPORTED_CREDITS).map((p) => p.slug);
check(`only one plan matches (${matches.join(", ") || "none"})`, matches.length === 1);
check("and it is Growth", matches[0] === "growth");
const growth = chargeThen("growth");
check("Growth's rate was €50/3000 = €0.01667", Math.abs(growth.rate - 50 / 3000) < 1e-9);
check("Growth's margin target was 4.5x at the time of the report", growth.margin === 4.5);
check(
  `the achieved margin is above target, not 2.2x (${growth.achieved.toFixed(3)}x)`,
  growth.achieved >= 4.5
);

// The property that survives any future policy edit: whatever the numbers
// become, no plan may ever bring in LESS for this cost than it did when
// the report was filed. That is the guarantee the hardcoded 110/203 were
// standing in for. It is measured in EUROS, not credits: since 2026-10-03
// a credit is one size, and a count of credits compared across a change
// of size compares nothing (Ultimate's 203 then is 102 now, and the 102
// are worth more).
for (const plan of PLANS) {
  const then = chargeThen(plan.slug);
  const now = chargeOn(plan.slug);
  check(
    `${plan.slug.padEnd(13)} still brings in at least the reported-era amount (€${now.revenueEur.toFixed(3)} >= €${then.revenueEur.toFixed(3)})`,
    now.revenueEur >= then.revenueEur - 1e-9,
    `now ${now.credits} x €${now.rate} at ${now.margin}x, then ${then.credits} x €${then.rate} at ${then.margin}x`
  );
}

console.log("\n== 3. the guarantee holds on every plan for this cost ==");
for (const plan of PLANS) {
  const r = chargeOn(plan.slug);
  check(
    `${plan.slug}: ${r.credits} credits, ${r.achieved.toFixed(3)}x >= target ${r.margin}x`,
    r.achieved >= r.margin - 1e-9
  );
}

console.log("\n== 4. why 110 could ALSO be an estimate rather than a charge ==");
// On Enterprise the pre-generation estimate for a short description lands
// near 110 — which is the other way the reported pair can arise, and the
// reason the answer asks for the FINAL website_generate row rather than
// whatever number was on screen.
// Priced at the reported-era multiplier for the same reason as above: the
// question is what the UI showed that user, on that day.
const entEstimate = est.estimateForAction(
  "websiteGenerate",
  { model: "claude-sonnet-4-6", inputChars: 200, imageCount: 0, planSlug: "enterprise" },
  config,
  ent.rate,
  INCIDENT_PLAN_MARGINS.enterprise
);
// The estimate tracks the same rate, so it moved with it. The point this
// assertion carries is unchanged: on Enterprise the pre-generation
// ESTIMATE lands in the same neighbourhood as the reported 110, which is
// the other way the reported pair can arise — and why the answer asks for
// the settled website_generate row rather than whatever was on screen.
// THE ANCHOR MOVED, AND IT MOVED FOR A REASON WORTH WRITING DOWN.
//
// This read `Math.abs(estimate - 110) <= 15` and went red at 140 when
// annual billing landed. The number is not drifting: the cheapest
// PUBLISHED rate a customer can buy is now annual Ultimate at
// €0.0064/credit, 20% below the €0.008 monthly rate this assertion was
// written against. A credit worth 20% less money buys 20% less Anthropic
// cost, so the same generation has to cost proportionally MORE credits.
//
// 110 / 0.8 = 137.5, and the estimate rounds to 140 — a 2.5-credit
// rounding difference, not a regression.
//
// The branch this merges widened the window to "between 110 and 220"
// instead. That accepts a silent 2x drift in a number shown to a customer
// before they buy, which is the opposite of what this file is for. It is
// re-anchored on the DERIVATION rather than a constant, so it stays tight
// and follows ANNUAL_DISCOUNT_PERCENT if that ever changes.
// THE ANCHOR MOVED A SECOND TIME, AND FOR A SECOND REASON WORTH WRITING
// DOWN. It went red at 177 when websiteGenerate's continuationRounds was
// corrected from 2 to 4.
//
// Two was never right. lib/website-builder.ts has always had
// MAX_CONTINUATION_ROUNDS = 4 and a loop that runs `round <= MAX`, so one
// initial call plus up to four continuations — and estimate.ts carried a
// comment asserting the constant was 2, which is how the two stayed out of
// step. The hold was 26-32% short of what a full-length generation can
// cost, on every plan; the fix raises what is RESERVED, not what is
// charged, and the estimate the user is shown moves with it.
//
// So the derivation gains a second factor, computed from the estimator
// itself rather than typed in as a number, for the same reason the rate
// factor is: an anchor that has to be hand-updated is one somebody widens
// instead. Two rounds is what the incident-era estimate used; whatever
// ACTION_PROFILES.websiteGenerate says today is what it uses now.
const roundsEraEstimate = est.estimateActionCost(
  {
    model: "claude-sonnet-4-6",
    inputChars: 200,
    systemPromptTokens: est.ACTION_PROFILES.websiteGenerate.systemPromptTokens,
    auxiliaryCalls: [...est.ACTION_PROFILES.websiteGenerate.auxiliaryCalls],
    expectedOutputChars:
      est.ACTION_PROFILES.websiteGenerate.baseOutputChars +
      200 * est.ACTION_PROFILES.websiteGenerate.outputCharsPerInputChar,
    continuationRounds: 2,
  },
  config,
  ent.rate,
  INCIDENT_PLAN_MARGINS.enterprise
);
const roundsRatio = entEstimate.estimatedCredits / roundsEraEstimate.estimatedCredits;
check(
  `the continuation-round correction is what moved it (x${roundsRatio.toFixed(3)})`,
  roundsRatio > 1,
  "four continuation rounds must estimate above two"
);
// At the reported-era rate the only thing that has moved the estimate
// since is the continuation-round correction. (The intermediate re-anchor
// to the cheapest ANNUAL rate is gone with it: Enterprise no longer tracks
// that rate — a credit is one size since 2026-10-03.)
const expectedCredits = REPORTED_CREDITS * roundsRatio;
check(
  `the Enterprise estimate at the reported-era rate: ${REPORTED_CREDITS} x${roundsRatio.toFixed(3)} = ${expectedCredits.toFixed(1)}, got ${entEstimate.estimatedCredits}`,
  Math.abs(entEstimate.estimatedCredits - expectedCredits) <= 5,
  `got ${entEstimate.estimatedCredits}, expected ${expectedCredits.toFixed(1)} +/- 5`
);
check("but it is an estimate, not a charge — it is bigger than itself only via the buffer", entEstimate.reserveCredits > entEstimate.estimatedCredits);

console.log("\n== 5. web searches are inside the cost the margin is taken on ==");
// The research fix raises searches from 3 to 8 per generation. They are
// billed by Anthropic per search and must reach the same formula, or the
// margin silently erodes as research gets more aggressive.
const withoutSearch = est.estimateForAction(
  "websiteGenerate",
  { model: "claude-sonnet-4-6", inputChars: 800, expectedWebSearches: 0, planSlug: "growth" },
  config,
  growth.rate
);
const withSearch = est.estimateForAction(
  "websiteGenerate",
  { model: "claude-sonnet-4-6", inputChars: 800, expectedWebSearches: 8, planSlug: "growth" },
  config,
  growth.rate
);
check("searching costs more than not searching", withSearch.estimatedUsd > withoutSearch.estimatedUsd);
check(
  "and the difference is 8 x $0.01",
  Math.abs(withSearch.estimatedUsd - withoutSearch.estimatedUsd - 0.08) < 1e-6
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
