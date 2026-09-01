// The affiliate programme's arithmetic and its refusals, as pure
// functions.
//
// Everything here is decided without a database so it can be tested
// against the cases that matter — the ones an affiliate would construct
// deliberately. Anti-fraud rules that only exist inside a route handler
// are rules nobody can check.
//
// THE FOUR WAYS THIS PROGRAMME COULD BE ROBBED, and where each is stopped:
//
//   1. Refer yourself. Sign up, take your own link, buy a plan, take 25%
//      off your own subscription forever.        -> attributionDecision
//   2. Re-refer someone who is already someone else's referral, or your
//      own, to reset the twelve months.          -> attributionDecision
//   3. Get paid twice for one invoice, by replaying a webhook or by two
//      events describing the same payment.       -> a unique index on
//                                                   stripe_invoice_id, and
//                                                   commissionForInvoice
//                                                   refuses a duplicate.
//   4. Keep earning past the twelve months.      -> monthsSinceConversion
//
// Rules 1, 2 and 4 are here. Rule 3 is here AND in the database, because a
// money rule enforced in one place is enforced until the next code path.

/** Recurring commission runs for a year from the conversion, not forever. */
import { formatCurrency } from "@/lib/format-number";
export const COMMISSION_MONTHS = 12;

/**
 * The band the brief allows: 20-30%. A rate outside it is a configuration
 * mistake, and the clamp means the mistake costs a wrong-but-bounded
 * payout rather than an unbounded one.
 */
export const MIN_RATE = 0.2;
export const MAX_RATE = 0.3;
export const DEFAULT_RATE = 0.25;

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_RATE;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

// ---------------------------------------------------------------------------
// Referral codes
// ---------------------------------------------------------------------------

// No 0/O/1/I/L. A referral code gets read off a screen, typed into a phone
// and spoken down a call — every one of those confuses those characters,
// and a mistyped code silently credits nobody.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

/** Shape check for a code arriving from a URL. */
export function isValidCodeShape(code: unknown): code is string {
  return (
    typeof code === "string" &&
    code.length === CODE_LENGTH &&
    [...code].every((c) => CODE_ALPHABET.includes(c))
  );
}

/**
 * Generates a code from supplied randomness.
 *
 * The bytes are a parameter rather than read from crypto here so the
 * generator is deterministic under test — a code generator whose output
 * cannot be predicted in a test is a code generator whose alphabet nobody
 * has actually verified.
 */
export function codeFromBytes(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i % bytes.length] % CODE_ALPHABET.length];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

export type AttributionRefusal =
  | "self_referral"
  | "already_attributed"
  | "affiliate_inactive"
  | "unknown_code";

export type AttributionDecision =
  | { attribute: true }
  | { attribute: false; reason: AttributionRefusal };

/**
 * Should this signup be credited to this affiliate?
 *
 * FIRST TOUCH WINS, PERMANENTLY. `existingReferralAffiliateId` being set at
 * all is a refusal, even when it is the same affiliate: re-attributing
 * would move `converted_at` and hand out a fresh twelve months, which is
 * the cheapest possible way to farm this programme.
 */
export function attributionDecision(params: {
  /** The affiliate the code belongs to, or null when the code is unknown. */
  affiliateUserId: string | null;
  affiliateStatus?: "active" | "suspended";
  referredUserId: string;
  /** Set when this user has ALREADY been attributed to someone. */
  existingReferralAffiliateId?: string | null;
}): AttributionDecision {
  if (!params.affiliateUserId) return { attribute: false, reason: "unknown_code" };
  if (params.affiliateStatus === "suspended") {
    return { attribute: false, reason: "affiliate_inactive" };
  }
  if (params.affiliateUserId === params.referredUserId) {
    return { attribute: false, reason: "self_referral" };
  }
  if (params.existingReferralAffiliateId) {
    return { attribute: false, reason: "already_attributed" };
  }
  return { attribute: true };
}

// ---------------------------------------------------------------------------
// Commission
// ---------------------------------------------------------------------------

/**
 * Whole months elapsed, counted from the conversion date.
 *
 * Returns 1 for the first month, so `month <= COMMISSION_MONTHS` reads as
 * "within the twelve". Calendar-aware rather than 30-day arithmetic:
 * paying an extra month to anyone whose customer converted on the 31st is
 * a rounding error that compounds across every affiliate.
 */
export function monthsSinceConversion(convertedAt: Date, at: Date): number {
  const months =
    (at.getUTCFullYear() - convertedAt.getUTCFullYear()) * 12 +
    (at.getUTCMonth() - convertedAt.getUTCMonth());
  // Not yet at the day-of-month anniversary, so still inside the previous
  // month's window.
  const beforeAnniversary = at.getUTCDate() < convertedAt.getUTCDate();
  return months + (beforeAnniversary ? 0 : 1);
}

