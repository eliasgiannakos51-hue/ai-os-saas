import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";
import { PLANS, planCreditPriceEur } from "@/lib/billing/plans";

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
// CREDIT_PRICE_EUR (€0.02) is the a-la-carte price of a credit. Until
// 2026-10-03 every paid plan sold them for less than that in bulk (since
// then every plan sells them at exactly €0.02 — one credit size, see
// effectiveCreditPriceEurForAccount; the table and the reasoning below are
// the history of why the rate was ever plan-aware):
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
    // BOTH intervals. Annual is 20% cheaper per credit, so the moment
    // annual billing existed, "the cheapest rate any published plan sells
    // at" stopped being the monthly one — and this function's entire
    // purpose is to be that floor for Enterprise, whose real negotiated
    // rate is unknowable. Iterating only the monthly prices would have
    // left Enterprise priced 25% above the cheapest rate a customer can
    // actually reach, which is an under-charge on the highest-value
    // accounts and exactly the failure this function was written for.
    for (const interval of ["month", "year"] as const) {
      const rate = planCreditPriceEur(plan, interval);
      if (rate !== null) cheapest = Math.min(cheapest, rate);
    }
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
    // A CUSTOM-priced plan (Enterprise). From 2026-09 to 2026-10-03 it was
    // priced at the cheapest published rate, because plans then sold a
    // credit below list (Ultimate at EUR 0.008) and charging Enterprise at
    // EUR 0.02 under-charged it 60% against Ultimate.
    //
    // SINCE 2026-10-03 A CREDIT IS ONE SIZE, and every published plan sells
    // it at the list price, so an Enterprise credit is a list-price credit
    // too: its contract buys a NUMBER of them (ENTERPRISE_MIN_PRICE_EUR in
    // lib/billing/ceiling.ts is the floor that number is measured against).
    // The cheapest published rate now exists only on ANNUAL billing, and
    // charging Enterprise at it (EUR 0.02 x 10/12) would charge 20% more
    // credits for the same action than on any other plan — the
    // inconsistency this change removes.
    return c.creditPriceEur;
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
// (The packs as sold until 2026-10-03.) Until then settlement divided by
// the CHEAPEST rate the account had reached, plan or pack, so a pack
// holder's credit was bigger than everyone else's.
//
// SINCE 2026-10-03 A CREDIT IS ONE SIZE: settlement divides by the list
// price for every account (effectiveCreditPriceEurForAccount), and a
// pack's discount is in BONUS credits, capped so that spending them at
// list still earns 4x (lib/billing/plans.ts, CREDIT_PACKS). Packs already
// bought are honoured as they are — their credits earn less when spent,
// and revenuePerCreditEurForAccount is the number that says how much.

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
 * The rate settlement divides by for a given account — since 2026-10-03,
 * the list price for every account (see the comment inside).
 *
 * `purchasedPackPriceEur` is the persisted running minimum over that
 * account's pack purchases (user_credits.min_pack_credit_price_eur, written
 * by grantCredits on every pack grant). It is kept in the signature so the
 * callers do not change, and it is read for the margin by
 * revenuePerCreditEurForAccount.
 */
export function effectiveCreditPriceEurForAccount(
  plan: { price: number | "custom"; monthlyCredits: number | "custom" } | null | undefined,
  purchasedPackPriceEur: number | null | undefined,
  config?: PricingConfig
): number {
  // ONE CREDIT IS ONE SIZE (the owner's decision, 2026-10-03): an action
  // costs the same number of credits on every plan and for every account,
  // so the divisor is the list price and nothing else. It used to be the
  // CHEAPEST rate the account could reach — plan or pack — which made a
  // credit 2.5x SMALLER on Ultimate (EUR 0.008) than on Starter (EUR 0.02): the
  // same website was 187 credits on one and 75 on the other. That stopped being necessary
  // the day every plan was priced at the list rate (lib/billing/plans.ts:
  // 1,000 / 2,500 / 5,000 / 10,000 credits for EUR 20 / 50 / 100 / 200),
  // and scripts/tests/credit-size.test.mjs fails if a plan drifts off it.
  //
  // `purchasedPackPriceEur` no longer moves the price. A pack's discount
  // is in its BONUS credits, bounded so that spending them at list still
  // earns 4x; what the account actually paid per credit is read where it
  // belongs — revenuePerCreditEurForAccount, for the margin it reports.
  void purchasedPackPriceEur;
  return effectiveCreditPriceEur(plan, config ?? resolvePricingConfig());
}

/**
 * What a credit actually BROUGHT IN for this account: the cheapest rate it
 * reached, plan or pack. Not the price an action is charged at — that is
 * effectiveCreditPriceEurForAccount, one size for everyone — but the
 * revenue behind the credits being spent, which is what a margin is
 * measured against. A pack bought before 2026-10-03 at EUR 0.0125 a credit
 * is honoured as it is (the owner's decision), and its credits earn less
 * when spent; this is the number that shows it.
 */
export function revenuePerCreditEurForAccount(
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

/**
 * The margin a settlement on this account is EXPECTED to achieve: the
 * resolved target, scaled by what a credit brought in against what it is
 * charged at. Without a pack the two rates are equal and this is the
 * target itself. With a pack, it is lower by exactly the pack's discount —
 * since 2026-10-03 a known, accepted reduction (the bonus credits on sale
 * are capped so it stays at or above 4x, and packs sold before then are
 * honoured as they are).
 *
 * lib/billing/reservations.ts alerts below THIS, not below the bare
 * target: against the bare target every pack holder's settlement would
 * read as a shortfall and email the owner, and an alert that always fires
 * is one nobody reads — which is how a real shortfall would get missed.
 */
export function expectedAchievedMarginOnAccount(
  plan: { price: number | "custom"; monthlyCredits: number | "custom" } | null | undefined,
  purchasedPackPriceEur: number | null | undefined,
  targetMargin: number,
  config?: PricingConfig
): number {
  const c = config ?? resolvePricingConfig();
  return (
    (targetMargin * revenuePerCreditEurForAccount(plan, purchasedPackPriceEur, c)) /
    effectiveCreditPriceEurForAccount(plan, purchasedPackPriceEur, c)
  );
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
    (creditsCharged * revenuePerCreditEurForAccount(plan, purchasedPackPriceEur, c)) / realCostEur
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
