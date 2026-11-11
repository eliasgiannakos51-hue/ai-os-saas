import "server-only";
import { createStripeClient } from "@/lib/stripe/server";
// createAdminClient is the only way to build the `admin` parameter the
// functions below take. Importing it here is checked by
// security-posture.test.mjs (§2): every file that touches an
// ADMIN_ONLY_TABLES table must name createAdminClient so the link from
// caller to deny-all table is grep-visible.
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";

/**
 * IONEXA PAYMENTS — CONNECT.
 *
 * Stripe Connect Express, the SAME kind the affiliate programme uses
 * (lib/affiliate/connect.ts). Express means Stripe hosts the onboarding,
 * collects the identity documents and the bank details, and owns the KYC
 * obligation. Custom would mean this app collects a stranger's passport
 * scan and IBAN — a compliance surface with no upside.
 *
 * THE DIFFERENCE FROM THE AFFILIATE LAYER: affiliates can only RECEIVE
 * transfers from us. Payments accounts can CHARGE customers directly
 * (destination charges). That is why `capabilities` requests both
 * `transfers` and `card_payments`.
 *
 * PAYOUTS_ENABLED IS STRIPE'S FLAG, NEVER OURS. The same rule as
 * lib/affiliate/connect.ts, for the same reason.
 */

export function paymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export type PaymentsAccount = {
  id: string;
  user_id: string;
  stripe_account_id: string;
  business_name: string | null;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  details_submitted: boolean;
  country: string | null;
  default_currency: string;
  created_at: string;
  updated_at: string;
};

/**
 * Reads the user's payments account, or null if they haven't connected.
 */
export async function getPaymentsAccount(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<PaymentsAccount | null> {
  const { data, error } = await admin
    .from("payments_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logApiError("payments:get-account", error, { userId });
    return null;
  }
  return data;
}

/**
 * Creates the Connect account if it does not exist, and returns a
 * one-time onboarding link.
 *
 * Onboarding links expire and are single-use by design, so this is called
 * fresh every time the user presses the button rather than stored.
 */
export async function createPaymentsOnboardingLink(params: {
  userId: string;
  email: string;
  existingAccount: PaymentsAccount | null;
}): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };

  try {
    const stripe = createStripeClient();
    const admin = createAdminClient();
    let stripeAccountId = params.existingAccount?.stripe_account_id;

    if (!stripeAccountId) {
      // Create a new Express account that can CHARGE customers AND
      // receive transfers. This is the key difference from the affiliate
      // layer which only needs transfers.
      const account = await stripe.accounts.create({
        type: "express",
        email: params.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          ionexa_user_id: params.userId,
          platform: "ionexa_payments",
        },
      });
      stripeAccountId = account.id;

      const { error } = await admin.from("payments_accounts").insert({
        user_id: params.userId,
        stripe_account_id: stripeAccountId,
      });
      if (error) {
        logApiError("payments:connect", error, { stage: "store_account_id" });
        return { ok: false, reason: "store_failed" };
      }
    }

    const base = getSiteUrl();
    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${base}/dashboard/payments?connect=refresh`,
      return_url: `${base}/dashboard/payments?connect=done`,
      type: "account_onboarding",
    });
    return { ok: true, url: link.url };
  } catch (err) {
    logApiError("payments:connect", err, { userId: params.userId });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * Re-reads the account from Stripe and stores the latest status.
 *
 * Called when the user lands back from onboarding and periodically.
 * Cheap, and the alternative — trusting the redirect — marks
 * accounts active that Stripe has not finished verifying.
 */
export async function refreshPaymentsAccount(
  admin: ReturnType<typeof createAdminClient>,
  account: PaymentsAccount
): Promise<PaymentsAccount> {
  if (!paymentsConfigured()) return account;

  try {
    const stripe = createStripeClient();
    const stripeAccount = await stripe.accounts.retrieve(account.stripe_account_id);

    const updates = {
      payouts_enabled: stripeAccount.payouts_enabled ?? false,
      charges_enabled: stripeAccount.charges_enabled ?? false,
      details_submitted: stripeAccount.details_submitted ?? false,
      business_name:
        stripeAccount.business_profile?.name ??
        stripeAccount.settings?.dashboard?.display_name ??
        account.business_name,
      country: stripeAccount.country ?? account.country,
      default_currency: stripeAccount.default_currency ?? account.default_currency,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("payments_accounts")
      .update(updates)
      .eq("id", account.id)
      .select("*")
      .single();

    if (error) {
      logApiError("payments:refresh", error, { accountId: account.id });
      return { ...account, ...updates };
    }
    return data;
  } catch (err) {
    logApiError("payments:refresh", err, { accountId: account.id });
    return account;
  }
}

/**
 * Creates a Stripe login link so the user can access their Express
 * dashboard (transactions, payouts, settings).
 */
export async function createDashboardLink(
  account: PaymentsAccount
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!paymentsConfigured()) return { ok: false, reason: "not_configured" };
  if (!account.details_submitted) return { ok: false, reason: "onboarding_incomplete" };

  try {
    const stripe = createStripeClient();
    const link = await stripe.accounts.createLoginLink(account.stripe_account_id);
    return { ok: true, url: link.url };
  } catch (err) {
    logApiError("payments:dashboard-link", err, { accountId: account.id });
    return { ok: false, reason: "stripe_error" };
  }
}
