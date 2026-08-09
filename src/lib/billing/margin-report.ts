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
  /** What was actually taken from the user. Zero on every bypass row. */
  credits_charged?: number | string | null;
  /** settle_reservation's metadata. Only two keys are read here — see
   *  hypotheticalMargin below for why they have to be. */
  metadata?: {
    bypassCharge?: unknown;
    wouldHaveChargedCredits?: unknown;
    effectiveCreditPriceEur?: unknown;
  } | null;
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

export type MarginFeatureRow = {
  feature: string;
  /** Every logged action for this feature in the window. */
  calls: number;
  /** How many actually charged the user. */
  chargedCalls: number;
  /** How many were on an account that is never charged. */
  bypassCalls: number;
  /** Average of the STORED achieved_margin — real revenue over real cost.
   *  Null when nothing in the window charged. */
  chargedMargin: number | null;
  /** Average of the RECONSTRUCTED margin for bypass rows — what they would
   *  have earned. Null when no bypass row carried the figures to compute
   *  it (rows written before wouldHaveChargedCredits existed). */
  wouldBeMargin: number | null;
  /** Credits actually taken for this feature in the window. */
  chargedCredits: number;
  /** Credits the bypass rows would have charged. Real money not taken. */
  wouldBeCredits: number;
  totalCostEur: number;
};

export type MarginSummary = {
  totalCostEur: number;
  totalChargedCredits: number;
  totalWouldBeCredits: number;
  /** Overall margin across everything in the window, charged and
   *  hypothetical combined — the single number that answers "is this
   *  business viable at current prices". Null when nothing cost anything. */
  overallMargin: number | null;
  /** The costliest feature and its share of total spend. Null when there
   *  is no spend at all. */
  topFeature: { feature: string; costEur: number; share: number } | null;
  /** True when NOTHING in the window charged — the whole table is
   *  projections, and saying so is the difference between a report and a
   *  misleading one. */
  projectionOnly: boolean;
  /** Features whose margin (charged where it exists, else hypothetical)
   *  is below target. These are the rows that go red and trigger the
   *  alert. */
  belowTarget: { feature: string; margin: number; hypothetical: boolean }[];
};

/**
 * Groups ai_cost_log rows by feature, keeping CHARGED and BYPASS apart.
 *
 * WHY THEY ARE SEPARATE COLUMNS RATHER THAN ONE BLENDED AVERAGE. They
 * answer different questions. The charged margin is revenue over cost —
 * the real number. The would-be margin is a projection: what the same work
 * would have earned had the account been paying. Averaging them together
 * produces a figure that is neither, and on an owner's own account — where
 * almost everything is bypass — the blend would read like real revenue.
 *
 * Numerics arrive from PostgREST as strings, so every value is coerced and
 * non-finite results are dropped rather than poisoning a sum with NaN.
 */
