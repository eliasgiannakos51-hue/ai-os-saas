import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";
import { PLANS } from "@/lib/billing/plans";

// THE formula. Everything the app charges for an AI action goes through
// here, so the margin guarantee is a property of one function rather than
// something each feature has to remember.
//
//   credits = ceil((real_cost_eur * marginMultiplier) / creditPriceEur)
//
// Why the guarantee actually holds:
//   revenue_eur = credits * creditPriceEur
//               = ceil(real_eur * M / P) * P
//               >= (real_eur * M / P) * P            [ceil(x) >= x]
//               = real_eur * M
//   => revenue / real_cost >= M, for every input, with no upper bound on
//   cost. Rounding UP is load-bearing: with floor or round-to-nearest, a
//   cheap action could round down below the multiplier.
//
// The one boundary case is real_eur = 0 (a call that never reached the
// API). That charges 0 credits — correct, since there is no cost to make
// margin on, and charging for nothing would be wrong.
// Every credits-computing function below takes an optional
// `marginMultiplier` — the per-feature/per-plan resolved margin from
// lib/billing/margin-policy.ts. Omitted, they use the general configured
// multiplier, which is exactly what resolveMarginFor returns when no
// override applies.
export function creditsForRealCostEur(
  realCostEur: number,
  config?: PricingConfig,
  marginMultiplier?: number
): number {
  const c = config ?? resolvePricingConfig();
  if (!Number.isFinite(realCostEur) || realCostEur <= 0) return 0;
  return Math.ceil((realCostEur * (marginMultiplier ?? c.marginMultiplier)) / c.creditPriceEur);
}

export function usdToEur(usd: number, config?: PricingConfig): number {
  const c = config ?? resolvePricingConfig();
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return usd * c.usdToEurRate;
}

export function creditsForRealCostUsd(realCostUsd: number, config?: PricingConfig): number {
  const c = config ?? resolvePricingConfig();
  return creditsForRealCostEur(usdToEur(realCostUsd, c), c);
}

/**
 * What the user was actually charged, divided by what the action really
 * cost. Logged next to every action so the configured margin can be
 * checked against reality instead of assumed.
 *
 * Returns null when the real cost is zero — the ratio is undefined there,
 * and reporting it as Infinity (or as 0) would poison any average.
 */
export function achievedMargin(
  creditsCharged: number,
  realCostEur: number,
  config?: PricingConfig
): number | null {
  const c = config ?? resolvePricingConfig();
  if (!Number.isFinite(realCostEur) || realCostEur <= 0) return null;
  return (creditsCharged * c.creditPriceEur) / realCostEur;
}

/**
 * The amount to hold before an action runs: the estimate plus a buffer,
 * so a slightly-more-expensive-than-expected run can still settle without
 * the user going negative. The buffer is released at settlement — it is a
 * hold, never a charge.
 */
export function reserveAmount(estimatedCredits: number, config?: PricingConfig): number {
  const c = config ?? resolvePricingConfig();
  if (!Number.isFinite(estimatedCredits) || estimatedCredits <= 0) return 0;
  return Math.ceil(estimatedCredits * (1 + c.reserveBufferPercent / 100));
}

export function needsLargeActionConfirmation(
  estimatedCredits: number,
  config?: PricingConfig
): boolean {
  const c = config ?? resolvePricingConfig();
  return estimatedCredits > c.largeActionConfirmThreshold;
}

// ---------------------------------------------------------------------
// Plan-aware pricing — the part that makes the guarantee hold on REVENUE
// rather than on a nominal credit price.
// ---------------------------------------------------------------------
//
// CREDIT_PRICE_EUR (€0.02) is the a-la-carte price of a credit. Every
// paid plan sells them for less than that in bulk:
//
//   Starter        1,000 credits / €20   = €0.0200 per credit
//   Growth         3,000 credits / €50   = €0.0167 per credit
//   Professional  10,000 credits / €100  = €0.0100 per credit
//   Ultimate      25,000 credits / €200  = €0.0080 per credit
//
// Charging `cost x M / 0.02` therefore guarantees 4x against the LIST
// price, not against what the customer actually paid. On Ultimate the
// real multiple collapses to 4 x (0.008 / 0.02) = 1.6x — and a user who
// burns their whole allowance on the most expensive action costs 62.5%
// of what they paid. Verified: the plan table before this change showed
// Growth 30%, Professional 50%, Ultimate 62.5% against a 25% ceiling.
//
// The fix is to divide by what a credit is actually WORTH on the user's
// plan. Credits charged then scale up on discounted plans by exactly the
// discount, restoring M on real revenue without changing a single

