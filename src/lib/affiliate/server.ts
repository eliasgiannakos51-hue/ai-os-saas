import "server-only";
import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import {
  affiliatePercent,
  commissionEndsAt,
  commissionOn,
  isWithinCommissionWindow,
  normaliseCode,
} from "@/lib/affiliate/affiliate";

/**
 * Referral codes, referral records and commission accrual.
 *
 * Everything here runs on the service-role client, because every table
 * it writes is money owed and none of them has a write policy.
 */

// No i, l, 1, o or 0. These codes get dictated over the phone and
// written on slides, and a code somebody cannot read back is a referral
// that never lands.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 8;

function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Join the programme, or return the existing membership.
 *
 * Idempotent: a second call returns the same code. The retry loop exists
 * because `code` is unique and 31^8 is large but not infinite — a
 * collision is a constraint violation, not a duplicate code, and three
 * attempts makes the odds of failing indistinguishable from zero.
 */
export async function ensureAffiliateAccount(
  userId: string
): Promise<{ ok: true; code: string; status: string } | { ok: false }> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("affiliate_accounts")
    .select("code, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return { ok: true, code: existing.code, status: existing.status };

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode();
    const { data, error } = await admin
      .from("affiliate_accounts")
      .insert({ user_id: userId, code })
      .select("code, status")
      .maybeSingle();
    if (data) return { ok: true, code: data.code, status: data.status };
    if (error && !/duplicate|unique/i.test(error.message ?? "")) {
      logApiError("affiliate:ensureAccount", error, { userId, attempt });
      return { ok: false };
    }
  }
  logApiError("affiliate:ensureAccount", new Error("code collisions exhausted"), { userId });
  return { ok: false };
}

/**
 * Record that a new account came from a referral code.
 *
 * BEST-EFFORT, and deliberately so: this runs during signup, and a
 * signup must not fail because an attribution row would not write. The
 * person creating an account did not ask to be part of anybody's
 * referral programme, and losing a commission is a smaller harm than
 * losing a customer.
 *
 * Self-referral is refused here as well as by a database constraint. The
 * constraint is what makes it impossible; this is what makes the refusal
 * legible.
 */
export async function recordReferral(params: {
  code: string | null | undefined;
  referredUserId: string;
}): Promise<void> {
  const code = normaliseCode(params.code);
  if (!code) return;

  try {
    const admin = createAdminClient();

    const { data: affiliate } = await admin
      .from("affiliate_accounts")
      .select("user_id, status")
      .eq("code", code)
      .maybeSingle();

    // An unknown or suspended code is silently ignored. Telling a
    // signing-up stranger "that referral code is invalid" leaks which
    // codes exist, and they did not type it — it came off a link.
    if (!affiliate || affiliate.status !== "active") return;
    if (affiliate.user_id === params.referredUserId) return;

    const { error } = await admin.from("affiliate_referrals").insert({
      affiliate_user_id: affiliate.user_id,
      referred_user_id: params.referredUserId,
      code,
    });
    // A duplicate means this person was already referred. First touch
    // wins, so the second write losing is the correct outcome.
    if (error && !/duplicate|unique/i.test(error.message ?? "")) {
      logApiError("affiliate:recordReferral", error, { code });
    }
  } catch (err) {
    logApiError("affiliate:recordReferral", err, {});
  }
}

/**
 * Accrue commission on a paid invoice.
 *
 * Called from the verified Stripe webhook and nowhere else.
 *
 * IDEMPOTENT ON THE INVOICE ID, which is the whole reason
 * `stripe_invoice_id` is unique: Stripe retries `invoice.paid`, and a
 * retry that pays commission twice is money that leaves the building.
 *
 * Commission ACCRUES even while payouts are switched off. What is owed
 * does not depend on whether we have wired up a way to send it — that is
 * the difference between a liability and a feature flag.
 */
export async function recordCommissionForInvoice(params: {
  customerUserId: string;
  invoice: Stripe.Invoice;
}): Promise<{ recorded: boolean; reason?: string }> {
  const { customerUserId, invoice } = params;

  try {
    // `amount_paid`, not the subscription's list price. A discount, a
    // proration or applied credit means the customer settled for less,
    // and paying a percentage of the list price sends out more than came
    // in.
    const amountPaid = Math.max(0, Math.round(invoice.amount_paid ?? 0));
    if (amountPaid <= 0) return { recorded: false, reason: "zero_invoice" };
    if (!invoice.id) return { recorded: false, reason: "no_invoice_id" };

    const admin = createAdminClient();

    const { data: referral } = await admin
      .from("affiliate_referrals")
      .select("id, affiliate_user_id, first_paid_at, commission_ends_at")
      .eq("referred_user_id", customerUserId)
      .maybeSingle();

    if (!referral) return { recorded: false, reason: "not_referred" };

    // The FIRST paid invoice starts the twelve-month clock. Stamped
    // here, on the event that proves it, rather than at signup — a
    // referral that took three months to convert still gets a full
    // twelve months.
    if (!referral.first_paid_at) {
      const now = new Date();
      const { error } = await admin
        .from("affiliate_referrals")
        .update({
          first_paid_at: now.toISOString(),
          commission_ends_at: commissionEndsAt(now).toISOString(),
        })
        .eq("id", referral.id)
        .is("first_paid_at", null);
      if (error) logApiError("affiliate:commission", error, { stage: "stamp_first_paid" });
    } else if (!isWithinCommissionWindow(referral.commission_ends_at)) {
      return { recorded: false, reason: "window_closed" };
    }

    const percent = affiliatePercent();
    const commission = commissionOn(amountPaid, percent);
    if (commission <= 0) return { recorded: false, reason: "rounds_to_zero" };

    const { error } = await admin.from("affiliate_commissions").insert({
      referral_id: referral.id,
      affiliate_user_id: referral.affiliate_user_id,
      stripe_invoice_id: invoice.id,
      invoice_amount_cents: amountPaid,
      commission_cents: commission,
      percent,
    });

    if (error) {
      // A duplicate invoice id is the retry case, and a no-op. Anything
      // else is a commission that was earned and not recorded, which has
      // to be visible.
      if (/duplicate|unique/i.test(error.message ?? "")) {
        return { recorded: false, reason: "already_recorded" };
      }
      logApiError("affiliate:commission", error, { stage: "insert", invoiceId: invoice.id });
      return { recorded: false, reason: "insert_failed" };
    }

    return { recorded: true };
  } catch (err) {
    logApiError("affiliate:commission", err, {});
    return { recorded: false, reason: "unhandled" };
  }
}
