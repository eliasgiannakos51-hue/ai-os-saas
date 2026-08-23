/**
 * REMOVING THE BADGE WITH CREDITS, PER SITE, PER MONTH.
 *
 * Until now the badge came off exactly one way: upgrade to Starter. That
 * is a EUR20/month decision for somebody whose objection is one line of
 * text in a corner, and the people most likely to object are the ones
 * least likely to have a business case for Starter yet.
 *
 * ============================ THE PRICE ============================
 *
 * 200 CREDITS PER SITE PER MONTH, and the number is derived rather than
 * chosen. Two constraints fix it, and they are both arithmetic:
 *
 *   THE FLOOR IS THE FREE PLAN'S OWN MONTHLY GRANT. Free accounts are
 *   granted 100 credits a month, and the monthly reset REPLACES the
 *   grant rather than adding to it (`credits_remaining := p_monthly +
 *   purchased_credits`, see 20260815_purchased_credits.sql) — so granted
 *   credits never accumulate. At any price at or below 100 a free user
 *   removes the badge with credits we gave them, every month, for ever:
 *   we would be paying ourselves to delete our own attribution. At 200
 *   the grant CANNOT cover it in any month, so removal always requires a
 *   purchase, which is revenue against zero cost. That is the whole
 *   margin argument and it does not depend on a forecast.
 *
 *   THE CEILING IS STARTER. At the list rate of EUR0.02/credit, 200
 *   credits is EUR4.00/month for one site. Five sites is EUR20.00 —
 *   exactly Starter's price, which removes the badge on every site AND
 *   carries 1,000 credits, the website builder, AI memory and five
 *   agents. So the ladder self-upsells: it is never rational to hold
 *   five badge-free sites on credits, and at two or three the comparison
 *   is already unflattering. A cheaper badge removal would cannibalise
 *   Starter; a dearer one would simply not be bought.
 *
 * ========================= THE MARGIN (>=4x) =========================
 *
 * Badge removal makes NO model call. realCostEur is zero, so it cannot
 * consume any part of the 25% AI-spend ceiling
 * (COMBINED_CEILING_SHARE) — the credit subsystem's share is 20% and the
 * free-quota registry's is 5%, and this feature draws on neither.
 *
 * It moves the combined margin the RIGHT way, twice over:
 *
 *   1. Credits spent here are credits NOT spent on inference. Every 200
 *      credits removed from a balance is up to 200 credits of AI work
 *      that will not be bought with them, so our cost falls.
 *   2. On the free plan the credits must have been PURCHASED (see the
 *      floor above), so the transaction is revenue at EUR0.02/credit
 *      against EUR0.00 of cost.
 *
 * Formally, for a month in which an account spends `c` credits on badge
 * removal at an effective price `p`: revenue += c*p, AI cost += 0. The
 * ratio revenue/cost for this line is unbounded, and the ACCOUNT-level
 * ratio can only rise. There is no configuration of this feature that
 * takes the combined margin below 4x, and
 * scripts/tests/badge-credits.test.mjs asserts exactly that rather than
 * asserting a number somebody typed.
 *
 * WHAT IS NOT A MARGIN CLAIM: what the badge itself earns us in
 * referrals. Nothing measures badge click-through in this codebase — the
 * href carries `?ref=badge` and no row anywhere counts it — so the
 * opportunity cost of removal is UNKNOWN and is not modelled here. Any
 * number for it would be invented.
 *
 * ======================= WHAT THIS FILE IS =======================
 *
 * Pure. The dates, the arithmetic and every refusal, with no database
 * and no clock of its own — badge-credits-store.ts does the IO. So the
 * build gate exercises every branch, including the ones that only happen
 * at a month boundary, without waiting for one.
 */

/**
 * Credits per site per calendar month. See THE PRICE above — this is
 * derived from the free grant (100) and Starter (EUR20), not chosen.
 */
