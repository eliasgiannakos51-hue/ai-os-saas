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

/**
 * The settlement feature a refused agent run logs under.
 *
 * A `cannot_complete` run charges nothing: the task was impossible when we
 * let the user create it, so charging for the discovery would be charging
 * for our own gap. The model has ALREADY RUN by then, though, so the
 * Anthropic cost is real and we absorb it. Kept on its own feature name so
 * it lands as its own row here rather than dragging agent_run's margin
 * down and looking like a pricing fault.
 */
export const ABSORBED_REFUSAL_FEATURE = "agent_run_cannot_complete";

/**
 * The share of monthly revenue absorbed refusals may reach before this
 * stops being noise.
 *
 * WHY THIS IS EXPECTED TO STAY FAR BELOW IT. execute-agent disables an
 * agent on its FIRST capability refusal (`shouldDisable = cannotComplete
 * || …`, setting status "disabled" and next_run_at null), so one agent can
 * produce at most one absorbed refusal — ever, not per month. The ceiling
 * is therefore the plan's agent limit, which is already enforced: 50 on
 * Ultimate, at a worst-case €0.1652 a run, is €8.26 against €200 — 4.1%,
 * and only if every agent a customer ever created refused on its first
 * run. Crossing 2% of real revenue would mean that theory is wrong, which
 * is exactly when someone should look.
 */
export const ABSORBED_REFUSAL_REVENUE_LIMIT = 0.02;

export type MarginLogRow = {
  feature: string;
  achieved_margin: number | string | null;
  real_cost_eur: number | string | null;
  /** What was actually taken from the user. Zero on every bypass row. */
  credits_charged?: number | string | null;
  /** Prompt-token counts, summed across every sub-call of the action.
   *  Optional because the cache panel is the only reader: a caller that
   *  only needs margin does not have to select them. */
  input_tokens?: number | string | null;
  cache_read_tokens?: number | string | null;
  cache_write_tokens?: number | string | null;
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
  /**
   * Refused agent runs, absorbed rather than charged. Null when there were
   * none in the window.
   *
   * `shareOfRevenue` is null when no revenue figure was supplied — this
   * module has no MRR source of its own, and a share computed against a
   * zero it invented would read as a reassuring 0%. Null says "not known",
   * which is the truth, and `overBudget` stays false rather than firing an
   * alert on a number nobody produced.
   */
  absorbedRefusals: {
    calls: number;
    costEur: number;
    shareOfRevenue: number | null;
    overBudget: boolean;
  } | null;
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
export function summariseMarginReport(
  rows: MarginFeatureRow[],
  options: { monthlyRevenueEur?: number | null } = {}
): MarginSummary {
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
    absorbedRefusals: (() => {
      const row = rows.find((r) => r.feature === ABSORBED_REFUSAL_FEATURE);
      if (!row) return null;
      const revenue = options.monthlyRevenueEur;
      const share =
        typeof revenue === "number" && Number.isFinite(revenue) && revenue > 0
          ? row.totalCostEur / revenue
          : null;
      return {
        calls: row.chargedCalls + row.bypassCalls,
        costEur: row.totalCostEur,
        shareOfRevenue: share,
        overBudget: share !== null && share > ABSORBED_REFUSAL_REVENUE_LIMIT,
      };
    })(),
  };
}


// ---------------------------------------------------------------------
// Cache efficiency
// ---------------------------------------------------------------------
//
// WHY THIS EXISTS. Prompt caching is the one cost optimisation whose
// success and failure look identical from the outside. Anthropic does not
// error when a prefix is too short to cache, or when a breakpoint sits on
// content that changes every request — it just returns
// cache_creation_input_tokens: 0, or writes an entry nothing ever reads.
// The code still greps as "cached". The bill is the only witness.
//
// ai_cost_log has recorded cache_read_tokens and cache_write_tokens since
// the baseline schema, and nothing in the product ever displayed them. So
// the app has always had the evidence and never shown it. This turns those
// two columns into the one number that answers "is caching actually
// working": the share of prompt tokens that were served from cache.
//
// DELIBERATELY TOKENS, NOT EUROS. Converting a cached read into money
// needs the input rate of the model that served it, and ai_cost_log does
// not store a model id — only the measured totals. A euro figure here
// would have to assume a model, and an assumed model is exactly what
// produced the understated costs MODEL_PRICING_USD's comment describes.
// A token share needs no such assumption and is the figure the before/
// after comparison actually turns on.

