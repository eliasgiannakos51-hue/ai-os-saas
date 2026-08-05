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
};

export type MarginFeatureRow = {
  feature: string;
  calls: number;
  /** null when no action in the window had a defined margin. */
  averageMargin: number | null;
  totalCostEur: number;
};

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
    { calls: number; marginSum: number; marginCount: number; cost: number }
  >();

  for (const row of data) {
    const feature = row.feature || "unknown";
    const acc =
      byFeature.get(feature) ?? { calls: 0, marginSum: 0, marginCount: 0, cost: 0 };
    acc.calls += 1;

    const margin = row.achieved_margin === null ? null : Number(row.achieved_margin);
    if (margin !== null && Number.isFinite(margin)) {
      acc.marginSum += margin;
      acc.marginCount += 1;
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
    }))
    // Costliest feature first: that is where a margin problem actually hurts.
    .sort((x, y) => y.totalCostEur - x.totalCostEur);
}
