import { comparePlanSlugs, type BillingInterval } from "@/lib/billing/plans";

/**
 * WHICH WAY A PLAN CHANGE GOES, AND WHAT A DOWNGRADE LOOKS LIKE AT STRIPE.
 *
 * The pure half of api/checkout's "already subscribed" path, split out so
 * scripts/tests/billing-integrity.test.mjs can drive it rather than read it.
 *
 * DIRECTION IS THE TIER FIRST. It used to be "what the account pays per
 * month", which made a move from a higher plan billed monthly to a lower
 * plan billed yearly an "upgrade" — charged now, with the unused part of
 * the higher plan credited back, after its credits had been spent. The
 * tier decides; the interval only breaks a tie (month -> year on the same
 * plan is a year paid up front, so it is an upgrade; year -> month waits
 * for the year to end).
 */
export type PlanChangeDirection = "upgrade" | "downgrade" | "same";

export function planChangeDirection(params: {
  fromSlug: string;
  fromInterval: BillingInterval;
  toSlug: string;
  toInterval: BillingInterval;
}): PlanChangeDirection {
  const byTier = comparePlanSlugs(params.toSlug, params.fromSlug);
  if (byTier > 0) return "upgrade";
  if (byTier < 0) return "downgrade";
  if (params.fromInterval === params.toInterval) return "same";
  return params.toInterval === "year" ? "upgrade" : "downgrade";
}

export type PhaseItem = { price: string; quantity: number };

export type DowngradePhase =
  | {
      items: PhaseItem[];
      start_date: number;
      end_date: number;
      proration_behavior: "none";
      metadata?: Record<string, string>;
    }
  | {
      items: PhaseItem[];
      duration: { interval: BillingInterval; interval_count: 1 };
      proration_behavior: "none";
      metadata?: Record<string, string>;
    };

/**
 * A DOWNGRADE TAKES EFFECT WHEN THE PERIOD THE CUSTOMER PAID FOR ENDS.
 *
 * Two phases on a Stripe subscription schedule:
 *   1. the period already paid for, EXACTLY as it is — same items, same
 *      dates — so nothing changes and nothing is prorated today;
 *   2. from its end, the lower plan, with no proration at the switch.
 *
 * Nothing is credited back for the higher plan's remaining days, because
 * the customer keeps them: the plan stays as bought until the period ends.
 *
 * `dropPriceIds` removes lines the lower plan does not have (the paid
 * team-seat line when moving below Professional), so the customer is not
 * billed for seats their new plan cannot use.
 */
export function scheduledDowngradePhases(params: {
  currentStart: number;
  currentEnd: number;
  currentItems: readonly PhaseItem[];
  currentPlanPriceId: string;
  nextPlanPriceId: string;
  nextInterval: BillingInterval;
  dropPriceIds?: readonly string[];
  /** Set on the subscription when phase 2 starts — never on phase 1,
   *  which must stay exactly what the customer is on today. */
  nextMetadata?: Record<string, string>;
}): [DowngradePhase, DowngradePhase] {
  const drop = new Set(params.dropPriceIds ?? []);
  const current = params.currentItems.map((item) => ({ price: item.price, quantity: item.quantity }));
  const next = current
    .filter((item) => !drop.has(item.price))
    .map((item) => (item.price === params.currentPlanPriceId ? { price: params.nextPlanPriceId, quantity: 1 } : item));
  return [
    {
      items: current,
      start_date: params.currentStart,
      end_date: params.currentEnd,
      proration_behavior: "none",
    },
    {
      items: next,
      duration: { interval: params.nextInterval, interval_count: 1 },
      proration_behavior: "none",
      ...(params.nextMetadata ? { metadata: params.nextMetadata } : {}),
    },
  ];
}
