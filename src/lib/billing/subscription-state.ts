import "server-only";
import { createStripeClient } from "@/lib/stripe/server";
import { currentPeriodEndIso } from "@/lib/billing/subscription-period";
import { logApiError } from "@/lib/log-error";

export type SubscriptionState = {
  /** True once the user has asked to cancel and the period has not ended. */
  cancelAtPeriodEnd: boolean;
  /** ISO date the paid period ends, or null when Stripe reports none. */
  endsAt: string | null;
};

/**
 * The live cancel/renew state of this account's subscription.
 *
 * READ FROM STRIPE, not from user_metadata. cancel_at_period_end is not
 * mirrored anywhere locally, and mirroring it would create a second source
 * of truth that goes stale the moment the user cancels from Stripe's own
 * billing portal instead of from this app — which they can, and which
 * fires no event this app stores.
 *
 * NEVER THROWS. Settings is the page a user opens when something is wrong
 * with their billing; a Stripe outage or a missing STRIPE_SECRET_KEY must
 * degrade to "no cancellation pending" rather than take the whole page
 * down. The cost of being wrong in that direction is that the banner does
 * not show; the cost of the other direction is that nobody can reach their
 * settings at all.
 */
export async function loadSubscriptionState(user: {
  user_metadata?: Record<string, unknown> | null;
}): Promise<SubscriptionState | null> {
  const subscriptionId = user.user_metadata?.stripe_subscription_id as string | undefined;
  if (!subscriptionId) return null;

  try {
    const subscription = await createStripeClient().subscriptions.retrieve(subscriptionId);
    return {
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      endsAt: currentPeriodEndIso(subscription),
    };
  } catch (err) {
    logApiError("billing:load-subscription-state", err, { subscriptionId });
    return null;
  }
}
