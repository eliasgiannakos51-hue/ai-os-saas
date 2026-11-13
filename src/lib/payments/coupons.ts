import "server-only";
import { createStripeClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { paymentsConfigured, type PaymentsAccount } from "./connect";

/**
 * IONEXA PAYMENTS — COUPONS & DISCOUNTS.
 *
 * Sellers create coupons for their own customers. Each coupon is a
 * Stripe Coupon on the seller's connected account + a local row.
 * Coupons can be percentage-off or fixed-amount-off, with optional
 * duration (once, repeating, forever) and max redemptions.
 */

export type PaymentsCoupon = {
  id: string;
  user_id: string;
  account_id: string;
  code: string;
  stripe_coupon_id: string;
  percent_off: number | null;
  amount_off_cents: number | null;
  currency: string;
  duration: "once" | "repeating" | "forever";
  duration_months: number | null;
  max_redemptions: number | null;
  times_redeemed: number;
  is_active: boolean;
  created_at: string;
};

export async function listCoupons(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<PaymentsCoupon[]> {
  const { data, error } = await admin
    .from("payments_coupons")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    logApiError("payments:list-coupons", error, { userId });
    return [];
  }
  return data ?? [];
}

export async function createCoupon(
  admin: ReturnType<typeof createAdminClient>,
  account: PaymentsAccount,
  params: {
    code: string;
    percentOff?: number;
    amountOffCents?: number;
    currency?: string;
    duration?: "once" | "repeating" | "forever";
    durationMonths?: number;
    maxRedemptions?: number;
  }
): Promise<{ ok: true; coupon: PaymentsCoupon } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };
  if (!params.percentOff && !params.amountOffCents) {
    return { ok: false, reason: "no_discount" };
  }
  if (params.percentOff && (params.percentOff < 1 || params.percentOff > 100)) {
    return { ok: false, reason: "invalid_percent" };
  }

  try {
    const stripe = createStripeClient();
    const currency = params.currency ?? account.default_currency ?? "eur";
    const duration = params.duration ?? "once";

    const stripeCoupon = await stripe.coupons.create(
      {
        ...(params.percentOff ? { percent_off: params.percentOff } : {}),
        ...(params.amountOffCents
          ? { amount_off: params.amountOffCents, currency }
          : {}),
        duration,
        ...(duration === "repeating" && params.durationMonths
          ? { duration_in_months: params.durationMonths }
          : {}),
        ...(params.maxRedemptions
          ? { max_redemptions: params.maxRedemptions }
          : {}),
        name: params.code,
        metadata: {
          ionexa_user_id: account.user_id,
          platform: "ionexa_payments",
        },
      },
      { stripeAccount: account.stripe_account_id }
    );

    // Also create a promotion code (the human-readable code customers type).
    // Stripe SDK types differ between versions; cast through unknown.
    await stripe.promotionCodes.create({
      coupon: stripeCoupon.id,
      code: params.code.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      ...(params.maxRedemptions
        ? { max_redemptions: params.maxRedemptions }
        : {}),
    } as unknown as Parameters<typeof stripe.promotionCodes.create>[0],
      { stripeAccount: account.stripe_account_id }
    );

    const { data, error } = await admin.from("payments_coupons").insert({
      user_id: account.user_id,
      account_id: account.id,
      code: params.code.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      stripe_coupon_id: stripeCoupon.id,
      percent_off: params.percentOff ?? null,
      amount_off_cents: params.amountOffCents ?? null,
      currency,
      duration,
      duration_months: duration === "repeating" ? (params.durationMonths ?? null) : null,
      max_redemptions: params.maxRedemptions ?? null,
      times_redeemed: 0,
      is_active: true,
    }).select().single();

    if (error) {
      logApiError("payments:create-coupon", error, { userId: account.user_id });
      return { ok: false, reason: "db_error" };
    }

    return { ok: true, coupon: data };
  } catch (err) {
    logApiError("payments:create-coupon", err, { stage: "stripe", userId: account.user_id });
    return { ok: false, reason: "stripe_error" };
  }
}

export async function deactivateCoupon(
  admin: ReturnType<typeof createAdminClient>,
  account: PaymentsAccount,
  couponId: string
): Promise<{ ok: boolean }> {
  try {
    const { data: coupon } = await admin
      .from("payments_coupons")
      .select("stripe_coupon_id")
      .eq("id", couponId)
      .eq("user_id", account.user_id)
      .single();

    if (!coupon) return { ok: false };

    const stripe = createStripeClient();
    await stripe.coupons.del(coupon.stripe_coupon_id, {
      stripeAccount: account.stripe_account_id,
    });

    await admin
      .from("payments_coupons")
      .update({ is_active: false })
      .eq("id", couponId);

    return { ok: true };
  } catch (err) {
    logApiError("payments:deactivate-coupon", err, { stage: "deactivate", couponId });
    return { ok: false };
  }
}
