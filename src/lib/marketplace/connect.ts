import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";

/**
 * Stripe Connect (Express), and the reasons this feature ships dark.
 *
 * Taking a stranger's money and paying part of it to a third party is
 * regulated. Stripe requires a legally accountable platform behind a
 * Connect account, and this deployment does not have one until the
 * company behind it exists — so `MARKETPLACE_ENABLED` is off and every
 * money path refuses with a plain "not open yet" rather than
 * half-working. Building it now and switching it on later is the whole
 * point: the alternative is writing payment code under the time pressure
 * of a company that has just been formed.
 *
 * DESTINATION CHARGES, not direct charges. The platform is the merchant
 * of record: the buyer's card is charged by us, the funds land in our
 * balance, and Stripe transfers the seller's share to their connected
 * account minus an `application_fee_amount`. It is the more onerous
 * option for us — we own the chargeback and the refund — and it is the
 * right one for a marketplace of digital goods a buyer receives
 * instantly, because the alternative puts a customer's dispute in front
 * of a seller who has no way to answer it and no relationship with the
 * buyer's bank.
 *
 * ONBOARDING IS A LINK, NEVER A FORM OF OURS. Identity documents, bank
 * details and tax information go to Stripe's hosted flow. We never see
 * them, so we cannot leak them.
 */

export type SellerAccountRow = {
  user_id: string;
  stripe_account_id: string | null;
  onboarding_status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  country: string | null;
};

/** Stripe's verdict, translated into the two booleans this app stores.
 *  Read from the account object rather than remembered from onboarding:
 *  Stripe can restrict an account at any time, and an account that
 *  passed onboarding last month is not evidence about today. */
export function readAccountCapability(account: Stripe.Account): {
  onboarding_status: SellerAccountRow["onboarding_status"];
  charges_enabled: boolean;
  payouts_enabled: boolean;
  country: string | null;
} {
  const charges = Boolean(account.charges_enabled);
  const payouts = Boolean(account.payouts_enabled);

  // Submitted but not fully enabled is "restricted", not "pending".
  // From the seller's side the consequence is identical — no payouts —
  // and labelling a stopped account "pending" is how somebody waits
  // three weeks for a review that is not happening. `details_submitted`
  // is what separates "Stripe is unhappy" from "they never finished".
  let status: SellerAccountRow["onboarding_status"];
  if (charges && payouts) status = "active";
  else if (account.details_submitted) status = "restricted";
  else status = "pending";

  return {
    onboarding_status: status,
    charges_enabled: charges,
    payouts_enabled: payouts,
    country: account.country ?? null,
  };
}

/**
 * Write Stripe's verdict onto the seller row.
 *
 * Service-role, because `seller_accounts` has no insert or update policy
 * at all: every column on it is either a Stripe identifier or a Stripe
 * judgement, and neither is something an account holder gets to assert
 * about themselves.
 */
export async function syncSellerAccount(params: {
  admin: SupabaseClient;
  userId: string;
  account: Stripe.Account;
}): Promise<void> {
  const capability = readAccountCapability(params.account);
  const { error } = await params.admin.from("seller_accounts").upsert(
    {
      user_id: params.userId,
      stripe_account_id: params.account.id,
      ...capability,
    },
    { onConflict: "user_id" }
  );
  if (error) {
    logApiError("marketplace:syncSellerAccount", error, { userId: params.userId });
  }
}

/**
 * Can this seller be paid?
 *
 * Checked against STRIPE at publish and at purchase, not against our
 * cached booleans. The cache is for rendering a dashboard; letting
 * somebody sell on the strength of a row we wrote weeks ago is how a
 * marketplace accumulates sales it cannot pay out — money we are holding
 * on behalf of a seller Stripe has since restricted.
 */
export async function sellerCanBePaid(
  stripe: Stripe,
  stripeAccountId: string | null | undefined
): Promise<{ ok: boolean; reason?: string }> {
  if (!stripeAccountId) return { ok: false, reason: "not_onboarded" };
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.charges_enabled) return { ok: false, reason: "charges_disabled" };
    if (!account.payouts_enabled) return { ok: false, reason: "payouts_disabled" };
    return { ok: true };
  } catch (err) {
    logApiError("marketplace:sellerCanBePaid", err, { stripeAccountId });
    // Fails CLOSED. If we cannot establish that a seller can be paid, we
    // do not take a buyer's money on their behalf.
    return { ok: false, reason: "unverifiable" };
  }
}
