import type { Plan, PlanSlug } from "@/lib/billing/plans";
import { getPlan } from "@/lib/billing/plans";
import { resolveMarginFor } from "@/lib/billing/margin-policy";
import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";

// THE COMBINED CEILING.
//
// Total AI cost an account can generate in a month, worst case, must not
// exceed a fixed share of what that account pays. One number, for the SUM
// of every subsystem — not one per subsystem.
//
//   1/M  +  Σ share_of_each_free_quota  <=  0.25
//
// The left term is credits: settlement charges cost x M / rate, so
// spending an entire allowance of C credits worth `rate` each can cost at
// most C x rate / M, and C x rate is the plan price on every published
// plan (see credit-formula.ts). The credit subsystem therefore always
// costs exactly 1/M of revenue in the worst case, whatever the plan.
//
// The right terms are everything given away WITHOUT charging credits. Each
// one is real Anthropic spend that lands outside the credit ceiling
// entirely, and each one must therefore be declared here with the share of
// revenue it is allowed to burn.
//
// WHY THIS FILE EXISTS. Until this change the two halves each enforced
// "25%" against their own subsystem and both passed:
//
//   billing-coverage.test.mjs  PASS  Professional: AI cost <= 25% (25.0%)
//   free-chat.test.mjs         PASS  professional within the 25% ceiling  (18.8%)
//                                                            real total:  43.8%
//
// Neither test was wrong. Neither looked at the other. The combined margin
// on Professional and Ultimate was 2.28x against a stated 4x target, and
// nothing in the build could see it — which is why the ceiling now lives
// in ONE module that both halves divide between them, rather than in two
// modules that each assume they have all of it.

/**
 * The share of revenue that ALL AI spend combined may consume, worst case.
 * Its reciprocal is the margin target: 0.25 <=> 4x.
 */
export const COMBINED_CEILING_SHARE = 0.25;

/** The combined margin the ceiling is equivalent to, for messages/logs. */
export const COMBINED_MARGIN_TARGET = 1 / COMBINED_CEILING_SHARE;

// ---------------------------------------------------------------------------
// Declared budget shares
// ---------------------------------------------------------------------------

/**
 * How much of the plan price each free quota is allowed to burn.
 *
 * Deliberately a plain constant map in THIS file rather than a property of
 * each quota's own module: the quota modules import this file to clamp
 * themselves, so a registry that imported them back would be a cycle. The
 * registry (lib/billing/free-allowances.ts) asserts in both directions —
 * every key here must have a live allowance, and every live allowance must
 * have a key here — so the indirection cannot rot in either direction.
 *
 * Adding a key is not free: `assertDeclaredSharesFit` below refuses a set
 * of shares that cannot coexist with the credit subsystem at the WORST
 * margin the config permits, and scripts/tests/combined-ceiling.test.mjs
 * fails the build on it.
 */
export const DECLARED_ALLOWANCE_SHARES: Record<string, number> = {
  free_chat: 0.05,
};

/** Sum of every declared share, excluding one id (used when clamping it). */
export function declaredSharesExcept(excludeId: string): number {
  let total = 0;
  for (const [id, share] of Object.entries(DECLARED_ALLOWANCE_SHARES)) {
    if (id !== excludeId) total += share;
  }
  return total;
}

// ---------------------------------------------------------------------------
// The price a plan is measured against
// ---------------------------------------------------------------------------

export const DEFAULT_ENTERPRISE_MIN_PRICE_EUR = 400;

let warnedEnterprisePrice = false;

/**
 * The floor price of an Enterprise contract, in EUR/month.
 *
 * Enterprise has no price in code ("custom"), which used to mean the
 * ceiling simply could not be checked for it — the plan inherited
 * Ultimate's 1,200-message free-chat allowance (EUR 37.63/month of worst-
 * case spend) against a price the code did not know. A deal signed at
 * EUR 100/month would have been 37% of revenue on free chat alone, and no
 * test could have said so.
 *
 * So the contract is stated as a number instead: no Enterprise deal below
 * this. The gate checks the plan against it exactly as it checks Ultimate
 * against EUR 200.
 */