/**
 * The cheapest euro-per-credit any PUBLISHED plan sells at.
 *
 * Used as the assumption for a plan whose own rate is unknowable
 * (Enterprise, priced per deal). Derived from PLANS rather than written
 * as a constant so adding a cheaper tier cannot silently leave this
 * behind — the value it guards is exactly "the lowest rate that exists".
 */
export function cheapestPublishedCreditPriceEur(config?: PricingConfig): number {
  const c = config ?? resolvePricingConfig();
  let cheapest = c.creditPriceEur;
  for (const plan of PLANS) {
    if (typeof plan.price !== "number" || typeof plan.monthlyCredits !== "number") continue;
    if (plan.price <= 0 || plan.monthlyCredits <= 0) continue;
    cheapest = Math.min(cheapest, plan.price / plan.monthlyCredits);
  }
  return cheapest;
}


// published price or allowance.
export function effectiveCreditPriceEur(
  plan: { price: number | "custom"; monthlyCredits: number | "custom" } | null | undefined,
  config?: PricingConfig
): number {
  const c = config ?? resolvePricingConfig();
  if (!plan) return c.creditPriceEur;
  if (typeof plan.price !== "number" || typeof plan.monthlyCredits !== "number") {
    // A CUSTOM-priced plan (Enterprise) used to fall back to the list
    // price. That is the most expensive per-credit rate in the product,
    // which makes it the least safe possible guess: an Enterprise deal is
    // negotiated in bulk, so its real rate is at or below the cheapest
    // published one. Pricing it at EUR 0.02 charged an Enterprise
    // customer 53 credits for a generation that costs 132 at Ultimate's
    // rate — a 60% under-charge on the highest-value accounts, and one
    // that no test caught because the multiplier still read 4x against
    // the assumed rate.
    //
    // The cheapest known plan rate is the only assumption that cannot
    // under-charge, and it is the same reasoning FALLBACK_MODEL_PRICING
    // already applies to an unrecognised model: over-charging slightly is
    // the safe direction to fail in.
    return Math.min(c.creditPriceEur, cheapestPublishedCreditPriceEur(c));
  }
  // Free (price 0) genuinely has no per-credit revenue — its allowance is
  // a marketing cost, and a free user who wants more buys at list. That
  // is a real rate, not an unknown one, so it keeps the list price.
  if (plan.price <= 0 || plan.monthlyCredits <= 0) return c.creditPriceEur;

  const perCredit = plan.price / plan.monthlyCredits;
  // min(), never the raw plan rate: a hypothetical plan priced ABOVE list
  // must not let us charge fewer credits than the a-la-carte formula
  // would. This only ever protects margin, never inflates it.
  return Math.min(c.creditPriceEur, perCredit);
}

/**
 * The charge a user on `plan` should see for an action that really cost
 * `realCostEur`. This is what settlement uses.
 */
export function creditsForRealCostOnPlan(
  realCostEur: number,
  plan: { price: number | "custom"; monthlyCredits: number | "custom" } | null | undefined,
  config?: PricingConfig,
  marginMultiplier?: number
): number {
  const c = config ?? resolvePricingConfig();
  if (!Number.isFinite(realCostEur) || realCostEur <= 0) return 0;
  return Math.ceil(
    (realCostEur * (marginMultiplier ?? c.marginMultiplier)) / effectiveCreditPriceEur(plan, c)
  );
}

/**
 * Margin actually achieved against REVENUE — credits charged valued at
 * the plan's own per-credit rate, not the list price. This is the number
 * that answers "am I making money on this customer".
 */
export function achievedMarginOnPlan(
  creditsCharged: number,
  realCostEur: number,
  plan: { price: number | "custom"; monthlyCredits: number | "custom" } | null | undefined,
  config?: PricingConfig
): number | null {
  const c = config ?? resolvePricingConfig();
  if (!Number.isFinite(realCostEur) || realCostEur <= 0) return null;
  return (creditsCharged * effectiveCreditPriceEur(plan, c)) / realCostEur;
}

