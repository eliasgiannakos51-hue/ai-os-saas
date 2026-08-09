import {
  CREDIT_PACKS,
  PLANS,
  creditPackPriceEurPerCredit,
  getPlan,
  planRank,
  type CreditPackId,
  type Plan,
  type PlanSlug,
} from "@/lib/billing/plans";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { estimateForAction, type ActionProfileKey } from "@/lib/billing/estimate";
import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";

// "Not enough credits (you have: 200, need: 276). Upgrade your plan or
// purchase more credits."
//
// That sentence is true and useless. It arrives after the user has
// written a description, it names a number they have no way to influence,
// and the two things it suggests both cost money. What it never says is
// the one thing that is free: the SAME request, described more simply,
// might already fit.
//
// This file answers the three questions that message raises and does not
// answer:
//
//   1. Would a smaller version of this fit? — by inverting the estimator
//      (binary search over input size), not by guessing a percentage.
//   2. Which pack would actually cover it? — accounting for the fact that
//      buying a pack CHANGES the rate and therefore changes the answer.
//   3. Which upgrade would actually cover it? — same trap, larger.
//
// Nothing here charges anything or changes what is charged. Every number
// is produced by the same estimator the reservation uses, at the same
// rate settlement will use. The margin multiplier is untouched.

export type SimplerOption = {
  /** The largest description that fits the credits already available. */
  inputChars: number;
  /** What that version would be reserved at. */
  credits: number;
  /** How much smaller the description has to get, as a percentage. */
  shrinkPercent: number;
  /** True when the only way to fit was to drop the reference images. */
  dropImages: boolean;
};

export type PackOption = {
  id: CreditPackId;
  price: number;
  credits: number;
  /** What the action costs AFTER buying this pack — see the note in
   *  cheapestSufficientPack about why this is not the same number. */
  creditsAfterPurchase: number;
};

export type UpgradeOption = {
  slug: PlanSlug;
  name: string;
  price: number;
  monthlyCredits: number;
  /** What the action costs on THAT plan, which is more than it costs on
   *  this one, because its credits are individually cheaper. */
  creditsOnPlan: number;
};

export type CreditShortfall = {
  needed: number;
  available: number;
  shortfall: number;
  /**
   * The least this action can possibly be reserved at on this account —
   * the same request with an empty description and no images. If the
   * balance is below this, no amount of simplifying helps, and saying so
   * is more useful than suggesting it.
   */
  floorCredits: number;
  simpler: SimplerOption | null;
  pack: PackOption | null;
  upgrade: UpgradeOption | null;
};

export type ShortfallInput = {
  action: ActionProfileKey;
  model: string;
  inputChars: number;
  imageCount?: number;
  expectedWebSearches?: number;
  available: number;
  plan: Plan;
  /** user_credits.min_pack_credit_price_eur — the account's cheapest
   *  already-purchased pack rate, or null. */
  purchasedPackPriceEur?: number | null;
};

function reserveAt(
  input: ShortfallInput,
  overrides: { inputChars?: number; imageCount?: number },
  creditPriceEur: number,
  config: PricingConfig
): number {
  return estimateForAction(
    input.action,
    {
      model: input.model,
      inputChars: overrides.inputChars ?? input.inputChars,
      imageCount: overrides.imageCount ?? input.imageCount,
      expectedWebSearches: input.expectedWebSearches,
    },
    config,
    creditPriceEur
  ).reserveCredits;
}

/**
 * The largest input that still fits `budget`, found by bisection over the
 * estimator rather than by scaling the cost linearly.
 *
 * It cannot be scaled linearly: every profile has a fixed floor (system
 * prompt, auxiliary calls, base output) that no amount of shortening
 * removes, and websiteGenerate additionally re-sends its own output on
 * each continuation round. A "halve your description to halve the cost"
 * suggestion would be wrong in the direction that matters — the user
 * shortens, resubmits, and is refused a second time.
 */
