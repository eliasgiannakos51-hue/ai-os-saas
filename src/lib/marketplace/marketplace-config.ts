// Marketplace policy, in a client-safe module.
//
// The buyer sees the price and the seller sees what they will actually
// receive, both computed in the browser — so the commission has to be
// readable there, and the same function has to compute the split the
// server sends to Stripe. Two copies of that arithmetic is how a seller
// dashboard promises a payout the transfer does not match.

/**
 * IS THE MARKETPLACE OPEN.
 *
 * Off by default, and that is the point rather than a placeholder.
 * Stripe Connect requires a legally accountable account holder: taking
 * other people's money and paying it out is regulated, and this
 * deployment cannot do it until the company behind it exists. So the
 * whole feature is built, tested and shipped DARK — every money path
 * refuses with a plain "not open yet" rather than half-working.
 *
 * Turning it on is two things, both deliberate: this flag, and the
 * Connect keys. Neither alone does anything, which is what stops a
 * half-configured deployment accepting a payment it cannot pay out.
 */
export function isMarketplaceOpen(env: Record<string, string | undefined> = process.env): boolean {
  return env.MARKETPLACE_ENABLED === "true";
}

export const DEFAULT_COMMISSION_PERCENT = 25;

/** Bounds, not policy. Below 10 the marketplace does not cover the
 *  Stripe fees it triggers; above 40 it stops being a marketplace and
 *  starts being a tax. A value outside this warns and falls back — the
 *  same tolerance every other tuning variable here has, because
 *  refusing to boot on a typo turns a cosmetic mistake into an outage. */
const MIN_COMMISSION_PERCENT = 10;
const MAX_COMMISSION_PERCENT = 40;

export function parseCommissionPercent(env: Record<string, string | undefined> = process.env): {
  percent: number;
  warning: string | null;
} {
  const raw = env.MARKETPLACE_COMMISSION_PERCENT;
  if (raw === undefined || raw.trim() === "") return { percent: DEFAULT_COMMISSION_PERCENT, warning: null };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return {
      percent: DEFAULT_COMMISSION_PERCENT,
      warning: `MARKETPLACE_COMMISSION_PERCENT=${raw} is not a whole number`,
    };
  }
  if (parsed < MIN_COMMISSION_PERCENT || parsed > MAX_COMMISSION_PERCENT) {
    return {
      percent: DEFAULT_COMMISSION_PERCENT,
      warning: `MARKETPLACE_COMMISSION_PERCENT=${raw} is outside ${MIN_COMMISSION_PERCENT}-${MAX_COMMISSION_PERCENT}`,
    };
  }
  return { percent: parsed, warning: null };
}

export function commissionPercent(env: Record<string, string | undefined> = process.env): number {
  return parseCommissionPercent(env).percent;
}

// Prices are in EUR CENTS everywhere — in the database, in this file and
// in the Stripe call. Money in floating point is a rounding error
// waiting to be found by an accountant, and every plan and credit pack
// in this app is already priced in EUR.
export const MIN_PRICE_CENTS = 100; // €1
export const MAX_PRICE_CENTS = 50_000; // €500

/**
 * Split one sale.
 *
 * The platform fee is FLOORED and the seller gets the remainder, so the
 * two always add back to exactly what the buyer paid. Rounding both
 * independently is how a split ends up one cent short of the charge —
 * which Stripe rejects outright rather than absorbing.
 */
export function splitPrice(
  priceCents: number,
  percent: number
): { platformFeeCents: number; sellerCents: number } {
  const price = Math.max(0, Math.round(priceCents));
  const platformFeeCents = Math.floor((price * percent) / 100);
  return { platformFeeCents, sellerCents: price - platformFeeCents };
}

export function formatCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    // Pinned rather than left to the runtime, for the same reason
    // lib/format-number.ts pins grouping: a price that renders with a
    // different number of decimals per locale reads as a different price.
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, Math.round(cents)) / 100);
}

// ---------------------------------------------------------------------
// Listing text limits.
// ---------------------------------------------------------------------

export const MAX_LISTING_TITLE_CHARS = 80;
export const MIN_LISTING_TITLE_CHARS = 4;
export const MAX_LISTING_SUMMARY_CHARS = 200;
export const MAX_LISTING_DESCRIPTION_CHARS = 4000;
export const MAX_REVIEW_BODY_CHARS = 1000;

export const LISTING_CATEGORIES = [
  "business",
  "marketing",
  "sales",
  "productivity",
  "research",
  "finance",
  "creative",
  "other",
] as const;

export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export function isListingCategory(value: unknown): value is ListingCategory {
  return typeof value === "string" && (LISTING_CATEGORIES as readonly string[]).includes(value);
}

export const LISTING_SORTS = ["newest", "popular", "rating", "price_low", "price_high"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export function isListingSort(value: unknown): value is ListingSort {
  return typeof value === "string" && (LISTING_SORTS as readonly string[]).includes(value);
}
