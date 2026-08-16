import type { PlanSlug } from "@/lib/billing/plans";
import { PLANS } from "@/lib/billing/plans";
import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";
import {
  COMBINED_CEILING_SHARE,
  DECLARED_ALLOWANCE_SHARES,
  FREE_PLAN_MAX_MONTHLY_COST_EUR,
  ceilingPriceEur,
  creditCeilingEur,
  creditShareForPlan,
} from "@/lib/billing/ceiling";
import {
  freeChatAllowance,
  freeChatPerMessageWorstCaseEur,
} from "@/lib/billing/free-chat";

// THE REGISTRY OF FREE QUOTAS.
//
// A "free quota" is anything an account may consume that costs Anthropic
// money and costs the account NO credits. Every one of them spends outside
// the credit ceiling, so every one of them has to be here — otherwise the
// combined ceiling is computed over a subset and reads healthy while the
// real number is anything at all.
//
// That is not hypothetical: free chat was exactly this. It shipped with
// its own private 25% ceiling, the credit subsystem had its own private
// 25% ceiling, and the combined worst case on Professional was 43.8%
// against a stated 4x target for a year.
//
// WHAT MAKES THIS CATCH THE NEXT ONE. A registry nobody is forced to join
// is a comment. Three mechanisms force it, all in
// scripts/tests/combined-ceiling.test.mjs, all inside `npm run build`:
//
//   1. Every `bypassCharge:` expression in src/ is inventoried. If its
//      condition is not purely admin/beta, the identifier that turns it on
//      must appear in some entry's `bypassIdentifiers` here. A new
//      "10 free presentations" feature settles with bypassCharge — and the
//      build fails until it is registered.
//   2. Every exported per-plan quota table (Record<PlanSlug, number>) in
//      src/lib/ must be either registered here or listed as a
//      non-AI-spending capacity limit. A new per-plan number cannot appear
//      without someone saying which of the two it is.
//   3. The registry is checked in BOTH directions against the declared
//      budget shares in ceiling.ts, so an entry cannot exist without a
//      share and a share cannot exist without an entry.

export type FreeAllowance = {
  /** Stable id. Must match a key of DECLARED_ALLOWANCE_SHARES. */
  id: string;
  /** Short label for the margin report and the gate's output. */
  label: string;
  /**
   * Settlement `feature` strings this quota produces. They exist so the
   * gate can prove the quota is still live in the code, and so an
   * ai_cost_log row can be attributed back to the quota that granted it.
   */
  settlementFeatures: string[];
  /**
   * The local identifiers that, in an api route, make `bypassCharge` true
   * for a NORMAL user. The source scan classifies every bypassCharge
   * expression by these — anything unrecognised fails the build.
   */
  bypassIdentifiers: string[];
  /** How many units this plan gets per month, AFTER the ceiling clamp. */
  unitsPerMonth(
    planSlug: PlanSlug,
    config: PricingConfig,
    env: Record<string, string | undefined>
  ): number;
  /** The worst a single unit can cost us, in EUR. */
  worstCaseEurPerUnit(
    config: PricingConfig,
    env: Record<string, string | undefined>
  ): number;
};

const FREE_CHAT: FreeAllowance = {
  id: "free_chat",
  label: "Free chat messages",
  settlementFeatures: ["chat_free"],
  bypassIdentifiers: ["isFreeMessage"],
  unitsPerMonth: (planSlug, config, env) => freeChatAllowance(planSlug, config, env),
  worstCaseEurPerUnit: (config, env) => freeChatPerMessageWorstCaseEur(config, env),
};

export const FREE_ALLOWANCES: FreeAllowance[] = [FREE_CHAT];

// ---------------------------------------------------------------------------
// The combined worst case
// ---------------------------------------------------------------------------

export type AllowanceCost = {
  id: string;
  label: string;
  units: number;
  eurPerUnit: number;
  costEur: number;
  /** null on a plan with no price to take a share of (Free). */
  shareOfPrice: number | null;
};

