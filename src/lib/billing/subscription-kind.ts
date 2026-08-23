import { getPlan } from "@/lib/billing/plans";
import { monthlyRecurringRevenue } from "@/lib/billing/monthly-revenue";

/**
 * WHICH OF THE SEVEN A SUBSCRIPTION CHANGE IS — the pure half.
 *
 * IN STRIPE'S TERMS THIS IS ALL ONE EVENT. `customer.subscription.updated`
 * fires for a card change, a coupon, an added seat, a cancellation
 * scheduled for period end, and an upgrade. Only some of those are
 * revenue, and classifying them here is what stops the churn count from
 * including everybody who updated their card.
 *
 * SPLIT FROM subscription-log.ts, which does the writing, for the same
 * reason overage.ts is split from overage-store.ts: the decision that
 * moves a number in the financial dashboard has to be testable without a
 * database, so the cross-product below can actually be run.
 */

export type SubscriptionEventKind =
  | "started"
  | "upgraded"
  | "downgraded"
  | "cancelled"
  | "reactivated"
  | "seats_changed"
  | "interval_changed";

/** Monthly euros for one account on this tier, at this interval, with
 *  these seats — the same arithmetic the MRR figure uses, so a stored
 *  historical number and a live one cannot disagree. */
export function monthlyEurFor(tier: string, interval: string, seats: number): number {
  const plan = getPlan(tier);
  if (!plan || typeof plan.price !== "number" || plan.price <= 0) return 0;
  const revenue = monthlyRecurringRevenue([
    { tier, billingInterval: interval, subscribers: 1, seats: Math.max(1, seats) },
  ]);
  return Math.round(revenue.eur * 100) / 100;
}

const isPaid = (tier: string | null): boolean => {
  if (!tier) return false;
  const plan = getPlan(tier);
  return Boolean(plan && typeof plan.price === "number" && plan.price > 0);
};

/**
 * Which of the seven this transition is.
 *
 * PURE, so the cross-product is testable: seven kinds against paid/free
 * on both sides is exactly the sort of classification that looks obvious
 * and has a wrong branch in it.
 */
export function classifyTransition(params: {
  fromTier: string | null;
  toTier: string;
  fromInterval: string | null;
  toInterval: string;
  fromSeats: number | null;
  toSeats: number;
}): SubscriptionEventKind | null {
  const fromPaid = isPaid(params.fromTier);
  const toPaid = isPaid(params.toTier);

  if (!fromPaid && toPaid) {
    // A FIRST SUBSCRIPTION AND A RETURN ARE DIFFERENT NUMBERS. Counting a
    // win-back as a new customer inflates acquisition and makes CAC look
    // better than it is.
    return params.fromTier === null ? "started" : "reactivated";
  }
  if (fromPaid && !toPaid) return "cancelled";
  if (!fromPaid && !toPaid) return null;

  const before = monthlyEurFor(params.fromTier ?? "", params.fromInterval ?? "month", params.fromSeats ?? 1);
  const after = monthlyEurFor(params.toTier, params.toInterval, params.toSeats);

  if (params.fromTier !== params.toTier) return after > before ? "upgraded" : after < before ? "downgraded" : "upgraded";
  if ((params.fromSeats ?? 1) !== params.toSeats) return "seats_changed";
  if ((params.fromInterval ?? "month") !== params.toInterval) return "interval_changed";

  // NOTHING ABOUT THE MONEY CHANGED. A card update, a coupon, an address
  // — real Stripe events that are not revenue events, and recording them
  // would put a row in the churn table for every customer who edited
  // their billing details.
  return null;
}
