import { comparePlanSlugs, type PlanSlug } from "@/lib/billing/plans";

/**
 * Which Stripe events are allowed to rewrite the credit balance, and how.
 *
 * THE BUG THIS EXISTS TO STOP.
 *
 * syncCreditsForPlan() sets `credits_remaining = plan.monthlyCredits +
 * purchased`. That is right for a new subscription and for a renewal, and
 * it was being run on EVERY `customer.subscription.updated` as well — an
 * event Stripe fires for reasons that have nothing to do with a billing
 * period: a card update, a metadata change, adding a team seat, applying a
 * coupon, and setting cancel_at_period_end.
 *
 * Two ways that goes wrong, in opposite directions:
 *
 *   1. A credit PACK increments credits_remaining above the plan's monthly
 *      total (grant_credits_idempotent adds; it does not clamp). The next
 *      unrelated subscription.updated set the balance back down to the
 *      plan total — destroying credits the user had paid for separately.
 *   2. A user at 5% remaining could restore a full month's balance by
 *      touching anything on the subscription. Free credits, repeatable.
 *
 * THE SECOND HALF (2026-11-05): A MOVE DOWN NEVER REFILLS. A reset SETS the
 * balance, so on a downgrade it RAISES an account that had spent the
 * higher plan's allowance back to the lower plan's full one. A move down
 * now CLAMPS: the balance can only fall to the lower plan's allowance
 * (plus what was bought), never rise. The end of a subscription is a move
 * down to Free, and is clamped the same way.
 *
 * THE KEY IS THE PAID PERIOD, NOT THE CALENDAR MONTH (creditPeriodKey
 * below). A reset is claimed once per plan per period the customer paid
 * for, so moving up, down and up again inside one period lands one reset
 * for the higher plan — however the period falls across months.
 *
 * PURE ON PURPOSE. The webhook needs the network, a Stripe signature and a
 * service-role client; this decision needs none of that, so it is
 * exhaustively testable — see subscription-sync.test.mjs, which walks
 * every event type against every from/to plan pair rather than sampling.
 */
export type CreditSyncDecision = "reset" | "clamp" | "skip";

export type CreditSyncInput = {
  /** The Stripe event that arrived. */
  eventType: string;
  /**
   * The tier stored on the user BEFORE this event, or null when the
   * account has never had one. Read from user_metadata.subscription_tier.
   */
  previousTier: PlanSlug | null;
  /** The tier the subscription resolves to now. */
  nextTier: PlanSlug;
  /**
   * For invoice.paid only: Stripe's `billing_reason`. A renewal and a
   * first invoice open a paid period; a proration invoice from a plan
   * change, a manual invoice and the overage invoice do not.
   */
  billingReason?: string | null;
};

/**
 * Events that open a period somebody has PAID for, whatever the tiers say.
 *
 * - checkout.session.completed / .async_payment_succeeded
 *                         a subscription began (the webhook only grants
 *                         a pack on these once the session is paid).
 * - invoice.paid, billing_reason subscription_cycle or subscription_create
 *                         a billing period started and was paid for; this
 *                         is the monthly grant. Stripe sets billing_reason
 *                         on every invoice it creates for a subscription.
 */
const NEW_PERIOD_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
const NEW_PERIOD_INVOICE_REASONS = new Set(["subscription_cycle", "subscription_create"]);

export function opensPaidPeriod(input: Pick<CreditSyncInput, "eventType" | "billingReason">): boolean {
  if (NEW_PERIOD_EVENTS.has(input.eventType)) return true;
  return input.eventType === "invoice.paid" && NEW_PERIOD_INVOICE_REASONS.has(String(input.billingReason ?? ""));
}

export function creditSyncDecision(input: CreditSyncInput): CreditSyncDecision {
  // A PAID PERIOD OPENS A FRESH BALANCE at whatever plan it was paid at —
  // including the lower plan a scheduled downgrade starts the new period
  // on. Keyed on that period, so a redelivery cannot open it twice. A
  // "new period" that resolves to Free is a subscription that is not live
  // (a checkout whose payment is still pending): nothing paid, nothing
  // refilled.
  if (opensPaidPeriod(input)) return input.nextTier === "free" ? "clamp" : "reset";

  // The subscription ended: the account drops to Free's allotment, and an
  // account already below it stays where it is.
  if (input.eventType === "customer.subscription.deleted") return "clamp";

  // Everything else — customer.subscription.updated, an invoice that is not
  // a new period, and anything added later — only moves the balance by
  // actually changing the plan. previousTier === null means the account
  // has no recorded tier yet, so there is no balance to protect and the
  // plan's allotment is the right starting point.
  if (input.previousTier === null) return "reset";
  const direction = comparePlanSlugs(input.nextTier, input.previousTier);
  if (direction < 0) return "clamp";
  if (direction > 0) return "reset";
  return "skip";
}

/**
 * What a reset is claimed under: the start of the paid period, in Stripe's
 * own seconds. Only when Stripe gave no period at all does it fall back to
 * the calendar month, under a different prefix so the two can never be
 * the same key.
 */
export function creditPeriodKey(periodStartSeconds: number | null, now: Date = new Date()): string {
  if (typeof periodStartSeconds === "number" && Number.isFinite(periodStartSeconds)) {
    return `period-${Math.trunc(periodStartSeconds)}`;
  }
  return `month-${now.toISOString().slice(0, 7)}`;
}