export type CommissionRefusal =
  | "not_converted"
  | "window_expired"
  | "already_paid_for_invoice"
  | "zero_amount"
  | "referral_void";

export type CommissionDecision =
  | { pay: true; commissionCents: number; rate: number; periodMonth: number }
  | { pay: false; reason: CommissionRefusal };

/**
 * How much, if anything, this paid invoice earns the referrer.
 *
 * Works in CENTS throughout. Floating-point euros are how a programme ends
 * up transferring 4.999999999 to somebody: money is integers here and is
 * only formatted for display.
 *
 * Rounds DOWN. The difference is a cent, and a cent kept is a cent that
 * cannot be paid out twice; rounding up would let a large number of tiny
 * invoices pay out more commission than was ever charged.
 */
export function commissionForInvoice(params: {
  referralStatus: "pending" | "converted" | "void";
  convertedAt: Date | null;
  /** What the customer actually paid, in cents, excluding tax and refunds. */
  invoiceAmountCents: number;
  rate: number;
  /** True when a commission row already exists for this invoice id. */
  alreadyRecorded: boolean;
  paidAt: Date;
}): CommissionDecision {
  if (params.referralStatus === "void") return { pay: false, reason: "referral_void" };
  if (params.referralStatus !== "converted" || !params.convertedAt) {
    return { pay: false, reason: "not_converted" };
  }
  if (params.alreadyRecorded) return { pay: false, reason: "already_paid_for_invoice" };
  if (!Number.isFinite(params.invoiceAmountCents) || params.invoiceAmountCents <= 0) {
    return { pay: false, reason: "zero_amount" };
  }

  const periodMonth = monthsSinceConversion(params.convertedAt, params.paidAt);
  if (periodMonth < 1 || periodMonth > COMMISSION_MONTHS) {
    return { pay: false, reason: "window_expired" };
  }

  const rate = clampRate(params.rate);
  const commissionCents = Math.floor(params.invoiceAmountCents * rate);
  if (commissionCents <= 0) return { pay: false, reason: "zero_amount" };

  return { pay: true, commissionCents, rate, periodMonth };
}

// ---------------------------------------------------------------------------
// Payout
// ---------------------------------------------------------------------------

/**
 * Below this, accrued commission is carried forward rather than sent.
 *
 * Stripe charges per transfer/payout, so paying out €0.80 costs more than
 * it moves. Twenty euros is high enough that the fee is noise and low
 * enough that a working affiliate is paid monthly.
 */
export const MIN_PAYOUT_CENTS = 2000;

export type PayoutRefusal = "below_minimum" | "no_connect_account" | "payouts_disabled" | "suspended";

export type PayoutDecision =
  | { pay: true; amountCents: number }
  | { pay: false; reason: PayoutRefusal };

export function payoutDecision(params: {
  accruedCents: number;
  stripeAccountId: string | null;
  payoutsEnabled: boolean;
  status: "active" | "suspended";
}): PayoutDecision {
  // Suspension is checked FIRST. An account suspended for fraud must not
  // be paid because it happens to have cleared onboarding.
  if (params.status === "suspended") return { pay: false, reason: "suspended" };
  if (!params.stripeAccountId) return { pay: false, reason: "no_connect_account" };
  // Stripe's own flag, not ours: it goes true only once identity and bank
  // details have actually been verified.
  if (!params.payoutsEnabled) return { pay: false, reason: "payouts_disabled" };
  if (params.accruedCents < MIN_PAYOUT_CENTS) return { pay: false, reason: "below_minimum" };
  return { pay: true, amountCents: params.accruedCents };
}

/**
 * Cents -> a money string, for display only.
 *
 * THROUGH THE CANONICAL FORMATTER, and it was not. This returned
 * `€${(cents / 100).toFixed(2)}` — no thousands separator, the symbol
 * always in front, the minus sign in the wrong place, and the same
 * output in every language. Measured against lib/format-number.ts's
 * formatCurrency, which every other user-facing figure uses:
 *
 *     €1000000.00   this function
 *     €1,000,000.00 en
 *     1.000.000,00 € el, de
 *     €-50.00       this function
 *     -€50.00       en
 *
 * It renders on components/affiliate/affiliate-dashboard.tsx — a screen
 * ANY user reaches, with translated prose around it. A Greek affiliate
 * read `€1234.56` inside a Greek sentence.
 *
 * The locale is a parameter with the same default formatCurrency has, so
 * server callers that have no locale behave exactly as before and the
 * dashboard passes useLocale().
 */
export function formatCents(cents: number, locale?: string): string {
  return formatCurrency(cents / 100, locale);
}