export const BADGE_REMOVAL_CREDITS_PER_MONTH = 200;

/**
 * Days before expiry that the warning goes out.
 *
 * SEVEN, and the renewal attempt happens on the expiry day itself. The
 * warning is not the renewal: it is the chance to top up before one is
 * attempted, which is the only thing that makes it useful.
 */
export const BADGE_WARNING_DAYS = 7;

/** Plans that carry the badge unless it has been bought off. Free only —
 *  kept in step with BADGE_PLANS in badge.ts by the build gate rather
 *  than by hoping. */
export const BADGE_REMOVAL_APPLIES_TO = new Set(["free"]);

export type BadgeRemovalRow = {
  siteId: string;
  /** First of the month this purchase covers, YYYY-MM-DD. */
  coversMonth: string;
  /** True while the account has paid for this month. */
  active: boolean;
  /** Set when the user turned auto-renewal off, or a renewal failed. */
  cancelledAt: string | null;
};

/**
 * Should this site show the badge, right now?
 *
 * THE ORDER MATTERS AND IT IS THE WHOLE POINT OF RULE (ε).
 *
 * The plan is checked FIRST. A Starter+ account never reaches the credit
 * question, so it can never be charged for something its plan already
 * includes — the double-charge is not merely avoided, it is
 * unreachable. Checking credits first and then the plan would produce
 * exactly the same VISIBLE result and would quietly bill paying
 * customers.
 */
export function siteShowsBadge(params: {
  planSlug: string | null | undefined;
  /** The removal covering the CURRENT month for this site, if any. */
  removal: BadgeRemovalRow | null;
}): boolean {
  const slug = (params.planSlug ?? "free").trim().toLowerCase() || "free";
  // PAID PLANS ARE DONE HERE. Not "return false after checking credits" —
  // the credit path is not entered at all.
  if (!BADGE_REMOVAL_APPLIES_TO.has(slug)) return false;
  const removal = params.removal;
  if (!removal || !removal.active) return true;
  return false;
}

/**
 * May this account be charged for removing the badge on this site?
 *
 * The refusals are the interesting half, and `already_free` is the one
 * that matters: it is rule (ε) enforced at the point money would move,
 * not merely at the point the badge is drawn.
 */
export type PurchaseVerdict =
  | { ok: true; credits: number; coversMonth: string }
  | {
      ok: false;
      reason:
        | "already_free"
        | "already_active"
        | "insufficient_credits"
        | "unknown_site"
        | "not_owner";
    };

export function checkBadgeRemovalPurchase(params: {
  planSlug: string | null | undefined;
  removal: BadgeRemovalRow | null;
  creditsRemaining: number;
  now: Date;
}): PurchaseVerdict {
  const slug = (params.planSlug ?? "free").trim().toLowerCase() || "free";
  // NEVER A DOUBLE CHARGE. A Starter+ account asking to buy badge removal
  // is refused with the reason, so the UI can say "your plan already
  // includes this" instead of taking the money.
  if (!BADGE_REMOVAL_APPLIES_TO.has(slug)) return { ok: false, reason: "already_free" };

  const coversMonth = monthStart(params.now);
  if (params.removal?.active && params.removal.coversMonth === coversMonth) {
    return { ok: false, reason: "already_active" };
  }
  if (params.creditsRemaining < BADGE_REMOVAL_CREDITS_PER_MONTH) {
    return { ok: false, reason: "insufficient_credits" };
  }
  return { ok: true, credits: BADGE_REMOVAL_CREDITS_PER_MONTH, coversMonth };
}

/** First of the month containing `at`, as YYYY-MM-DD. THE ONE PLACE the
 *  badge month is derived, so a stored row and a renewal query cannot
 *  round it differently — the same rule the overage ledger follows. */
export function monthStart(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** The month after `month` (a YYYY-MM-01 string). */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return monthStart(new Date(Date.UTC(y, m, 1)));
}