export type CacheFeatureRow = {
  feature: string;
  calls: number;
  /** Prompt tokens paid at full price. */
  inputTokens: number;
  /** Prompt tokens served from cache, at roughly a tenth of full price. */
  cacheReadTokens: number;
  /** Prompt tokens written to cache, at 1.25x (5-minute) or 2x (1-hour). */
  cacheWriteTokens: number;
  /**
   * cacheRead / (input + cacheRead + cacheWrite), as a 0-1 fraction.
   *
   * The denominator is EVERY prompt token, because that is the quantity
   * caching is supposed to move: a feature reading nothing from cache
   * scores 0 whether it is uncached or miscached, which is the honest
   * answer in both cases. Null when the feature sent no prompt tokens at
   * all, so "no data" cannot be mistaken for "0%".
   */
  hitRate: number | null;
  /**
   * True when this feature wrote to the cache but read essentially
   * nothing back — the signature of a breakpoint placed on content that
   * varies per request. Such a feature is paying the write premium on
   * every call and getting nothing for it, which is strictly worse than
   * not caching at all.
   */
  writingWithoutReading: boolean;
};

// A feature that has written this many tokens to cache has had ample
// opportunity to read some back; below it, a zero read rate is more
// likely to be a cold start than a misplaced breakpoint.
const WRITE_WITHOUT_READ_MIN_TOKENS = 10_000;
// Reads below this share of writes count as "essentially nothing".
const WRITE_WITHOUT_READ_MAX_RATIO = 0.05;

function tokenCount(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Per-feature cache efficiency over the same rows the margin table reads.
 *
 * Sorted by total prompt tokens descending: the features with the most to
 * gain appear first, which is the order the question "where is caching
 * worth adding next" is actually asked in.
 */
export function aggregateCacheRows(data: MarginLogRow[]): CacheFeatureRow[] {
  const byFeature = new Map<
    string,
    { calls: number; input: number; read: number; write: number }
  >();

  for (const row of data) {
    const feature = row.feature || "unknown";
    const acc = byFeature.get(feature) ?? { calls: 0, input: 0, read: 0, write: 0 };
    acc.calls += 1;
    acc.input += tokenCount(row.input_tokens);
    acc.read += tokenCount(row.cache_read_tokens);
    acc.write += tokenCount(row.cache_write_tokens);
    byFeature.set(feature, acc);
  }

  return [...byFeature.entries()]
    .map(([feature, a]) => {
      const total = a.input + a.read + a.write;
      return {
        feature,
        calls: a.calls,
        inputTokens: a.input,
        cacheReadTokens: a.read,
        cacheWriteTokens: a.write,
        hitRate: total > 0 ? a.read / total : null,
        writingWithoutReading:
          a.write >= WRITE_WITHOUT_READ_MIN_TOKENS &&
          a.read < a.write * WRITE_WITHOUT_READ_MAX_RATIO,
      };
    })
    .sort(
      (x, y) =>
        y.inputTokens + y.cacheReadTokens + y.cacheWriteTokens -
        (x.inputTokens + x.cacheReadTokens + x.cacheWriteTokens)
    );
}

export type CacheSummary = {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  hitRate: number | null;
  /** Features currently paying the write premium for nothing. */
  miscached: string[];
};

export function summariseCacheReport(rows: CacheFeatureRow[]): CacheSummary {
  const inputTokens = rows.reduce((s, r) => s + r.inputTokens, 0);
  const cacheReadTokens = rows.reduce((s, r) => s + r.cacheReadTokens, 0);
  const cacheWriteTokens = rows.reduce((s, r) => s + r.cacheWriteTokens, 0);
  const total = inputTokens + cacheReadTokens + cacheWriteTokens;
  return {
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    hitRate: total > 0 ? cacheReadTokens / total : null,
    miscached: rows.filter((r) => r.writingWithoutReading).map((r) => r.feature),
  };
}
