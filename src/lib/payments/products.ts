import "server-only";
import { createStripeClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { paymentsConfigured, type PaymentsAccount } from "./connect";

/**
 * IONEXA PAYMENTS — PRODUCTS.
 *
 * A product is something the Ionexa user sells to THEIR customers.
 * Each product gets a Stripe Product + Price on the user's connected
 * account, and a checkout link their customers can pay through.
 *
 * DESTINATION CHARGES: the payment goes to Stripe, Stripe takes its fee
 * + our platform fee, and the rest lands in the user's connected account.
 * The platform fee is configured in the checkout session, not here.
 */

export type PaymentsProduct = {
  id: string;
  user_id: string;
  account_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  is_active: boolean;
  is_recurring: boolean;
  recurring_interval: "month" | "year" | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

/** The platform fee percentage on each payment. */
export const PLATFORM_FEE_PERCENT = 2.5;

/** Minimum product price in cents. */
export const MIN_PRICE_CENTS = 100; // €1.00

/** Maximum product price in cents. */
export const MAX_PRICE_CENTS = 99_999_900; // €999,999.00

export async function listProducts(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<PaymentsProduct[]> {
  const { data, error } = await admin
    .from("payments_products")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    logApiError("payments:list-products", error, { userId });
    return [];
  }
  return data ?? [];
}

export async function getProduct(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  productId: string
): Promise<PaymentsProduct | null> {
  const { data, error } = await admin
    .from("payments_products")
    .select("*")
    .eq("id", productId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logApiError("payments:get-product", error, { userId, productId });
    return null;
  }
  return data;
}

export async function createProduct(
  admin: ReturnType<typeof createAdminClient>,
  account: PaymentsAccount,
  params: {
    name: string;
    description?: string;
    priceCents: number;
    currency?: string;
    isRecurring?: boolean;
    recurringInterval?: "month" | "year";
    imageUrl?: string;
  }
): Promise<{ ok: true; product: PaymentsProduct } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };
  if (!account.charges_enabled) return { ok: false, reason: "charges_not_enabled" };
  if (params.priceCents < MIN_PRICE_CENTS || params.priceCents > MAX_PRICE_CENTS) {
    return { ok: false, reason: "invalid_price" };
  }

  try {
    const stripe = createStripeClient();

    // Create product on the user's connected account.
    const stripeProduct = await stripe.products.create(
      {
        name: params.name,
        description: params.description || undefined,
        metadata: { ionexa_user_id: account.user_id },
      },
      { stripeAccount: account.stripe_account_id }
    );

    // Create price on the user's connected account.
    const currency = params.currency ?? account.default_currency ?? "eur";
    const stripePrice = await stripe.prices.create(
      {
        product: stripeProduct.id,
        unit_amount: params.priceCents,
        currency,
        ...(params.isRecurring && params.recurringInterval
          ? { recurring: { interval: params.recurringInterval } }
          : {}),
      },
      { stripeAccount: account.stripe_account_id }
    );

    const { data, error } = await admin
      .from("payments_products")
      .insert({
        user_id: account.user_id,
        account_id: account.id,
        name: params.name,
        description: params.description ?? null,
        price_cents: params.priceCents,
        currency: params.currency ?? account.default_currency ?? "eur",
        stripe_product_id: stripeProduct.id,
        stripe_price_id: stripePrice.id,
        is_recurring: params.isRecurring ?? false,
        recurring_interval: params.recurringInterval ?? null,
        image_url: params.imageUrl ?? null,
      })
      .select("*")
      .single();

    if (error) {
      logApiError("payments:create-product", error, { userId: account.user_id });
      return { ok: false, reason: "store_failed" };
    }
    return { ok: true, product: data };
  } catch (err) {
    logApiError("payments:create-product", err, { userId: account.user_id });
    return { ok: false, reason: "stripe_error" };
  }
}

export async function deactivateProduct(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  productId: string
): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await admin
    .from("payments_products")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("user_id", userId);
  if (error) {
    logApiError("payments:deactivate-product", error, { userId, productId });
    return { ok: false, reason: "update_failed" };
  }
  return { ok: true };
}