/**
 * The day a month's cover runs out: the first of the NEXT month.
 *
 * A purchase covering March is paid to the end of March, so it expires
 * at 2026-04-01. Storing the last day instead would make every
 * comparison an off-by-one waiting to happen at month lengths.
 */
export function expiryOf(coversMonth: string): string {
  return nextMonth(coversMonth);
}

export type RenewalAction =
  | { action: "warn"; daysLeft: number }
  | { action: "renew" }
  | { action: "lapse" }
  | { action: "nothing"; why: string };

/**
 * What the daily cron should do with one active removal.
 *
 * PURE, so the month boundary is testable without waiting for one, and
 * so every branch below is exercised by the build gate.
 *
 * WARN BEFORE, NOT AFTER. The brief's rule (δ) is a warning seven days
 * ahead and the badge returning only when the credits genuinely are not
 * there. A user who tops up on day 6 is renewed on day 0 and never sees
 * the badge come back — which is the entire point of warning early
 * rather than announcing a lapse that already happened.
 */
export function decideRenewal(params: {
  removal: BadgeRemovalRow;
  creditsRemaining: number;
  /** The month for which a warning has already been sent, if any. */
  warnedForMonth: string | null;
  now: Date;
}): RenewalAction {
  const { removal, now } = params;
  if (!removal.active) return { action: "nothing", why: "not active" };

  const expiry = expiryOf(removal.coversMonth);
  const expiryMs = Date.parse(`${expiry}T00:00:00Z`);
  const nowMs = now.getTime();
  const daysLeft = Math.ceil((expiryMs - nowMs) / 86_400_000);

  if (daysLeft > BADGE_WARNING_DAYS) return { action: "nothing", why: "not due yet" };

  if (daysLeft > 0) {
    // ONCE PER MONTH, whatever the cron's cadence. A daily job that warns
    // every day for seven days is a job whose warnings get muted, and the
    // one that matters is the one about money.
    if (params.warnedForMonth === removal.coversMonth) {
      return { action: "nothing", why: "already warned for this month" };
    }
    // ENOUGH CREDITS MEANS NO WARNING. Telling somebody their badge is
    // about to return when it demonstrably is not is how a notification
    // channel loses its credibility, and this one costs money to ignore.
    if (params.creditsRemaining >= BADGE_REMOVAL_CREDITS_PER_MONTH) {
      return { action: "nothing", why: "covered — enough credits to renew" };
    }
    return { action: "warn", daysLeft };
  }

  // Expired. Renew if the credits are there, otherwise the badge returns.
  if (params.creditsRemaining >= BADGE_REMOVAL_CREDITS_PER_MONTH) return { action: "renew" };
  return { action: "lapse" };
}

/**
 * What the user is shown BEFORE they agree, in the units they think in.
 *
 * Both numbers, always: credits are what is deducted and euros are what
 * they mean. A price shown only in credits is a price in a currency the
 * customer cannot value.
 */
export function removalPreview(params: {
  creditPriceEur: number;
  creditsRemaining: number;
  sites: number;
}): {
  creditsPerSitePerMonth: number;
  eurPerSitePerMonth: number;
  totalCreditsPerMonth: number;
  monthsAffordable: number;
} {
  const credits = BADGE_REMOVAL_CREDITS_PER_MONTH;
  const sites = Math.max(0, Math.floor(params.sites));
  const totalCreditsPerMonth = credits * sites;
  return {
    creditsPerSitePerMonth: credits,
    eurPerSitePerMonth: Math.round(credits * params.creditPriceEur * 100) / 100,
    totalCreditsPerMonth,
    // HOW LONG THEIR BALANCE LASTS, which is the question somebody
    // actually has and the one a per-month price does not answer.
    monthsAffordable:
      totalCreditsPerMonth <= 0 ? 0 : Math.floor(params.creditsRemaining / totalCreditsPerMonth),
  };
}
