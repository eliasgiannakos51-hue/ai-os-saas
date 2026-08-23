import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import {
  attributionDecision,
  codeFromBytes,
  commissionForInvoice,
  DEFAULT_RATE,
  isValidCodeShape,
  type AttributionRefusal,
} from "@/lib/affiliate/rules";

// Everything that reads or writes the affiliate tables.
//
// The decisions all live in rules.ts, which has no database in it; this
// file is the part that loads the rows those decisions need and writes the
// result. Keeping the split means the anti-fraud rules can be tested
// against constructed situations rather than against a live Supabase, and
// it means this file has nothing to reason about beyond "what did the rule
// say".
//
// Reads go through the SERVICE-ROLE client even where a policy would allow
// the user's own client, because attribution and commission are decided
// about a user by code the user is not running.

export type AffiliateRow = {
  id: string;
  user_id: string;
  code: string;
  commission_rate: number;
  status: "active" | "suspended";
  suspended_reason: string | null;
  stripe_account_id: string | null;
  payouts_enabled: boolean;
  created_at: string;
};

export type ReferralRow = {
  id: string;
  affiliate_id: string;
  referred_user_id: string;
  code: string;
  status: "pending" | "converted" | "void";
  created_at: string;
  converted_at: string | null;
};

/** The affiliate account for a user, or null if they have not joined. */
export async function getAffiliateForUser(userId: string): Promise<AffiliateRow | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("affiliates")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      logApiError("affiliate:get", error, { userId });
      return null;
    }
    return (data as AffiliateRow | null) ?? null;
  } catch (err) {
    logApiError("affiliate:get", err, { userId });
    return null;
  }
}

async function getAffiliateByCode(code: string): Promise<AffiliateRow | null> {
  if (!isValidCodeShape(code)) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("affiliates").select("*").eq("code", code).maybeSingle();
    return (data as AffiliateRow | null) ?? null;
  } catch (err) {
    logApiError("affiliate:byCode", err);
    return null;
  }
}

/**
 * Creates the affiliate account, or returns the existing one.
 *
 * The code is retried on collision rather than assumed unique: 31^8 is
 * large, but "large" is not "never", and the unique index would otherwise
 * turn a one-in-a-trillion coincidence into a user who simply cannot join
 * the programme with no explanation.
 */
export async function ensureAffiliate(userId: string): Promise<AffiliateRow | null> {
  const existing = await getAffiliateForUser(userId);
  if (existing) return existing;

  const admin = createAdminClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = codeFromBytes(randomBytes(16));
    const { data, error } = await admin
      .from("affiliates")
      .insert({ user_id: userId, code, commission_rate: DEFAULT_RATE })
      .select("*")
      .single();
    if (!error && data) return data as AffiliateRow;

    // 23505 is unique_violation. On user_id it means a concurrent request
    // created the row first — return theirs. On code it means try again.
    if (error?.code === "23505") {
      const raced = await getAffiliateForUser(userId);
      if (raced) return raced;
      continue;
    }
    logApiError("affiliate:ensure", error, { userId });
    return null;
  }
  logApiError("affiliate:ensure", new Error("could not allocate a unique code"), { userId });
  return null;
}

export type AttributionResult = { ok: true } | { ok: false; reason: AttributionRefusal | "error" };

/**
 * Credits a brand-new account to the affiliate whose code they arrived on.
 *
 * Called once, right after the account exists (api/signup and
 * auth/callback). Every refusal is a normal outcome, not an error: an
 * unknown code, a self-referral and an already-referred user are all
 * things that happen, and none of them should fail a signup.
 */
export async function attributeReferral(params: {
  referredUserId: string;
  code: string;
}): Promise<AttributionResult> {
  try {
    const affiliate = await getAffiliateByCode(params.code);
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("affiliate_referrals")
      .select("affiliate_id")
      .eq("referred_user_id", params.referredUserId)
      .maybeSingle();

    const decision = attributionDecision({
      affiliateUserId: affiliate?.user_id ?? null,
      affiliateStatus: affiliate?.status,
      referredUserId: params.referredUserId,
      existingReferralAffiliateId: (existing as { affiliate_id: string } | null)?.affiliate_id ?? null,
    });
    if (!decision.attribute) return { ok: false, reason: decision.reason };

    const { error } = await admin.from("affiliate_referrals").insert({
      affiliate_id: affiliate!.id,
      referred_user_id: params.referredUserId,
      code: affiliate!.code,
    });
    if (error) {
      // The unique index doing its job under a race — two requests for the
      // same new account. Not an error worth surfacing.
      if (error.code === "23505") return { ok: false, reason: "already_attributed" };
      logApiError("affiliate:attribute", error, { referredUserId: params.referredUserId });
      return { ok: false, reason: "error" };
    }
    return { ok: true };
  } catch (err) {
    logApiError("affiliate:attribute", err, { referredUserId: params.referredUserId });
    return { ok: false, reason: "error" };
  }
}

/**
 * Records commission for a paid invoice, and converts the referral if this
 * is the customer's first payment.
 *
 * Called from the Stripe webhook. Returns silently when there is nothing
 * to do — most invoices in this system belong to nobody's referral.
 */
