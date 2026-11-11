import "server-only";
import { createStripeClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { paymentsConfigured, type PaymentsAccount } from "./connect";

/**
 * IONEXA PAYMENTS — SUBSCRIPTIONS.
 *
 * Manages recurring subscriptions for the Ionexa user's OWN customers.
 * Built on top of Stripe Billing through destination charges with
 * application_fee_percent. The platform keeps 2.5% of every recurring
 * payment, same as one-time products.
 *
 * Why Stripe Billing:
 * - Automatic retries on failed payments (dunning)
 * - 3D Secure handling
 * - Proration on upgrades/downgrades
 * - Customer portal for self-service
 * - Webhooks for lifecycle events
 */

export type PaymentsSubscription = {
  id: string;
  user_id: string;
  account_id: string;
  product_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  customer_email: string | null;
  customer_name: string | null;
  status: "active" | "past_due" | "canceled" | "trialing" | "paused" | "unpaid";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Lists all subscriptions for the Ionexa user (the SELLER).
 */
export async function listSubscriptions(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<PaymentsSubscription[]> {
  const { data, error } = await admin
    .from("payments_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    logApiError("payments:list-subscriptions", error, { userId });
    return [];
  }
  return data ?? [];
}

/**
 * Gets subscription metrics: active count, MRR, churn count this month.
 */
export async function subscriptionMetrics(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ activeCount: number; mrrCents: number; churnedThisMonth: number }> {
  const subs = await listSubscriptions(admin, userId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const active = subs.filter((s) => s.status === "active" || s.status === "trialing");

  // MRR: sum of product prices for active subs. We don't store the price
  // on the subscription row — we join through product_id. For now, we
  // return the count and let the caller multiply; a proper MRR needs the
  // products table.
  const churned = subs.filter(
    (s) => s.status === "canceled" && s.updated_at >= monthStart
  );

  return {
    activeCount: active.length,
    mrrCents: 0, // caller computes from products join
    churnedThisMonth: churned.length,
  };
}

/**
 * Creates a Stripe Checkout session in SUBSCRIPTION mode for a
 * recurring product. Uses destination charges with application_fee_percent.
 */
export async function createSubscriptionCheckout(params: {
  account: PaymentsAccount;
  product: {
    stripe_price_id: string;
    id: string;
    name: string;
  };
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  trialDays?: number;
  couponId?: string;
}): Promise<{ ok: true; url: string; sessionId: string } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };
  if (!params.account.charges_enabled) return { ok: false, reason: "charges_not_enabled" };

  try {
    const stripe = createStripeClient();
    const { getSiteUrl } = await import("@/lib/site-url");
    const base = getSiteUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: params.product.stripe_price_id, quantity: 1 }],
      subscription_data: {
        application_fee_percent: 2.5,
        transfer_data: { destination: params.account.stripe_account_id },
        ...(params.trialDays ? { trial_period_days: params.trialDays } : {}),
        metadata: {
          ionexa_user_id: params.account.user_id,
          ionexa_product_id: params.product.id,
          ionexa_account_id: params.account.id,
          platform: "ionexa_payments",
        },
      },
      ...(params.couponId
        ? { discounts: [{ coupon: params.couponId }] }
        : {}),
      success_url: params.successUrl || `${base}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: params.cancelUrl || `${base}/pay/cancel`,
      customer_email: params.customerEmail || undefined,
      metadata: {
        ionexa_user_id: params.account.user_id,
        ionexa_product_id: params.product.id,
        ionexa_account_id: params.account.id,
        platform: "ionexa_payments",
      },
    });

    if (!session.url) return { ok: false, reason: "no_url" };
    return { ok: true, url: session.url, sessionId: session.id };
  } catch (err) {
    logApiError("payments:subscription-checkout", err, { userId: params.account.user_id });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * Records a new subscription in our database. Called from webhook when
 * customer.subscription.created fires with our platform metadata.
 */
export async function recordSubscription(params: {
  userId: string;
  accountId: string;
  productId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: PaymentsSubscription["status"];
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  customerEmail: string | null;
  customerName: string | null;
}): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("payments_subscriptions").upsert(
      {
        user_id: params.userId,
        account_id: params.accountId,
        product_id: params.productId,
        stripe_subscription_id: params.stripeSubscriptionId,
        stripe_customer_id: params.stripeCustomerId,
        status: params.status,
        current_period_start: params.currentPeriodStart,
        current_period_end: params.currentPeriodEnd,
        cancel_at_period_end: params.cancelAtPeriodEnd,
        trial_end: params.trialEnd,
        customer_email: params.customerEmail,
        customer_name: params.customerName,
      },
      { onConflict: "stripe_subscription_id" }
    );
    if (error) {
      logApiError("payments:record-subscription", error, params);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logApiError("payments:record-subscription", err, params);
    return { ok: false };
  }
}

/**
 * Updates an existing subscription's status. Called from webhooks:
 * customer.subscription.updated, customer.subscription.deleted.
 */
export async function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: PaymentsSubscription["status"],
  updates?: Partial<Pick<PaymentsSubscription, "cancel_at_period_end" | "current_period_start" | "current_period_end" | "trial_end">>
): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("payments_subscriptions")
      .update({ status, ...updates, updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", stripeSubscriptionId);
    if (error) {
      logApiError("payments:update-subscription-status", error, { stripeSubscriptionId, status });
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logApiError("payments:update-subscription-status", err, { stripeSubscriptionId });
    return { ok: false };
  }
}

/**
 * Cancels a subscription at period end (graceful cancel — the customer
 * keeps access until the period expires). The SELLER triggers this.
 */
export async function cancelSubscription(params: {
  account: PaymentsAccount;
  stripeSubscriptionId: string;
  immediately?: boolean;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };

  try {
    const stripe = createStripeClient();
    if (params.immediately) {
      await stripe.subscriptions.cancel(params.stripeSubscriptionId, {}, {
        stripeAccount: params.account.stripe_account_id,
      });
    } else {
      await stripe.subscriptions.update(
        params.stripeSubscriptionId,
        { cancel_at_period_end: true },
        { stripeAccount: params.account.stripe_account_id }
      );
    }
    return { ok: true };
  } catch (err) {
    logApiError("payments:cancel-subscription", err, { stage: "cancel", stripeSubId: params.stripeSubscriptionId });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * Creates a Stripe Customer Portal session so the END customer can
 * manage their own subscription (update payment method, cancel, etc.).
 */
export async function createCustomerPortal(params: {
  account: PaymentsAccount;
  stripeCustomerId: string;
  returnUrl?: string;
}): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };

  try {
    const stripe = createStripeClient();
    const { getSiteUrl } = await import("@/lib/site-url");
    const base = getSiteUrl();

    const session = await stripe.billingPortal.sessions.create(
      {
        customer: params.stripeCustomerId,
        return_url: params.returnUrl || `${base}/pay/success`,
      },
      { stripeAccount: params.account.stripe_account_id }
    );

    return { ok: true, url: session.url };
  } catch (err) {
    logApiError("payments:customer-portal", err, { stage: "portal", stripeCustomerId: params.stripeCustomerId });
    return { ok: false, reason: "stripe_error" };
  }
}