export type CombinedCeiling = {
  planSlug: PlanSlug;
  /** The EUR/month the worst case is measured against; null for Free. */
  priceEur: number | null;
  creditCostEur: number;
  creditShare: number | null;
  allowances: AllowanceCost[];
  allowanceCostEur: number;
  totalCostEur: number;
  /** total / price, or null for Free (judged on absolute cost instead). */
  totalShare: number | null;
  /** price / total — the number the business calls "margin". */
  combinedMargin: number | null;
  withinCeiling: boolean;
};

/**
 * The whole picture for one plan: what credits can cost, what every free
 * quota can cost, and whether the sum clears the ceiling.
 *
 * This is the ONLY function that answers "are we at 4x". Everything else —
 * the build gate, the runtime check, the margin report — reads it, so
 * there is no second place where a subsystem could be forgotten.
 */
export function combinedCeilingFor(
  planSlug: PlanSlug,
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env
): CombinedCeiling {
  const priceEur = ceilingPriceEur(planSlug, env);
  const creditCostEur = creditCeilingEur(planSlug, config, env) ?? 0;

  const allowances: AllowanceCost[] = FREE_ALLOWANCES.map((a) => {
    const units = a.unitsPerMonth(planSlug, config, env);
    const eurPerUnit = a.worstCaseEurPerUnit(config, env);
    const costEur = units * eurPerUnit;
    return {
      id: a.id,
      label: a.label,
      units,
      eurPerUnit,
      costEur,
      shareOfPrice: priceEur === null ? null : costEur / priceEur,
    };
  });

  const allowanceCostEur = allowances.reduce((sum, a) => sum + a.costEur, 0);
  const totalCostEur = creditCostEur + allowanceCostEur;

  // Free has no price, so it is judged on the absolute monthly cost of one
  // account instead of on a share that would be Infinity.
  const withinCeiling =
    priceEur === null
      ? totalCostEur <= FREE_PLAN_MAX_MONTHLY_COST_EUR + 1e-9
      : totalCostEur <= COMBINED_CEILING_SHARE * priceEur + 1e-9;

  return {
    planSlug,
    priceEur,
    creditCostEur,
    creditShare: priceEur === null ? null : creditShareForPlan(planSlug, config, env),
    allowances,
    allowanceCostEur,
    totalCostEur,
    totalShare: priceEur === null ? null : totalCostEur / priceEur,
    combinedMargin: priceEur === null || totalCostEur <= 0 ? null : priceEur / totalCostEur,
    withinCeiling,
  };
}

/** Every plan, in published order. What the gate and the report iterate. */
export function combinedCeilingTable(
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env
): CombinedCeiling[] {
  return PLANS.map((p) => combinedCeilingFor(p.slug, config, env));
}

/**
 * Registry <-> declared-shares symmetry, checked in both directions.
 *
 * An entry without a share would silently get a zero budget and clamp
 * itself out of existence; a share without an entry would reserve revenue
 * for a quota that no longer exists, starving the ones that do.
 */
export function assertRegistryMatchesShares(): { ok: true } | { ok: false; reason: string } {
  const ids = new Set(FREE_ALLOWANCES.map((a) => a.id));
  const shareKeys = new Set(Object.keys(DECLARED_ALLOWANCE_SHARES));

  const missingShare = [...ids].filter((id) => !shareKeys.has(id));
  if (missingShare.length > 0) {
    return {
      ok: false,
      reason: `allowance(s) with no declared budget share in ceiling.ts: ${missingShare.join(", ")}`,
    };
  }
  const orphanShare = [...shareKeys].filter((id) => !ids.has(id));
  if (orphanShare.length > 0) {
    return {
      ok: false,
      reason: `declared budget share(s) with no allowance in FREE_ALLOWANCES: ${orphanShare.join(", ")}`,
    };
  }
  const duplicates = FREE_ALLOWANCES.length - ids.size;
  if (duplicates > 0) {
    return { ok: false, reason: `${duplicates} duplicate id(s) in FREE_ALLOWANCES` };
  }
  return { ok: true };
}
