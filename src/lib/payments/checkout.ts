import "server-only";
import { createStripeClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";
import { paymentsConfigured, type PaymentsAccount } from "./connect";
import { type PaymentsProduct, PLATFORM_FEE_PERCENT } from "./products";

/**
 * IONEXA PAYMENTS — CHECKOUT.
 *
 * Creates Stripe Checkout sessions for the Ionexa user's OWN customers
 * to pay through. Uses destination charges: the payment is made to the
 * PLATFORM (us), and we transfer the net amount to the connected account,
 * keeping the platform fee.
 *
 * WHY DESTINATION CHARGES AND NOT DIRECT: destination charges let us
 * control the checkout experience and handle disputes. The user sees the
 * net; their customer sees the product name and description, not "Ionexa".
 *
 * THE PLATFORM FEE: 2.5% of the payment amount, on top of Stripe's own
 * processing fee (~1.5% + €0.25 in Europe). So the user pays ~4% total,
 * which is competitive with Stripe's own pricing for platforms.
 */

/**
 * Creates a checkout session for the user's customer to pay.
 * Returns a URL the customer can be redirected to.
 */
export async function createPaymentCheckout(params: {
  account: PaymentsAccount;
  product: PaymentsProduct;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
}): Promise<{ ok: true; url: string; sessionId: string } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };
  if (!params.account.charges_enabled) return { ok: false, reason: "charges_not_enabled" };

  try {
    const stripe = createStripeClient();
    const base = getSiteUrl();
    const platformFee = Math.round(params.product.price_cents * PLATFORM_FEE_PERCENT / 100);

    // Recurring products use SUBSCRIPTION mode with application_fee_percent
    // on subscription_data. One-time products use PAYMENT mode with a
    // fixed application_fee_amount on payment_intent_data.
    const isRecurring = params.product.is_recurring;

    const session = await stripe.checkout.sessions.create({
      mode: isRecurring ? "subscription" : "payment",
      line_items: [{ price: params.product.stripe_price_id!, quantity: 1 }],
      // DESTINATION CHARGE: one-time → application_fee_amount on the
      // payment intent; recurring → application_fee_percent on the
      // subscription (Stripe applies it to every invoice automatically).
      ...(isRecurring
        ? {
            subscription_data: {
              application_fee_percent: PLATFORM_FEE_PERCENT,
              transfer_data: { destination: params.account.stripe_account_id },
              metadata: {
                ionexa_user_id: params.account.user_id,
                ionexa_product_id: params.product.id,
                ionexa_account_id: params.account.id,
                platform: "ionexa_payments",
              },
            },
          }
        : {
            payment_intent_data: {
              application_fee_amount: platformFee,
              transfer_data: { destination: params.account.stripe_account_id },
            },
          }),
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
    logApiError("payments:checkout", err, { userId: params.account.user_id });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * Generates a shareable payment link for a product.
 */
export function paymentLinkUrl(productId: string): string {
  return `${getSiteUrl()}/pay/${productId}`;
}

/**
 * Records a successful payment in our database.
 * Called from the webhook when a checkout.session.completed fires
 * with our platform metadata.
 */
export async function recordPayment(params: {
  userId: string;
  accountId: string;
  productId: string | null;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string;
  amountCents: number;
  currency: string;
  feeCents: number;
  customerEmail: string | null;
  customerName: string | null;
  description: string | null;
}): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("payments_transactions").insert({
      user_id: params.userId,
      account_id: params.accountId,
      product_id: params.productId,
      stripe_payment_intent_id: params.stripePaymentIntentId,
      stripe_checkout_session_id: params.stripeCheckoutSessionId,
      amount_cents: params.amountCents,
      currency: params.currency,
      fee_cents: params.feeCents,
      net_cents: params.amountCents - params.feeCents,
      status: "succeeded",
      customer_email: params.customerEmail,
      customer_name: params.customerName,
      description: params.description,
    });
    if (error) {
      logApiError("payments:record-payment", error, params);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logApiError("payments:record-payment", err, params);
    return { ok: false };
  }
}