function largestFittingInput(
  input: ShortfallInput,
  budget: number,
  imageCount: number,
  creditPriceEur: number,
  config: PricingConfig
): number | null {
  if (reserveAt(input, { inputChars: 0, imageCount }, creditPriceEur, config) > budget) return null;

  let lo = 0;
  let hi = Math.max(0, Math.floor(input.inputChars));
  // 24 iterations resolves any description this app accepts (the Website
  // Builder caps at 20,000 characters) to the exact character.
  for (let i = 0; i < 24 && lo < hi; i++) {
    const mid = Math.ceil((lo + hi) / 2);
    if (reserveAt(input, { inputChars: mid, imageCount }, creditPriceEur, config) <= budget) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/**
 * The cheapest pack that genuinely covers the action.
 *
 * THE TRAP. Buying a pack lowers the account's effective per-credit rate
 * (effectiveCreditPriceEurForAccount takes the minimum of every rate the
 * account has access to, because credits are fungible once granted). A
 * lower rate means MORE credits are charged for the same real cost — so
 * the €100 pack, which grants 8,000 credits at €0.0125, also raises what
 * this generation costs from 59 credits to 95. Picking the smallest pack
 * whose credit count exceeds today's shortfall therefore recommends packs
 * that do not actually cover the action. Each candidate is re-priced
 * under its own rate before being offered.
 */
function cheapestSufficientPack(
  input: ShortfallInput,
  config: PricingConfig
): PackOption | null {
  const candidates = [...CREDIT_PACKS].sort((a, b) => a.price - b.price);
  for (const pack of candidates) {
    const packRate = creditPackPriceEurPerCredit(pack);
    const rateAfter = effectiveCreditPriceEurForAccount(
      input.plan,
      Math.min(packRate, input.purchasedPackPriceEur ?? Number.POSITIVE_INFINITY),
      config
    );
    const creditsAfterPurchase = reserveAt(input, {}, rateAfter, config);
    if (input.available + pack.credits >= creditsAfterPurchase) {
      return {
        id: pack.id,
        price: pack.price,
        credits: pack.credits,
        creditsAfterPurchase,
      };
    }
  }
  return null;
}

/**
 * The cheapest plan above this one whose MONTHLY allowance covers the
 * action, priced at that plan's own rate for exactly the reason above.
 *
 * Enterprise is never suggested: it has no published allowance to check a
 * requirement against, and "contact sales" is not an answer to "I want to
 * generate this page now".
 */
function cheapestSufficientUpgrade(
  input: ShortfallInput,
  config: PricingConfig
): UpgradeOption | null {
  const currentRank = planRank(input.plan.slug);
  const candidates = PLANS.filter(
    (p) =>
      planRank(p.slug) > currentRank &&
      typeof p.price === "number" &&
      typeof p.monthlyCredits === "number"
  ).sort((a, b) => (a.price as number) - (b.price as number));

  for (const plan of candidates) {
    const rate = effectiveCreditPriceEurForAccount(plan, input.purchasedPackPriceEur, config);
    const creditsOnPlan = reserveAt(input, {}, rate, config);
    if ((plan.monthlyCredits as number) >= creditsOnPlan) {
      return {
        slug: plan.slug,
        name: plan.name,
        price: plan.price as number,
        monthlyCredits: plan.monthlyCredits as number,
        creditsOnPlan,
      };
    }
  }
  return null;
}

/**
 * Everything the user needs to decide what to do, computed before a single
 * credit is held and before any row is written.
 */
export function describeShortfall(
  input: ShortfallInput,
  config?: PricingConfig
): CreditShortfall {
  const c = config ?? resolvePricingConfig();
  const rate = effectiveCreditPriceEurForAccount(input.plan, input.purchasedPackPriceEur, c);

  const needed = reserveAt(input, {}, rate, c);
  const available = Math.max(0, Math.floor(input.available));
  const floorCredits = reserveAt(input, { inputChars: 0, imageCount: 0 }, rate, c);

  let simpler: SimplerOption | null = null;
  const imageCount = Math.max(0, input.imageCount ?? 0);

  // First try keeping the images the user deliberately attached — a
  // reference image is a design decision, not padding, and telling
  // someone to throw theirs away when trimming two sentences would have
  // done is bad advice.
  let fitting = largestFittingInput(input, available, imageCount, rate, c);
  let dropImages = false;
  if (fitting === null && imageCount > 0) {
    fitting = largestFittingInput(input, available, 0, rate, c);
    dropImages = fitting !== null;
  }

  if (fitting !== null) {
    const credits = reserveAt(
      input,
      { inputChars: fitting, imageCount: dropImages ? 0 : imageCount },
      rate,
      c
    );
    // Only offer it if it is genuinely different work. "Shorten your
    // description by 1%" is noise, and an option that costs the same as
    // the one being refused is not an option.
    const shrink = input.inputChars > 0 ? 1 - fitting / input.inputChars : 0;
    if (credits < needed && (dropImages || shrink >= 0.05)) {
      simpler = {
        inputChars: fitting,
        credits,
        shrinkPercent: Math.round(shrink * 100),
        dropImages,
      };
    }
  }

  return {
    needed,
    available,
    shortfall: Math.max(0, needed - available),
    floorCredits,
    simpler,
    pack: cheapestSufficientPack(input, c),
    upgrade: cheapestSufficientUpgrade(input, c),
  };
}

/** Convenience for routes that only have a plan slug to hand. */
export function planFromSlug(slug: string | null | undefined): Plan {
  return getPlan(slug ?? "free") ?? getPlan("free")!;
}
