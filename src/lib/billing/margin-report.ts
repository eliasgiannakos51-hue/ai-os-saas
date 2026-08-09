/**
 * Aggregation behind the owner-only margin report.
 *
 * Split out of the component so it can be tested without a database and
 * without a React renderer — the arithmetic here is the part that can be
 * wrong in a way nobody notices (a margin that silently reads 0 instead of
 * "unknown" would look like a catastrophic loss).
 */

export const MARGIN_REPORT_WINDOW_DAYS = 30;

/** Below this the margin is flagged — it is the target the pricing math aims at. */
export const MARGIN_TARGET = 4;

export type MarginLogRow = {
  feature: string;
  achieved_margin: number | string | null;
  real_cost_eur: number | string | null;
  /** settle_reservation's metadata. Only two keys are read here — see
   *  hypotheticalMargin below for why they have to be. */
  metadata?: {
    bypassCharge?: unknown;
    wouldHaveChargedCredits?: unknown;
    effectiveCreditPriceEur?: unknown;
  } | null;
};

export type MarginFeatureRow = {
  feature: string;
  calls: number;
  /** null when no action in the window had a defined margin. */
  averageMargin: number | null;
  totalCostEur: number;
  /** How many of `calls` contributed a HYPOTHETICAL margin rather than a
   *  charged one — i.e. bypass rows. The table says so, because "4.1x"
   *  computed from a charge nobody paid is a different claim from "4.1x"
   *  computed from revenue. */
  hypotheticalCalls: number;
};

/**
 * The margin a bypass row WOULD have achieved.
 *
 * WHY THIS EXISTS. settleReservation stores achieved_margin = null for
 * every account that is not charged — admins and beta testers — because
 * there genuinely is no revenue to divide by. Correct, and it made the
 * margin report useless to the one person who reads it: the owner's own
 * account is a bypass account, so EVERY row in the window had a null
 * margin and the whole table showed "—". Which is exactly what was
 * reported: real spend on one side of the page, no margin on the other.
 *
 * The inputs are already stored. wouldHaveChargedCredits was written
 * precisely so a bypass row could be told apart from broken billing, and
 * effectiveCreditPriceEur is the rate it was computed against. Multiplying
 * them gives the revenue that charge would have produced, and dividing by
 * the real cost gives the margin — the same arithmetic
 * achievedMarginOnAccount does, on the same numbers, just not persisted
 * because there was no charge to persist it for.
 *
 * Returns null when either input is missing, so a row that predates
 * wouldHaveChargedCredits still reads "no data" rather than inventing one.
 */
export function hypotheticalMargin(row: MarginLogRow): number | null {
  const credits = row.metadata?.wouldHaveChargedCredits;
  const price = row.metadata?.effectiveCreditPriceEur;
  const cost = Number(row.real_cost_eur ?? 0);
  if (typeof credits !== "number" || !Number.isFinite(credits)) return null;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(cost) || cost <= 0) return null;
  return (credits * price) / cost;
}

/**
 * Groups ai_cost_log rows by feature, averaging the STORED achieved_margin.
 *
 * Averages what was stored rather than recomputing from the current
 * multiplier: the multiplier configured at the time of each action is what
 * that action was actually priced at, and changing CREDIT_MARGIN_MULTIPLIER
 * later must not rewrite history.
 *
 * Numerics arrive from PostgREST as strings, so every value is coerced and
 * non-finite results are dropped rather than poisoning a sum with NaN.
 */
export function aggregateMarginRows(data: MarginLogRow[]): MarginFeatureRow[] {
  const byFeature = new Map<
    string,
    { calls: number; marginSum: number; marginCount: number; hypothetical: number; cost: number }
  >();

  for (const row of data) {
    const feature = row.feature || "unknown";
    const acc =
      byFeature.get(feature) ??
      { calls: 0, marginSum: 0, marginCount: 0, hypothetical: 0, cost: 0 };
    acc.calls += 1;

    const stored = row.achieved_margin === null ? null : Number(row.achieved_margin);
    if (stored !== null && Number.isFinite(stored)) {
      acc.marginSum += stored;
      acc.marginCount += 1;
    } else {
      // No stored margin. On a bypass row that is by design, not missing
      // data — and the owner's own account is a bypass account, so before
      // this the entire table read "—" while the same page showed real
      // euros of spend. The hypothetical is computed from figures
      // settlement already wrote for exactly this purpose.
      const hypothetical = hypotheticalMargin(row);
      if (hypothetical !== null) {
        acc.marginSum += hypothetical;
        acc.marginCount += 1;
        acc.hypothetical += 1;
      }
    }

    const cost = Number(row.real_cost_eur ?? 0);
    if (Number.isFinite(cost)) acc.cost += cost;

    byFeature.set(feature, acc);
  }

  return [...byFeature.entries()]
    .map(([feature, a]) => ({
      feature,
      calls: a.calls,
      // null, not 0, when nothing in the window had a defined margin —
      // reporting 0 would read as a total loss rather than "no data".
      averageMargin: a.marginCount > 0 ? a.marginSum / a.marginCount : null,
      totalCostEur: a.cost,
      hypotheticalCalls: a.hypothetical,
    }))
    // Costliest feature first: that is where a margin problem actually hurts.
    .sort((x, y) => y.totalCostEur - x.totalCostEur);
}
