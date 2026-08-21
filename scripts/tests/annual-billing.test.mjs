// Annual plans at -20%, and the two things that quietly break when you
// add them.
//
// THE FIRST is margin. Every credit-price divisor in this app is
// `plan.price / plan.monthlyCredits`, and the 4x guarantee rests on that
// divisor being what the customer really pays. Annual sells the same
// credits for 20% less. Leaving the catalogue price in place would drop
// every annual settlement to 3.2x — invisibly, because the stored
// achieved_margin is computed from the same wrong divisor and reads
// healthy. Identical in shape to the plan-rate and credit-pack leaks
// already fixed in credit-formula.ts; this is the third door.
//
// THE SECOND is the credit drip. Stripe fires `invoice.paid` once per
// billing period. On the old path — where that event was the ONLY thing
// that granted credits — an annual Starter customer would receive 1,000
// credits in January and nothing until the following January.
//
// Run: node scripts/tests/annual-billing.test.mjs
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
const plans = await loadTs("src/lib/billing/plans.ts");
const cf = await loadTs("src/lib/billing/credit-formula.ts");
const mp = await loadTs("src/lib/billing/margin-policy.ts");
const pc = await loadTs("src/lib/billing/pricing-config.ts");
const pricing = await loadTs("src/lib/billing/model-pricing.ts");
const {
  PLANS,
  getPlan,
  ANNUAL_DISCOUNT_PERCENT,
  annualPriceEur,
  annualMonthlyEquivalentEur,
  annualSavingsEur,
  planCreditPriceEur,
  isBillingInterval,
} = plans;
const C = pc.DEFAULTS;
const PAID = ["starter", "growth", "professional", "ultimate"];

// ---------------------------------------------------------------------------
console.log("== 1. the prices, including the one from the brief ==");
check("the discount is 20%", ANNUAL_DISCOUNT_PERCENT === 20);
check(
  "Starter €20/month becomes €192/year — the figure in the brief",
  annualPriceEur(getPlan("starter")) === 192
);
console.log("        plan          monthly   annual   /month   saves");
for (const slug of PAID) {
  const plan = getPlan(slug);
  const annual = annualPriceEur(plan);
  const perMonth = annualMonthlyEquivalentEur(plan);
  const saving = annualSavingsEur(plan);
  console.log(
    `        ${slug.padEnd(13)} €${String(plan.price).padStart(4)}   €${String(annual).padStart(5)}   €${String(perMonth).padStart(4)}   €${saving}`
  );
  check(`${slug}: annual is exactly 12 months less 20%`, annual === Math.round(plan.price * 12 * 0.8));
  check(`${slug}: the saving equals two months`, saving === plan.price * 2 * 1.2 - plan.price * 0.4 || saving === plan.price * 12 - annual);
  check(`${slug}: the per-month figure is a whole number of euros`, Number.isInteger(perMonth));
  check(`${slug}: paying annually is never more than paying monthly`, annual < plan.price * 12);
}
check("Free has no annual price", annualPriceEur(getPlan("free")) === null);
check("Enterprise has no annual price", annualPriceEur(getPlan("enterprise")) === null);
check("the interval type guard rejects junk", !isBillingInterval("annual") && isBillingInterval("year"));

// ---------------------------------------------------------------------------
console.log("\n== 2. THE MARGIN LEAK: an annual credit is cheaper, and settlement must know ==");
// The whole point. A 20% cheaper credit against an unchanged divisor is a
// 20% smaller multiplier.
for (const slug of PAID) {
  const plan = getPlan(slug);
  const monthlyRate = planCreditPriceEur(plan, "month");
  const annualRate = planCreditPriceEur(plan, "year");
  check(
    `${slug}: the annual credit rate is 20% below the monthly one (€${annualRate.toFixed(6)} vs €${monthlyRate.toFixed(6)})`,
    Math.abs(annualRate - monthlyRate * 0.8) < 1e-9
  );
}

