import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";

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
export function creditsForRealCostEur(realCostEur: number, config?: PricingConfig): number {
  const c = config ?? resolvePricingConfig();
  if (!Number.isFinite(realCostEur) || realCostEur <= 0) return 0;
  return Math.ceil((realCostEur * c.marginMultiplier) / c.creditPriceEur);
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
// published price or allowance.
export function effectiveCreditPriceEur(
  plan: { price: number | "custom"; monthlyCredits: number | "custom" } | null | undefined,
  config?: PricingConfig
): number {
  const c = config ?? resolvePricingConfig();
  if (!plan) return c.creditPriceEur;
  if (typeof plan.price !== "number" || typeof plan.monthlyCredits !== "number") {
    // Free (price 0) and Enterprise (custom) have no meaningful per-credit
    // rate — fall back to list price.
    return c.creditPriceEur;
  }
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
  config?: PricingConfig
): number {
  const c = config ?? resolvePricingConfig();
  if (!Number.isFinite(realCostEur) || realCostEur <= 0) return 0;
  return Math.ceil((realCostEur * c.marginMultiplier) / effectiveCreditPriceEur(plan, c));
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