// ---------------------------------------------------------------------
// One-time credit packs — the same leak as plans, through a second door.
// ---------------------------------------------------------------------
//
// The plan fix above closed the subscription side. Credit packs reopen it,
// because they are also sold in bulk below the list price:
//
//   credits_10      500 credits / €10   = €0.0200 per credit  -> 4.00x
//   credits_25    1,500 credits / €25   = €0.0167 per credit  -> 3.33x
//   credits_50    3,500 credits / €50   = €0.0143 per credit  -> 2.86x
//   credits_100   8,000 credits / €100  = €0.0125 per credit  -> 2.50x
//
// A Free user who buys the €100 pack holds 8,000 credits that cost them
// €0.0125 each. Charging them `cost x M / 0.02` yields a nominal 4x and a
// real 2.5x — money lost on every action, exactly as on Ultimate before.
//
// The rule is the same one that fixed plans, applied to whichever source
// the credits could have come from: divide by the CHEAPEST euro-per-credit
// rate the account has access to. Cheapest, not "most recent", because
// credits are fungible once granted — the balance is one number, and there
// is no lot accounting that could tell a plan credit from a pack credit at
// spend time. Taking the minimum is the only choice that cannot
// under-charge, whichever credits the user is actually burning.

/** Euro-per-credit of any bulk source (a plan month, a one-time pack). */
export function perCreditPriceEur(
  source: { price: number | "custom"; credits: number | "custom" } | null | undefined
): number | null {
  if (!source) return null;
  if (typeof source.price !== "number" || typeof source.credits !== "number") return null;
  if (source.price <= 0 || source.credits <= 0) return null;
  if (!Number.isFinite(source.price) || !Number.isFinite(source.credits)) return null;
  return source.price / source.credits;
}

/**
 * The rate settlement must divide by for a given account: the minimum of
 * the list price, the plan's own rate, and the rate of the cheapest pack
 * the account has bought.
 *
 * `purchasedPackPriceEur` is the persisted running minimum over that
 * account's pack purchases (user_credits.min_pack_credit_price_eur, written
 * by grantCredits on every pack grant). Null/absent for the overwhelming
 * majority of accounts, which never buy a pack — they fall through to
 * exactly the plan behaviour that already shipped.
 */
export function effectiveCreditPriceEurForAccount(
  plan: { price: number | "custom"; monthlyCredits: number | "custom" } | null | undefined,
  purchasedPackPriceEur: number | null | undefined,
  config?: PricingConfig
): number {
  const c = config ?? resolvePricingConfig();
  const planRate = effectiveCreditPriceEur(plan, c);
  if (
    typeof purchasedPackPriceEur !== "number" ||
    !Number.isFinite(purchasedPackPriceEur) ||
    purchasedPackPriceEur <= 0
  ) {
    return planRate;
  }
  return Math.min(planRate, purchasedPackPriceEur);
}

export function creditsForRealCostOnAccount(
  realCostEur: number,
  plan: { price: number | "custom"; monthlyCredits: number | "custom" } | null | undefined,
  purchasedPackPriceEur: number | null | undefined,
  config?: PricingConfig,
  marginMultiplier?: number
): number {
  const c = config ?? resolvePricingConfig();
  if (!Number.isFinite(realCostEur) || realCostEur <= 0) return 0;
  return Math.ceil(
    (realCostEur * (marginMultiplier ?? c.marginMultiplier)) /
      effectiveCreditPriceEurForAccount(plan, purchasedPackPriceEur, c)
  );
}

export function achievedMarginOnAccount(
  creditsCharged: number,
  realCostEur: number,
  plan: { price: number | "custom"; monthlyCredits: number | "custom" } | null | undefined,
  purchasedPackPriceEur: number | null | undefined,
  config?: PricingConfig
): number | null {
  const c = config ?? resolvePricingConfig();
  if (!Number.isFinite(realCostEur) || realCostEur <= 0) return null;
  return (
    (creditsCharged * effectiveCreditPriceEurForAccount(plan, purchasedPackPriceEur, c)) / realCostEur
  );
}

/**
 * The charge for a real cost against an explicit euro-per-credit rate.
 * The shared primitive behind both settlement (which resolves the rate
 * from the account's plan and packs) and the pre-action estimate (which
 * is handed the same rate) — so the two cannot drift into charging and
 * quoting on different divisors.
 */
export function creditsForRealCostOnRate(
  realCostEur: number,
  creditPriceEur: number,
  config?: PricingConfig,
  marginMultiplier?: number
): number {
  const c = config ?? resolvePricingConfig();
  if (!Number.isFinite(realCostEur) || realCostEur <= 0) return 0;
  const price = Number.isFinite(creditPriceEur) && creditPriceEur > 0 ? creditPriceEur : c.creditPriceEur;
  return Math.ceil((realCostEur * (marginMultiplier ?? c.marginMultiplier)) / price);
}