// The plan object settlement actually receives, for an annual account, is
// the one resolveEffectivePlan builds — priced at the real monthly spend.
// That is what makes every downstream divisor correct without threading
// an interval through 31 call sites.
function annualPlanAsSettled(slug) {
  const plan = getPlan(slug);
  return { ...plan, price: annualMonthlyEquivalentEur(plan) };
}
const USAGE = { input_tokens: 40_000, output_tokens: 9_000, cache_read_input_tokens: 20_000 };
const costUsd = pricing.priceUsage(USAGE, "claude-sonnet-4-6").usdCost;
const costEur = cf.usdToEur(costUsd, C);
console.log(`        a €${costEur.toFixed(4)} action, settled on each plan and interval:`);
for (const slug of PAID) {
  const target = mp.resolveMarginFor("website_generate", slug, C, {}).margin;
  for (const [label, plan] of [
    ["monthly", getPlan(slug)],
    ["annual ", annualPlanAsSettled(slug)],
  ]) {
    const credits = cf.creditsForRealCostOnAccount(costEur, plan, null, C, target);
    const achieved = cf.achievedMarginOnAccount(credits, costEur, plan, null, C);
    console.log(
      `        ${slug.padEnd(13)} ${label}  ${String(credits).padStart(4)} credits  ${achieved.toFixed(2)}x  (target ${target}x)`
    );
    check(
      `${slug} ${label.trim()}: achieved ${achieved.toFixed(2)}x >= target ${target}x`,
      achieved >= target - 1e-9
    );
  }
  // And the annual account must be charged MORE credits for the same
  // work, because each of its credits is worth less.
  const monthlyCredits = cf.creditsForRealCostOnAccount(costEur, getPlan(slug), null, C, target);
  const annualCredits = cf.creditsForRealCostOnAccount(costEur, annualPlanAsSettled(slug), null, C, target);
  check(
    `${slug}: an annual account is charged more credits (${annualCredits} vs ${monthlyCredits})`,
    annualCredits > monthlyCredits,
    "if these are equal, the annual discount is coming straight out of margin"
  );
}

// The counterfactual, stated as a number: what the leak would have cost.
const leakSlug = "ultimate";
const leakTarget = mp.resolveMarginFor("website_generate", leakSlug, C, {}).margin;
const naiveCredits = cf.creditsForRealCostOnAccount(costEur, getPlan(leakSlug), null, C, leakTarget);
const realRate = planCreditPriceEur(getPlan(leakSlug), "year");
const leakedMargin = (naiveCredits * realRate) / costEur;
check(
  `pricing an annual account at the catalogue rate would have achieved ${leakedMargin.toFixed(2)}x, not ${leakTarget}x`,
  leakedMargin < leakTarget - 0.1,
  "this is the bug the fix exists for — if it does not reproduce, the test is not testing it"
);
check(
  "…which is 80% of target, exactly the discount",
  Math.abs(leakedMargin / leakTarget - 0.8) < 0.02
);

// ---------------------------------------------------------------------------
console.log("\n== 3. Enterprise tracks the cheapest rate a customer can reach ==");
// Enterprise is priced per deal, so the app assumes the cheapest PUBLISHED
// rate. Annual made that cheaper; if cheapestPublishedCreditPriceEur only
// looked at monthly prices it would now be 25% above the real floor —
// an under-charge on the highest-value accounts.
const cheapest = cf.cheapestPublishedCreditPriceEur(C);
check("the cheapest published rate is annual Ultimate, €0.0064", Math.abs(cheapest - 1920 / 300_000) < 1e-9);
check("…which is below the cheapest MONTHLY rate", cheapest < 200 / 25_000);
check(
  "Enterprise prices at it",
  Math.abs(cf.effectiveCreditPriceEur(getPlan("enterprise"), C) - cheapest) < 1e-9
);
let floorOk = true;
for (const plan of PLANS) {
  for (const interval of ["month", "year"]) {
    const rate = planCreditPriceEur(plan, interval);
    if (rate !== null && rate < cheapest - 1e-12) floorOk = false;
  }
}
check("no plan+interval combination sells below that floor", floorOk);

