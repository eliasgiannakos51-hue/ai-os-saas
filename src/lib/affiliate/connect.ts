import "server-only";
import { createStripeClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";
import type { AffiliateRow } from "@/lib/affiliate/store";

// Stripe Connect, for paying affiliates.
//
// EXPRESS ACCOUNTS, not Custom. Express means Stripe hosts the onboarding,
// collects the identity documents and the bank details, and owns the KYC
// obligation. Custom would mean this app collects a stranger's passport
// scan and IBAN — a compliance surface with no upside for a commission
// programme, and one that would immediately be the most sensitive data in
// the product.
//
// This is the first Connect code in the app. It is written to be the
// general "pay somebody who is not us" layer rather than an
// affiliate-specific one, because the Marketplace will need exactly this
// and a second copy would be a second set of webhooks to keep in sync.
//
// PAYOUTS_ENABLED IS STRIPE'S FLAG, NEVER OURS. It is only ever written
// from a value read off a Stripe account object. Setting it from anything
// else — a successful onboarding redirect, say — would mark an account
// payable before Stripe had verified anybody, and the transfer would fail
// later with the money already marked paid.

export function connectConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Creates the Connect account if it does not exist, and returns a
 * one-time onboarding link.
 *
 * Onboarding links expire and are single-use by design, so this is called
 * fresh every time the affiliate presses the button rather than stored.
 */
export async function createOnboardingLink(params: {
  affiliate: AffiliateRow;
  email: string | null;
}): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!connectConfigured()) return { ok: false, reason: "not_configured" };
  try {
    const stripe = createStripeClient();
    const admin = createAdminClient();
    let accountId = params.affiliate.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: params.email ?? undefined,
        // Transfers only. This account receives commission; it never
        // charges anybody, so it is not asked for the card-payment
        // capabilities it would otherwise be onboarded for.
        capabilities: { transfers: { requested: true } },
        business_type: "individual",
        metadata: { ionexa_affiliate_id: params.affiliate.id },
      });
      accountId = account.id;
      const { error } = await admin
        .from("affiliates")
        .update({ stripe_account_id: accountId })
        .eq("id", params.affiliate.id);
      if (error) {
        // The account exists at Stripe but is not linked here. Recording
        // it is what makes the next call reuse it instead of creating a
        // second one for the same person, so this is a hard failure.
        logApiError("affiliate:connect", error, { stage: "store_account_id" });
        return { ok: false, reason: "store_failed" };
      }
    }

    const base = getSiteUrl();
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/dashboard/affiliate?connect=refresh`,
      return_url: `${base}/dashboard/affiliate?connect=done`,
      type: "account_onboarding",
    });
    return { ok: true, url: link.url };
  } catch (err) {
    logApiError("affiliate:connect", err, { affiliateId: params.affiliate.id });
    return { ok: false, reason: "stripe_error" };
  }
}

/**
 * Re-reads the account from Stripe and stores whether it can be paid.
 *
 * Called when the affiliate lands back from onboarding and before any
 * payout run. Cheap, and the alternative — trusting the redirect — marks
 * accounts payable that Stripe has not finished verifying.
 */
export async function refreshPayoutsEnabled(affiliate: AffiliateRow): Promise<boolean> {
  if (!affiliate.stripe_account_id || !connectConfigured()) return false;
  try {
    const stripe = createStripeClient();
    const account = await stripe.accounts.retrieve(affiliate.stripe_account_id);
    // BOTH flags. payouts_enabled alone can be true on an account that
    // still owes information, in which case the transfer is accepted and
    // then held indefinitely — which looks to the affiliate exactly like
    // being paid and then not being paid.
    const enabled = Boolean(account.payouts_enabled) && account.requirements?.disabled_reason == null;
    if (enabled !== affiliate.payouts_enabled) {
      const admin = createAdminClient();
      await admin
        .from("affiliates")
        .update({ payouts_enabled: enabled })
        .eq("id", affiliate.id);
    }
    return enabled;
  } catch (err) {
    logApiError("affiliate:connect", err, { stage: "refresh", affiliateId: affiliate.id });
    return false;
  }
}

/**
 * Sends money.
 *
 * The commission rows are claimed FIRST, in one atomic statement
 * (claim_affiliate_commissions), and only what that claim returns is
 * transferred. Two concurrent payout runs cannot both send the same
 * balance because the second one claims nothing.
 *
 * If the transfer then fails, the claimed rows are put back to accrued —
 * money not sent must not stay marked paid, or it is silently written off.
 */
export async function payoutAffiliate(
  affiliate: AffiliateRow
): Promise<{ ok: true; amountCents: number } | { ok: false; reason: string }> {
  if (!connectConfigured()) return { ok: false, reason: "not_configured" };
  if (!affiliate.stripe_account_id) return { ok: false, reason: "no_connect_account" };

  const admin = createAdminClient();
  const { data: payoutRow, error: payoutError } = await admin
    .from("affiliate_payouts")
    // 1 cent is a placeholder that satisfies the > 0 CHECK; the real
    // amount is written once the claim below reports it.
    .insert({ affiliate_id: affiliate.id, amount_cents: 1, status: "pending" })
    .select("id")
    .single();
  if (payoutError || !payoutRow) {
    logApiError("affiliate:payout", payoutError, { affiliateId: affiliate.id });
    return { ok: false, reason: "payout_row_failed" };
  }
  const payoutId = (payoutRow as { id: string }).id;

  const { data: claimed, error: claimError } = await admin.rpc("claim_affiliate_commissions", {
    p_affiliate_id: affiliate.id,
    p_payout_id: payoutId,
  });
  if (claimError) {
    logApiError("affiliate:payout", claimError, { stage: "claim", affiliateId: affiliate.id });
    await admin.from("affiliate_payouts").delete().eq("id", payoutId);
    return { ok: false, reason: "claim_failed" };
  }
  const amountCents = Number(claimed ?? 0);
  if (amountCents <= 0) {
    await admin.from("affiliate_payouts").delete().eq("id", payoutId);
    return { ok: false, reason: "nothing_to_pay" };
  }

  try {
    const stripe = createStripeClient();
    const transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency: "eur",
        destination: affiliate.stripe_account_id,
        metadata: { ionexa_payout_id: payoutId, ionexa_affiliate_id: affiliate.id },
      },
      // Stripe's own replay protection, keyed on OUR payout row. A retry
      // of this function with the same payout id cannot move the money
      // twice even if the first response was lost in flight.
      { idempotencyKey: `affiliate_payout_${payoutId}` }
    );
    await admin
      .from("affiliate_payouts")
      .update({
        amount_cents: amountCents,
        stripe_transfer_id: transfer.id,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", payoutId);
    return { ok: true, amountCents };
  } catch (err) {
    // Put the money back. A failed transfer whose commissions stay 'paid'
    // is a silent write-off of somebody's earnings.
    await admin
      .from("affiliate_commissions")
      .update({ status: "accrued", payout_id: null })
      .eq("payout_id", payoutId);
    await admin
      .from("affiliate_payouts")
      .update({
        amount_cents: amountCents,
        status: "failed",
        failure_reason: err instanceof Error ? err.message.slice(0, 300) : "unknown",
      })
      .eq("id", payoutId);
    logApiError("affiliate:payout", err, { stage: "transfer", affiliateId: affiliate.id });
    return { ok: false, reason: "transfer_failed" };
  }
}
