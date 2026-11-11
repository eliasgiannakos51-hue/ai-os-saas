import "server-only";
import { createStripeClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { paymentsConfigured, type PaymentsAccount } from "./connect";

/**
 * IONEXA PAYMENTS — BALANCE & TRANSACTIONS.
 *
 * Reads the connected account's balance from Stripe (the truth), and
 * transaction history from our database (a copy written by webhooks).
 *
 * THE BALANCE IS STRIPE'S, NOT OURS. We read it from Stripe on every
 * request rather than caching it, because a stale balance that shows
 * money available when it isn't is worse than a slow page.
 */

export type PaymentsBalance = {
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
  /** Total available across all currencies, in the account's default currency. */
  totalAvailableCents: number;
  /** Total pending across all currencies, in the account's default currency. */
  totalPendingCents: number;
};

export async function getBalance(
  account: PaymentsAccount
): Promise<{ ok: true; balance: PaymentsBalance } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };
  if (!account.payouts_enabled) return { ok: false, reason: "payouts_not_enabled" };

  try {
    const stripe = createStripeClient();
    const balance = await stripe.balance.retrieve(
      {},
      { stripeAccount: account.stripe_account_id }
    );

    const available = balance.available.map((b) => ({
      amount: b.amount,
      currency: b.currency,
    }));
    const pending = balance.pending.map((b) => ({
      amount: b.amount,
      currency: b.currency,
    }));

    // Sum in the default currency (usually there's only one).
    const defaultCur = account.default_currency ?? "eur";
    const totalAvailableCents = available
      .filter((b) => b.currency === defaultCur)
      .reduce((sum, b) => sum + b.amount, 0);
    const totalPendingCents = pending
      .filter((b) => b.currency === defaultCur)
      .reduce((sum, b) => sum + b.amount, 0);

    return {
      ok: true,
      balance: { available, pending, totalAvailableCents, totalPendingCents },
    };
  } catch (err) {
    logApiError("payments:balance", err, { accountId: account.id });
    return { ok: false, reason: "stripe_error" };
  }
}

export type PaymentsTransaction = {
  id: string;
  product_id: string | null;
  amount_cents: number;
  currency: string;
  fee_cents: number;
  net_cents: number;
  status: string;
  customer_email: string | null;
  customer_name: string | null;
  description: string | null;
  created_at: string;
};

export async function listTransactions(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ transactions: PaymentsTransaction[]; total: number }> {
  const { data, error, count } = await admin
    .from("payments_transactions")
    .select("id, product_id, amount_cents, currency, fee_cents, net_cents, status, customer_email, customer_name, description, created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logApiError("payments:list-transactions", error, { userId });
    return { transactions: [], total: 0 };
  }
  return { transactions: data ?? [], total: count ?? 0 };
}

export type PaymentsPayout = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  arrival_date: string | null;
  failure_reason: string | null;
  created_at: string;
};

export async function listPayouts(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  limit = 20
): Promise<PaymentsPayout[]> {
  const { data, error } = await admin
    .from("payments_payouts")
    .select("id, amount_cents, currency, status, arrival_date, failure_reason, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logApiError("payments:list-payouts", error, { userId });
    return [];
  }
  return data ?? [];
}

/**
 * Triggers an instant payout to the user's bank account.
 * Only available if their account supports it (payouts_enabled).
 */
export async function requestPayout(
  admin: ReturnType<typeof createAdminClient>,
  account: PaymentsAccount,
  amountCents: number,
  currency?: string
): Promise<{ ok: true; payoutId: string } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };
  if (!account.payouts_enabled) return { ok: false, reason: "payouts_not_enabled" };
  if (amountCents <= 0) return { ok: false, reason: "invalid_amount" };

  try {
    const stripe = createStripeClient();
    const cur = currency ?? account.default_currency ?? "eur";

    const payout = await stripe.payouts.create(
      {
        amount: amountCents,
        currency: cur,
        metadata: {
          ionexa_user_id: account.user_id,
          platform: "ionexa_payments",
        },
      },
      { stripeAccount: account.stripe_account_id }
    );

    const { error } = await admin.from("payments_payouts").insert({
      user_id: account.user_id,
      account_id: account.id,
      stripe_payout_id: payout.id,
      amount_cents: amountCents,
      currency: cur,
      status: payout.status,
      arrival_date: payout.arrival_date
        ? new Date(payout.arrival_date * 1000).toISOString()
        : null,
    });

    if (error) {
      logApiError("payments:request-payout-store", error, { userId: account.user_id });
      // The payout was created in Stripe even if we failed to record it.
      // It will arrive — we just won't show it until the webhook tells us.
    }

    return { ok: true, payoutId: payout.id };
  } catch (err) {
    logApiError("payments:request-payout", err, { userId: account.user_id });
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("insufficient")) return { ok: false, reason: "insufficient_balance" };
    return { ok: false, reason: "stripe_error" };
  }
}