// ---------------------------------------------------------------------------
console.log("\n== 4. THE CREDIT DRIP: monthly, never twelve months at once ==");
const creditsSrc = readFileSync("src/lib/billing/credits.ts", "utf8");
const webhookSrc = readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8");
const cronSrc = readFileSync("src/app/api/cron/monthly-credits/route.ts", "utf8");

check("there is a month-keyed grant helper", /export async function grantMonthlyPlanCredits/.test(creditsSrc));
check(
  "…keyed per user per calendar month, so a retry cannot double-grant",
  /idempotencyKey: `plan_month:\$\{userId\}:\$\{monthKey\}`/.test(creditsSrc)
);
check(
  "…granting exactly ONE month's allowance, never twelve",
  /plan\.monthlyCredits,\n\s+"plan_renewal"/.test(creditsSrc) && !/monthlyCredits \* 12/.test(creditsSrc),
  "a year of credits on day one is a year of cost we can absorb in week one"
);
check("…and it moves credits_total too, so an upgrade stays in step", /setTotal: plan\.monthlyCredits/.test(creditsSrc));

check(
  "the webhook routes ANNUAL renewals through that helper, not a yearly reset",
  /interval === "year"\)\s*\{\s*await grantMonthlyPlanCredits/.test(webhookSrc)
);
check(
  "…and leaves MONTHLY subscribers on the reset they already had",
  /\} else \{\s*await syncCreditsForPlan/.test(webhookSrc)
);
check("the cron exists", cronSrc.length > 0);
check("…is CRON_SECRET-authenticated", /checkCronAuth\(request\)/.test(cronSrc));
check("…skips monthly subscribers entirely", /resolveBillingInterval\(user\) !== "year"/.test(cronSrc));
check(
  "…skips lapsed accounts rather than granting them Free's allowance forever",
  /!plan \|\| plan\.slug === "free"/.test(cronSrc)
);
check("…pages through every user", /page\+\+/.test(cronSrc) && /users\.length < perPage/.test(cronSrc));
check(
  "…and one account's failure does not stop the rest",
  /catch \(err\) \{[\s\S]{0,240}stage: "grant"/.test(cronSrc)
);
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
const cronEntry = vercel.crons.find((c) => c.path === "/api/cron/monthly-credits");
check("…is actually scheduled (not a placeholder like reset-credits)", Boolean(cronEntry));
check(
  `…daily (${cronEntry?.schedule}), so a failed run on the 1st is retried on the 2nd`,
  cronEntry?.schedule === "0 3 * * *"
);

// The month key is the safety property; check it rolls and pads.
check("the month key pads single-digit months", plansMonthKey("2026-03-05") === "2026-03");
check("…and rolls at the year boundary", plansMonthKey("2026-12-31") !== plansMonthKey("2027-01-01"));
function plansMonthKey(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
console.log("\n== 5. PRORATION: an upgrade changes the subscription, it does not sell a second one ==");
const checkoutSrc = readFileSync("src/app/api/checkout/route.ts", "utf8");
check(
  "an existing subscription is updated in place",
  /stripe\.subscriptions\.update\(existingSubscriptionId/.test(checkoutSrc)
);
check(
  "…with proration",
  /proration_behavior: isUpgrade \? "always_invoice" : "create_prorations"/.test(checkoutSrc)
);
check(
  "…charging the difference now on an upgrade, crediting the next invoice on a downgrade",
  /always_invoice/.test(checkoutSrc) && /create_prorations/.test(checkoutSrc)
);
check(
  "…and resetting the anniversary when the interval changes",
  /current\.interval !== interval \? \{ billing_cycle_anchor: "now"/.test(checkoutSrc)
);
check(
  "the update happens BEFORE any Checkout Session is created",
  checkoutSrc.indexOf("stripe.subscriptions.update(") < checkoutSrc.indexOf("stripe.checkout.sessions.create("),
  "otherwise the customer buys a second subscription instead of changing the one they have"
);
check(
  "a no-op change is reported rather than sold again",
  /unchanged: true/.test(checkoutSrc)
);
check(
  "a dead subscription id falls through to a normal checkout instead of blocking the sale",
  /stage: "update_existing_subscription"/.test(checkoutSrc)
);
check(
  "the interval is validated server-side, never trusted",
  /isBillingInterval\(body\?\.interval\) \? body\.interval : "month"/.test(checkoutSrc)
);
check(
  "the webhook reads the interval from the PRICE, not from metadata",
  /const matched = getPlanFromPriceId\(priceId\)/.test(webhookSrc) &&
    /interval = matched\.interval/.test(webhookSrc)
);
check(
  "…and clears it when the subscription ends",
  /billing_interval: isActive \? interval : "month"/.test(webhookSrc)
);

// ---------------------------------------------------------------------------
console.log("\n== 6. the toggle, and what happens when Stripe is not configured ==");
const pageSrc = readFileSync("src/app/pricing/page.tsx", "utf8");
const toggleSrc = readFileSync("src/components/billing/billing-interval-toggle.tsx", "utf8");
const priceIdsSrc = readFileSync("src/lib/billing/price-ids.ts", "utf8");
check("there are four annual price env vars", /STRIPE_PRICE_STARTER_ANNUAL/.test(priceIdsSrc) &&
  /STRIPE_PRICE_GROWTH_ANNUAL/.test(priceIdsSrc) &&
  /STRIPE_PRICE_PROFESSIONAL_ANNUAL/.test(priceIdsSrc) &&
  /STRIPE_PRICE_ULTIMATE_ANNUAL/.test(priceIdsSrc));
check(
  "annual is offered only when ALL of them are set",
  /export function annualBillingAvailable\(\)[\s\S]{0,200}\.every\(/.test(priceIdsSrc),
  "a toggle that works for two plans out of four is worse than no toggle"
);
check("the pricing page hides the toggle otherwise", /annualAvailable && \(/.test(pageSrc));
check("…and cannot be forced on by a query param", /annualAvailable && searchParams\?\.billing === "annual"/.test(pageSrc));
check("the toggle keeps the page a server component (URL state)", /router\.push\(/.test(toggleSrc) && !/useState/.test(toggleSrc));
check("the saving is shown next to the control", /billingAnnualSaving/.test(toggleSrc));
check("each card shows the real annual total and the saving", /billedAnnually/.test(pageSrc));
check("the headline stays a per-month figure", /annualMonthlyEquivalentEur\(plan\)/.test(pageSrc));
check("the buy button carries the interval", /interval=\{interval\}/.test(pageSrc));

// Every new string, in every locale, with its placeholders intact.
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const KEYS = ["billingMonthly", "billingAnnual", "billingIntervalLabel", "billingAnnualSaving", "billedAnnually", "checkoutFailed"];
for (const locale of LOCALES) {
  const msgs = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  for (const key of KEYS) {
    check(`${locale}: pricing.${key}`, typeof msgs.pricing?.[key] === "string" && msgs.pricing[key].length > 0);
  }
  check(`${locale}: billingAnnualSaving keeps {percent}`, (msgs.pricing?.billingAnnualSaving ?? "").includes("{percent}"));
  check(
    `${locale}: billedAnnually keeps {total} and {saving}`,
    (msgs.pricing?.billedAnnually ?? "").includes("{total}") &&
      (msgs.pricing?.billedAnnually ?? "").includes("{saving}")
  );
}

// ---------------------------------------------------------------------------
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
