import type Stripe from "stripe";

/**
 * When the paid period the customer has already paid for runs out.
 *
 * READ FROM TWO PLACES ON PURPOSE. Stripe moved `current_period_end` off
 * the subscription object and onto each subscription ITEM; this app pins
 * apiVersion "2026-07-29.dahlia", where the item is authoritative, but a
 * subscription that predates the move — or a webhook payload replayed from
 * an older event — still carries the top-level field. Reading only one of
 * them returns undefined for the other shape, and an undefined date here
 * is shown to the user as the day their access ends.
 *
 * The LATEST item end is used when a subscription has several items (a
 * plan plus team seats): access lasts as long as the longest-paid item,
 * and quoting the earliest would tell the user their access ends before it
 * actually does.
 */
export function currentPeriodEndSeconds(subscription: Stripe.Subscription): number | null {
  const itemEnds = (subscription.items?.data ?? [])
    .map((item) => (item as unknown as { current_period_end?: number }).current_period_end)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  if (itemEnds.length > 0) return Math.max(...itemEnds);

  const legacy = (subscription as unknown as { current_period_end?: number }).current_period_end;
  return typeof legacy === "number" && Number.isFinite(legacy) ? legacy : null;
}

/** The same value as an ISO string, or null when Stripe gave us neither. */
export function currentPeriodEndIso(subscription: Stripe.Subscription): string | null {
  const seconds = currentPeriodEndSeconds(subscription);
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}

/**
 * Whole days from `now` until the period ends, floored at 0.
 *
 * Floored, not rounded: "expires in 1 day" on something that has already
 * expired is worse than "expires today".
 */
export function daysUntil(iso: string, now: number = Date.now()): number {
  const end = new Date(iso).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}
