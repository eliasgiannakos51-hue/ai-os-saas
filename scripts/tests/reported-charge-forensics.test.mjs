// "It cost $0.44 and I was charged 110 credits — that's a 2.2x margin."
//
// This file exists to make that claim checkable from the code, because the
// arithmetic is the whole answer and it is not obvious.
//
// The report assumed Enterprise's rate (EUR 0.008/credit):
//     110 x 0.008 = EUR 0.88 revenue against EUR 0.40 cost = 2.2x.
//
// That multiplication is right. The premise is not: on Enterprise, a $0.44
// generation is charged 203 credits, not 110. 110 credits for $0.44 is
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

function chargeAt(slug, margin) {
  const plan = getPlan(slug);
  const credits = cf.creditsForRealCostOnAccount(eur, plan, null, config, margin);
  const achieved = cf.achievedMarginOnAccount(credits, eur, plan, null, config);
  return { credits, achieved, margin, rate: cf.effectiveCreditPriceEur(plan, config) };
}

/** The charge as it was when the report was filed. */
function chargeThen(slug) {
  return chargeAt(slug, INCIDENT_PLAN_MARGINS[slug]);
}

/** The charge under the policy that is live right now. */
function chargeOn(slug) {
  return chargeAt(slug, mp.resolveMarginFor("website_generate", slug, config, {}).margin);
}

console.log(`== the reported figures: $${REPORTED_USD} -> €${eur.toFixed(4)} ==`);
check("the USD->EUR rate is the documented 0.92", config.usdToEurRate === 0.92);

console.log("\n== 1. 110 credits is NOT what Enterprise would have charged ==");
const ent = chargeThen("enterprise");
check(`Enterprise charges ${ent.credits}, not ${REPORTED_CREDITS}`, ent.credits !== REPORTED_CREDITS);
// Enterprise is priced at the cheapest rate any published plan sells at,
// because its own negotiated rate is unknowable and under-guessing it is
// the only unsafe direction. That rate was Ultimate monthly (EUR 0.008)
// when this file was written; annual billing made it Ultimate annual
// (EUR 1,920 / 300,000 = EUR 0.0064), so the charge went UP. Asserted
// against the derived rate rather than a fresh literal, so the next
// cheaper option updates this by construction — what is pinned is that
// Enterprise tracks the floor and never charges less than it used to.
const cheapestRate = cf.cheapestPublishedCreditPriceEur(config);
const plansMod = await loadTs("src/lib/billing/plans.ts");
// THE COMMENT ABOVE SAID "asserted against the derived rate rather than a
// fresh literal" and the two lines under it were both fresh literals —
// 253 credits and €0.0064/credit, each true only while the annual
// discount was 20%. Changing that discount to two-months-free (16.67%)
// moved the floor to €0.006667 and the charge to 243, and both assertions
// went red for a change that was correct. They are derived now, so the
// comment is true and the next change to the cheapest rate updates them
// by construction.
const PRE_ANNUAL_CREDITS = 203;
const PRE_ANNUAL_RATE = MONTHLY_ERA_RATE; // Ultimate MONTHLY — the floor before annual existed
check("at the cheapest published rate", Math.abs(ent.rate - cheapestRate) < 1e-9);
check(
  `the floor is Ultimate ANNUAL — €${ent.rate.toFixed(6)}/credit`,
  Math.abs(ent.rate - PRE_ANNUAL_RATE * (plansMod.ANNUAL_MONTHS_CHARGED / 12)) < 1e-9
);
// The charge scales inversely with the floor: a credit worth less money
// buys less Anthropic cost, so the same generation needs more of them.
check(
  `Enterprise charges ${ent.credits}, which is ${PRE_ANNUAL_CREDITS} scaled by the floor`,
  Math.abs(ent.credits - PRE_ANNUAL_CREDITS * (PRE_ANNUAL_RATE / ent.rate)) <= 1
);
check(`never fewer than the ${PRE_ANNUAL_CREDITS} it charged before annual existed`, ent.credits >= PRE_ANNUAL_CREDITS);
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
check("Growth's rate is €50/3000 = €0.01667", Math.abs(growth.rate - 50 / 3000) < 1e-9);
check("Growth's margin target was 4.5x at the time of the report", growth.margin === 4.5);
check(
  `the achieved margin is above target, not 2.2x (${growth.achieved.toFixed(3)}x)`,
  growth.achieved >= 4.5
);

// The property that survives any future policy edit: whatever the numbers
// become, no plan may ever charge LESS than it did when the report was
// filed. That is the guarantee the hardcoded 110/203 were standing in for,
// and unlike them it cannot be invalidated by a legitimate change.
for (const plan of PLANS) {
  const then = chargeThen(plan.slug);
  const now = chargeOn(plan.slug);
  check(
    `${plan.slug.padEnd(13)} still charges at least the reported-era amount (${now.credits} >= ${then.credits})`,
    now.credits >= then.credits,
    `now ${now.credits} at ${now.margin}x, then ${then.credits} at ${then.margin}x`
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
const cheapestRatio = ent.rate / MONTHLY_ERA_RATE;
const expectedCredits = REPORTED_CREDITS / cheapestRatio;
check(
  `the Enterprise estimate tracks the cheapest rate: ${REPORTED_CREDITS} at €${MONTHLY_ERA_RATE} -> ${expectedCredits.toFixed(1)} at €${ent.rate}, got ${entEstimate.estimatedCredits}`,
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