export async function recordCommissionForInvoice(params: {
  referredUserId: string;
  stripeInvoiceId: string;
  amountCents: number;
  paidAt: Date;
}): Promise<{ recorded: boolean; reason?: string }> {
  try {
    const admin = createAdminClient();
    const { data: referralData } = await admin
      .from("affiliate_referrals")
      .select("*")
      .eq("referred_user_id", params.referredUserId)
      .maybeSingle();
    const referral = referralData as ReferralRow | null;
    if (!referral) return { recorded: false, reason: "not_referred" };

    const { data: affiliateData } = await admin
      .from("affiliates")
      .select("*")
      .eq("id", referral.affiliate_id)
      .maybeSingle();
    const affiliate = affiliateData as AffiliateRow | null;
    if (!affiliate) return { recorded: false, reason: "no_affiliate" };
    // A suspended affiliate keeps their referrals but stops earning. The
    // referral is not voided, because suspension can be lifted and voiding
    // would silently destroy the twelve-month window.
    if (affiliate.status === "suspended") return { recorded: false, reason: "affiliate_inactive" };

    // FIRST PAID INVOICE STARTS THE CLOCK. Done before the commission
    // decision so the very first payment is itself month 1 rather than
    // being refused as "not converted".
    let referralStatus = referral.status;
    let convertedAt = referral.converted_at ? new Date(referral.converted_at) : null;
    if (referralStatus === "pending") {
      const { error: convertError } = await admin
        .from("affiliate_referrals")
        .update({ status: "converted", converted_at: params.paidAt.toISOString() })
        .eq("id", referral.id)
        .eq("status", "pending");
      if (convertError) {
        logApiError("affiliate:convert", convertError, { referralId: referral.id });
        return { recorded: false, reason: "convert_failed" };
      }
      referralStatus = "converted";
      convertedAt = params.paidAt;
    }

    const { data: duplicate } = await admin
      .from("affiliate_commissions")
      .select("id")
      .eq("stripe_invoice_id", params.stripeInvoiceId)
      .maybeSingle();

    const decision = commissionForInvoice({
      referralStatus,
      convertedAt,
      invoiceAmountCents: params.amountCents,
      rate: affiliate.commission_rate,
      alreadyRecorded: Boolean(duplicate),
      paidAt: params.paidAt,
    });
    if (!decision.pay) return { recorded: false, reason: decision.reason };

    const { error } = await admin.from("affiliate_commissions").insert({
      affiliate_id: affiliate.id,
      referral_id: referral.id,
      stripe_invoice_id: params.stripeInvoiceId,
      invoice_amount_cents: params.amountCents,
      commission_cents: decision.commissionCents,
      rate: decision.rate,
      period_month: decision.periodMonth,
    });
    if (error) {
      // The unique index catching a replayed webhook the SELECT above
      // missed by a millisecond. Exactly what it is for.
      if (error.code === "23505") return { recorded: false, reason: "already_paid_for_invoice" };
      logApiError("affiliate:commission", error, { invoice: params.stripeInvoiceId });
      return { recorded: false, reason: "insert_failed" };
    }
    return { recorded: true };
  } catch (err) {
    logApiError("affiliate:commission", err, { invoice: params.stripeInvoiceId });
    return { recorded: false, reason: "error" };
  }
}

/** Reverses commission for a refunded or disputed invoice. */
export async function reverseCommissionForInvoice(stripeInvoiceId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    // Only ACCRUED rows are reversed. A commission already transferred to
    // a Connect account cannot be un-transferred by a database update, and
    // pretending otherwise would make the balance wrong in the other
    // direction — those are clawed back through Stripe or written off.
    await admin
      .from("affiliate_commissions")
      .update({ status: "reversed" })
      .eq("stripe_invoice_id", stripeInvoiceId)
      .eq("status", "accrued");
  } catch (err) {
    logApiError("affiliate:reverse", err, { invoice: stripeInvoiceId });
  }
}

export type AffiliateStats = {
  referrals: number;
  converted: number;
  accruedCents: number;
  paidCents: number;
  lifetimeCents: number;
};

/** The numbers the affiliate dashboard shows. */
export async function getAffiliateStats(affiliateId: string): Promise<AffiliateStats> {
  const empty: AffiliateStats = {
    referrals: 0,
    converted: 0,
    accruedCents: 0,
    paidCents: 0,
    lifetimeCents: 0,
  };
  try {
    const admin = createAdminClient();
    const [{ data: referrals }, { data: commissions }] = await Promise.all([
      admin.from("affiliate_referrals").select("status").eq("affiliate_id", affiliateId),
      admin
        .from("affiliate_commissions")
        .select("commission_cents, status")
        .eq("affiliate_id", affiliateId),
    ]);
    const referralRows = (referrals as { status: string }[] | null) ?? [];
    const commissionRows =
      (commissions as { commission_cents: number; status: string }[] | null) ?? [];
    const sum = (status: string) =>
      commissionRows.filter((c) => c.status === status).reduce((t, c) => t + c.commission_cents, 0);
    return {
      referrals: referralRows.length,
      converted: referralRows.filter((r) => r.status === "converted").length,
      accruedCents: sum("accrued"),
      paidCents: sum("paid"),
      // Reversed rows are deliberately excluded: lifetime earnings should
      // not include money that was taken back.
      lifetimeCents: sum("accrued") + sum("paid"),
    };
  } catch (err) {
    logApiError("affiliate:stats", err, { affiliateId });
    return empty;
  }
}