export function aggregateMarginRows(data: MarginLogRow[]): MarginFeatureRow[] {
  const byFeature = new Map<
    string,
    {
      calls: number;
      chargedSum: number;
      chargedCount: number;
      wouldBeSum: number;
      wouldBeCount: number;
      bypassCalls: number;
      chargedCredits: number;
      wouldBeCredits: number;
      cost: number;
    }
  >();

  for (const row of data) {
    const feature = row.feature || "unknown";
    const acc =
      byFeature.get(feature) ??
      {
        calls: 0,
        chargedSum: 0,
        chargedCount: 0,
        wouldBeSum: 0,
        wouldBeCount: 0,
        bypassCalls: 0,
        chargedCredits: 0,
        wouldBeCredits: 0,
        cost: 0,
      };
    acc.calls += 1;

    const cost = Number(row.real_cost_eur ?? 0);
    if (Number.isFinite(cost)) acc.cost += cost;

    const stored = row.achieved_margin === null ? null : Number(row.achieved_margin);
    const isCharged = stored !== null && Number.isFinite(stored);

    if (isCharged) {
      acc.chargedSum += stored as number;
      acc.chargedCount += 1;
      const taken = Number(row.credits_charged ?? 0);
      if (Number.isFinite(taken)) acc.chargedCredits += taken;
    } else {
      // No stored margin means nothing was charged — on a bypass account
      // that is by design, not missing data. The owner's own account IS a
      // bypass account, which is why the entire table read "—" while the
      // same page showed real euros of spend.
      acc.bypassCalls += 1;
      const credits = row.metadata?.wouldHaveChargedCredits;
      if (typeof credits === "number" && Number.isFinite(credits)) {
        acc.wouldBeCredits += credits;
      }
      const projected = hypotheticalMargin(row);
      if (projected !== null) {
        acc.wouldBeSum += projected;
        acc.wouldBeCount += 1;
      }
    }

    byFeature.set(feature, acc);
  }

  return [...byFeature.entries()]
    .map(([feature, a]) => ({
      feature,
      calls: a.calls,
      chargedCalls: a.chargedCount,
      bypassCalls: a.bypassCalls,
      chargedCredits: a.chargedCredits,
      // null, not 0, when nothing in the window had a defined margin —
      // reporting 0 would read as a total loss rather than "no data".
      chargedMargin: a.chargedCount > 0 ? a.chargedSum / a.chargedCount : null,
      wouldBeMargin: a.wouldBeCount > 0 ? a.wouldBeSum / a.wouldBeCount : null,
      wouldBeCredits: a.wouldBeCredits,
      totalCostEur: a.cost,
    }))
    // Costliest feature first: that is where a margin problem actually hurts.
    .sort((x, y) => y.totalCostEur - x.totalCostEur);
}

/**
 * The margin that decides whether a row is flagged.
 *
 * Charged where it exists, hypothetical otherwise. A projection below
 * target is still a real problem — it means the pricing would lose money
 * the moment a paying customer did the same thing — so it is flagged
 * exactly like a charged shortfall, and marked as a projection so nobody
 * mistakes one for the other.
 */
export function effectiveMargin(row: MarginFeatureRow): { margin: number | null; hypothetical: boolean } {
  if (row.chargedMargin !== null) return { margin: row.chargedMargin, hypothetical: false };
  if (row.wouldBeMargin !== null) return { margin: row.wouldBeMargin, hypothetical: true };
  return { margin: null, hypothetical: false };
}

/** The figures above the table: what the last 30 days actually cost, what
 *  they earned or would have earned, and where the money went. */
export function summariseMarginReport(rows: MarginFeatureRow[]): MarginSummary {
  const totalCostEur = rows.reduce((sum, r) => sum + r.totalCostEur, 0);
  const totalWouldBeCredits = rows.reduce((sum, r) => sum + r.wouldBeCredits, 0);
  const totalChargedCredits = rows.reduce((sum, r) => sum + r.chargedCredits, 0);

  const belowTarget: MarginSummary["belowTarget"] = [];
  let weightedMarginSum = 0;
  let weightedCost = 0;
  for (const row of rows) {
    const { margin, hypothetical } = effectiveMargin(row);
    if (margin === null) continue;
    if (margin < MARGIN_TARGET) belowTarget.push({ feature: row.feature, margin, hypothetical });
    // Weighted by cost, not a flat average: a 2x margin on the feature
    // that is 80% of spend is a very different problem from a 2x margin on
    // one that ran twice.
    weightedMarginSum += margin * row.totalCostEur;
    weightedCost += row.totalCostEur;
  }

  const top = rows[0];
  return {
    totalCostEur,
    totalChargedCredits,
    totalWouldBeCredits,
    overallMargin: weightedCost > 0 ? weightedMarginSum / weightedCost : null,
    topFeature:
      top && totalCostEur > 0
        ? { feature: top.feature, costEur: top.totalCostEur, share: top.totalCostEur / totalCostEur }
        : null,
    projectionOnly: rows.length > 0 && rows.every((r) => r.chargedCalls === 0),
    belowTarget,
  };
}