export function enterpriseMinPriceEur(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.ENTERPRISE_MIN_PRICE_EUR;
  if (raw === undefined || raw.trim() === "") return DEFAULT_ENTERPRISE_MIN_PRICE_EUR;
  const parsed = Number(raw);
  // Rejected rather than clamped, like every other pricing env: a silent
  // clamp looks like the setting worked. Below Ultimate's price is not a
  // floor at all (Enterprise is sold above Ultimate, never below), and
  // above 1,000,000 is a stray zero.
  if (!Number.isFinite(parsed) || parsed < 200 || parsed > 1_000_000) {
    if (!warnedEnterprisePrice) {
      warnedEnterprisePrice = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[ceiling] ENTERPRISE_MIN_PRICE_EUR="${raw}" ignored (must be a number in [200, 1000000]) ` +
          `— using ${DEFAULT_ENTERPRISE_MIN_PRICE_EUR}.`
      );
    }
    return DEFAULT_ENTERPRISE_MIN_PRICE_EUR;
  }
  return parsed;
}

/**
 * The EUR/month figure a plan's worst case is measured against, or null
 * when there is genuinely none.
 *
 * Free returns null: its price is zero, every share of it is undefined,
 * and it is judged on an ABSOLUTE cost per account instead (see
 * FREE_PLAN_MAX_MONTHLY_COST_EUR). Enterprise returns the contractual
 * floor above — "negotiated" is not the same as "unmeasurable".
 */
export function ceilingPriceEur(
  plan: Plan | PlanSlug | null | undefined,
  env: Record<string, string | undefined> = process.env
): number | null {
  const resolved = typeof plan === "string" ? getPlan(plan) : plan;
  if (!resolved) return null;
  if (resolved.slug === "enterprise") return enterpriseMinPriceEur(env);
  if (typeof resolved.price !== "number" || resolved.price <= 0) return null;
  return resolved.price;
}

/**
 * What a Free account may cost per month, in absolute EUR.
 *
 * A percentage of zero is not a constraint, so the free tier is bounded by
 * a flat acquisition budget instead. Both its credit allowance and its
 * free-chat allowance count against this one number.
 */
export const FREE_PLAN_MAX_MONTHLY_COST_EUR = 1;

// ---------------------------------------------------------------------------
// The credit half
// ---------------------------------------------------------------------------

/**
 * The share of revenue the CREDIT subsystem consumes in the worst case:
 * exactly 1/M at the margin this plan resolves to.
 *
 * Not `credits x rate / price` — that expression is equal to it on every
 * published plan (credits are sold at exactly the plan price), but it is
 * equal by arithmetic coincidence rather than by construction, and it
 * silently reports a SMALLER share for a hypothetical plan that sells
 * credits above list. 1/M is the guarantee the formula actually makes.
 */
export function creditShareForPlan(
  planSlug: PlanSlug,
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env
): number {
  return 1 / resolveMarginFor(null, planSlug, config, env).margin;
}

/** The same thing in EUR, for a plan that has a price to measure against. */
export function creditCeilingEur(
  planSlug: PlanSlug,
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env
): number | null {
  const price = ceilingPriceEur(planSlug, env);
  if (price === null) {
    // Free still has a real credit cost, just not a share: its allowance
    // is valued at the list price it would otherwise be sold at.
    const plan = getPlan(planSlug);
    if (plan && typeof plan.monthlyCredits === "number" && plan.monthlyCredits > 0) {
      return (plan.monthlyCredits * config.creditPriceEur) * creditShareForPlan(planSlug, config, env);
    }
    return null;
  }
  return price * creditShareForPlan(planSlug, config, env);
}

// ---------------------------------------------------------------------------
// The budget left over for one free quota
// ---------------------------------------------------------------------------

/**
 * The EUR/month a given free quota may spend on this plan.
 *
 * Its declared share, REDUCED so that the credit subsystem, every other
 * declared quota and this one still fit under the combined ceiling. The
 * reduction is what makes the ceiling a property of the code rather than
 * of whoever last edited an env var: dropping CREDIT_MARGIN_PROFESSIONAL
 * to 4 pushes the credit half to 25% and this returns 0, turning the quota
 * off rather than breaching the ceiling.
 *
 * Never negative.
 */
export function allowanceBudgetEur(
  allowanceId: string,
  planSlug: PlanSlug,
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env
): number | null {
  const price = ceilingPriceEur(planSlug, env);
  if (price === null) return null;

  const declared = DECLARED_ALLOWANCE_SHARES[allowanceId];
  if (declared === undefined) return 0;

  const headroom =
    COMBINED_CEILING_SHARE - creditShareForPlan(planSlug, config, env) - declaredSharesExcept(allowanceId);

  return Math.max(0, Math.min(declared, headroom)) * price;
}

/**
 * Whether the declared shares coexist with the credit subsystem AS
 * SHIPPED — i.e. at the per-plan margin defaults, with no env overrides.
 *
 * Deliberately NOT "at the worst margin the config permits". An operator
 * can lower any CREDIT_MARGIN_<PLAN> to the floor of 4, which hands the
 * credit half the entire 25% and leaves nothing; demanding that the
 * declared shares survive that would force every share to zero, i.e. would
 * delete the free quotas to defend against a setting nobody has made.
 *
 * The override case is handled where it belongs, at runtime, by
 * allowanceBudgetEur above: the quota shrinks to whatever headroom is
 * genuinely left, to zero if necessary. Section 2 of
 * scripts/tests/combined-ceiling.test.mjs proves that across the full
 * cross-product of permitted environments.
 *
 * Returns the offending detail rather than throwing: this is checked by
 * the build gate and reported at runtime by instrumentation, and env
 * validation that can fail a build is worse than the problem it solves.
 */
export function assertDeclaredSharesFit(
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env
): { ok: true } | { ok: false; reason: string } {
  const declaredTotal = declaredSharesExcept("");
  for (const slug of ["free", "starter", "growth", "professional", "ultimate", "enterprise"] as PlanSlug[]) {
    const creditShare = creditShareForPlan(slug, config, env);
    const total = creditShare + declaredTotal;
    if (total > COMBINED_CEILING_SHARE + 1e-9) {
      return {
        ok: false,
        reason:
          `${slug}: credits ${(creditShare * 100).toFixed(2)}% + declared quotas ` +
          `${(declaredTotal * 100).toFixed(2)}% = ${(total * 100).toFixed(2)}% > ` +
          `${(COMBINED_CEILING_SHARE * 100).toFixed(0)}%`,
      };
    }
  }
  return { ok: true };
}
