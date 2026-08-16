import type { PlanSlug } from "@/lib/billing/plans";

/**
 * Which Stripe events are allowed to rewrite the credit balance.
 *
 * THE BUG THIS EXISTS TO STOP.
 *
 * syncCreditsForPlan() upserts `credits_remaining = plan.monthlyCredits`.
 * That is right for a new subscription and for a renewal, and it was being
 * run on EVERY `customer.subscription.updated` as well — an event Stripe
 * fires for reasons that have nothing to do with a billing period: a card
 * update, a metadata change, adding a team seat, applying a coupon, and
 * setting cancel_at_period_end.
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
 * The fix is not to make the reset gentler; it is to run it only when
 * something happened that is actually SUPPOSED to reset a balance.
 *
 * PURE ON PURPOSE. The webhook needs the network, a Stripe signature and a
 * service-role client; this decision needs none of that, so it is
 * exhaustively testable — see subscription-sync.test.mjs, which walks
 * every event type against every from/to plan pair rather than sampling.
 */
export type CreditSyncDecision = "reset" | "skip";

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
};

/**
 * Events that always open a new balance, whatever the tiers say.
 *
 * - invoice.paid          a billing period actually started and was paid
 *                         for; this is the monthly grant.
 * - checkout.session.completed
 *                         a subscription began.
 * - customer.subscription.deleted
 *                         it ended; the account drops to Free's allotment.
 */
const ALWAYS_RESET = new Set([
  "invoice.paid",
  "checkout.session.completed",
  "customer.subscription.deleted",
]);

export function creditSyncDecision(input: CreditSyncInput): CreditSyncDecision {
  if (ALWAYS_RESET.has(input.eventType)) return "reset";

  // Everything else — customer.subscription.updated and anything added
  // later — only earns a reset by actually changing the plan. A plan
  // change is a different monthly allowance, so the balance has to follow
  // it; a seat added to the same plan is not.
  //
  // previousTier === null means the account has no recorded tier yet, so
  // there is no balance to protect and the new plan's allotment is the
  // right starting point.
  if (input.previousTier === null) return "reset";
  return input.previousTier === input.nextTier ? "skip" : "reset";
}
