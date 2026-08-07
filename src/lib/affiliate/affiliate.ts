// The affiliate programme's rules, in a client-safe module.
//
// The dashboard shows an affiliate what they have earned and what a
// referral is worth; the webhook computes what to actually record. Both
// use the functions here, because a programme whose dashboard and whose
// ledger disagree is one nobody trusts twice.

export const DEFAULT_COMMISSION_PERCENT = 25;

/** The brief's range. Below 20 the programme is not worth anyone's
 *  effort; above 30 a referred customer on a discounted plan can cost
 *  more to service than they bring in. Outside it, the default. */
const MIN_PERCENT = 20;
const MAX_PERCENT = 30;

/** Months of a referred customer's paid invoices that earn commission,
 *  counted from their FIRST PAYMENT rather than from signup — see the
 *  migration for why. */
export const COMMISSION_MONTHS = 12;

export function parseAffiliatePercent(env: Record<string, string | undefined> = process.env): {
  percent: number;
  warning: string | null;
} {
  const raw = env.AFFILIATE_COMMISSION_PERCENT;
  if (raw === undefined || raw.trim() === "") return { percent: DEFAULT_COMMISSION_PERCENT, warning: null };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return {
      percent: DEFAULT_COMMISSION_PERCENT,
      warning: `AFFILIATE_COMMISSION_PERCENT=${raw} is not a whole number`,
    };
  }
  if (parsed < MIN_PERCENT || parsed > MAX_PERCENT) {
    return {
      percent: DEFAULT_COMMISSION_PERCENT,
      warning: `AFFILIATE_COMMISSION_PERCENT=${raw} is outside ${MIN_PERCENT}-${MAX_PERCENT}`,
    };
  }
  return { percent: parsed, warning: null };
}

export function affiliatePercent(env: Record<string, string | undefined> = process.env): number {
  return parseAffiliatePercent(env).percent;
}

/**
 * Commission on one paid invoice.
 *
 * FLOORED, and computed on what was actually paid rather than on a plan
 * price. A subscription with a discount, a proration or applied credit
 * settles for less than its list price, and paying a percentage of the
 * list price would send out more than came in.
 */
export function commissionOn(invoiceAmountCents: number, percent: number): number {
  const amount = Math.max(0, Math.round(invoiceAmountCents));
  return Math.floor((amount * percent) / 100);
}

/** Twelve months after the first payment. Computed rather than stored as
 *  a duration so a referral's window is a date somebody can read on a
 *  dashboard and check. */
export function commissionEndsAt(firstPaidAt: Date): Date {
  const end = new Date(firstPaidAt.getTime());
  end.setUTCMonth(end.getUTCMonth() + COMMISSION_MONTHS);
  return end;
}

export function isWithinCommissionWindow(
  commissionEnds: string | null | undefined,
  now: Date = new Date()
): boolean {
  // No end date means no first payment yet. The FIRST paid invoice is
  // what starts the clock, and it is inside the window by definition —
  // so this returning true is correct, not a gap.
  if (!commissionEnds) return true;
  const end = new Date(commissionEnds);
  if (Number.isNaN(end.getTime())) return false;
  return now.getTime() < end.getTime();
}

// ---------------------------------------------------------------------
// Referral codes.
// ---------------------------------------------------------------------

/** Lowercase alphanumerics only, and short enough to be read aloud.
 *  Ambiguous characters are absent from the mint alphabet (see
 *  lib/affiliate/mint.ts) because these codes get dictated over the
 *  phone and written on slides. */
export const CODE_PATTERN = /^[a-z0-9]{6,16}$/;

/** Normalise a code as it arrives from a URL. Case-folded, because
 *  somebody typing ACME and somebody clicking ?ref=acme are the same
 *  referral and a case-sensitive lookup silently loses one of them. */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** How long a referral click is remembered. Thirty days is the industry
 *  norm and, more usefully, longer than the gap between "I heard about
 *  this" and "I signed up" for a B2B tool. */
export const REFERRAL_COOKIE_NAME = "ionexa_ref";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
