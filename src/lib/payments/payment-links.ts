import "server-only";
import { createStripeClient } from "@/lib/stripe/server";
import { logApiError } from "@/lib/log-error";
import { paymentsConfigured, type PaymentsAccount } from "./connect";
import { type PaymentsProduct, PLATFORM_FEE_PERCENT } from "./products";

/**
 * IONEXA PAYMENTS — PAYMENT LINKS.
 *
 * Creates Stripe Payment Links for the user's products. These are
 * shareable URLs that the seller can send to anyone — no website needed.
 * Each link uses destination charges with the platform fee, same as
 * the checkout flow.
 *
 * The link is created on Stripe and stored on the product row.
 */

/**
 * Creates a Stripe Payment Link for a product. For recurring products,
 * uses subscription mode with application_fee_percent.
 */
export async function createPaymentLink(params: {
  account: PaymentsAccount;
  product: PaymentsProduct;
}): Promise<{ ok: true; url: string; linkId: string } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };
  if (!params.account.charges_enabled) return { ok: false, reason: "charges_not_enabled" };
  if (!params.product.stripe_price_id) return { ok: false, reason: "no_price" };

  try {
    const stripe = createStripeClient();

    const link = await stripe.paymentLinks.create(
      {
        line_items: [{ price: params.product.stripe_price_id, quantity: 1 }],
        // Application fee: for one-time products, use application_fee_amount.
        // For recurring, use application_fee_percent on subscription_data.
        ...(params.product.is_recurring
          ? {
              subscription_data: {
                metadata: {
                  ionexa_user_id: params.account.user_id,
                  ionexa_product_id: params.product.id,
                  ionexa_account_id: params.account.id,
                  platform: "ionexa_payments",
                },
              },
              application_fee_percent: PLATFORM_FEE_PERCENT,
            }
          : {
              application_fee_amount: Math.round(
                params.product.price_cents * PLATFORM_FEE_PERCENT / 100
              ),
            }),
        transfer_data: { destination: params.account.stripe_account_id },
        metadata: {
          ionexa_user_id: params.account.user_id,
          ionexa_product_id: params.product.id,
          platform: "ionexa_payments",
        },
      },
      { stripeAccount: params.account.stripe_account_id }
    );

    return { ok: true, url: link.url, linkId: link.id };
  } catch (err) {
    logApiError("payments:create-payment-link", err, {
      stage: "create",
      productId: params.product.id,
    });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * Generates the embed snippet for a buy button. Returns HTML/JS that the
 * seller can paste into any website. The button opens the Ionexa pay page
 * in a new tab.
 */
export function generateBuyButtonSnippet(params: {
  productId: string;
  productName: string;
  priceCents: number;
  currency: string;
  siteUrl: string;
  buttonText?: string;
  locale?: string;
}): string {
  const url = `${params.siteUrl}/pay/${params.productId}`;
  const text = params.buttonText || `Buy ${params.productName}`;
  const price = (params.priceCents / 100).toFixed(2);
  const cur = params.currency.toUpperCase();

  return `<!-- Ionexa Buy Button -->
<a href="${url}" target="_blank" rel="noopener"
   style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;
          background:#18181b;color:#fafafa;border-radius:8px;font-family:system-ui;
          font-size:14px;font-weight:500;text-decoration:none;cursor:pointer"
   data-ionexa-product="${params.productId}">
  ${text} — ${cur} ${price}
</a>`;
}
