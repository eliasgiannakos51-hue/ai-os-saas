import {
  durationSeconds,
  netPnl,
  outcomeOf,
  primarySessionAt,
  type JournalTrade,
  type TradeOutcome,
  type TradingSession,
} from "@/lib/trading/journal";

/**
 * THE STATISTICS, and the one property they all share: a figure that
 * cannot be computed honestly is ABSENT, never estimated.
 *
 * Every field below is nullable for that reason. A win rate over three
 * trades, a profit factor with no losses in the sample, an average loss
 * where nothing lost — each of these has a number that can be printed and
 * a meaning that does not exist. Printing it anyway is how a journal
 * becomes a machine for producing false confidence, which for this
 * particular product is not a cosmetic failure.
 *
 * Pure: no AI, no network. Nothing here says what to trade next.
 */

/** Below this, a percentage is a coin flip with a decimal point.
 *  The same floor lib/trading-pattern.ts already applies to its buckets. */
export const MIN_SAMPLE_FOR_RATE = 5;

export type TradingStats = {
  /** Trades that could be scored at all. */
  counted: number;
  /** Trades skipped because their result could not be derived. Reported,
   *  not hidden: "47 trades" where 12 were unscoreable is a different
   *  sentence from "35 trades". */
  unscoreable: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** Null below MIN_SAMPLE_FOR_RATE. */
  winRatePercent: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  /** Gross profit / gross loss. Null when nothing lost — the ratio is
   *  infinite, and "infinite profit factor" is a sample-size artefact
   *  printed as a triumph. */
  profitFactor: number | null;
  netPnl: number;
  /** True when EVERY counted trade had a commission recorded. When false
   *  the figures above are before costs, and the UI has to say so. */
  netOfCommission: boolean;
  /** Largest peak-to-trough fall in the running equity, as money. */
  maxDrawdown: number;
  maxDrawdownPercent: number | null;
  avgDurationSeconds: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
};

const EMPTY: TradingStats = {
  counted: 0,
  unscoreable: 0,
  wins: 0,
  losses: 0,
  breakeven: 0,
  winRatePercent: null,
  avgWin: null,
  avgLoss: null,
  profitFactor: null,
  netPnl: 0,
  netOfCommission: false,
  maxDrawdown: 0,
  maxDrawdownPercent: null,
  avgDurationSeconds: null,
  bestTrade: null,
  worstTrade: null,
};

/**
 * `trades` must be in the order they were CLOSED, oldest first.
 *
 * The drawdown depends on it. A drawdown computed over trades in an
 * arbitrary order is not a drawdown of anything — it is the range of a
 * shuffled sequence, and it will differ every time the query's ORDER BY
 * changes. The caller sorts; this function trusts the order and says so.
 *
 * `startingBalance` is only used for the PERCENTAGE drawdown, which is
 * null without it. A percentage against an assumed balance is a number
 * somebody would quote.
 */
export function computeStats(
  trades: readonly JournalTrade[],
  startingBalance?: number | null
): TradingStats {
  if (trades.length === 0) return { ...EMPTY };

  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let unscoreable = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let net = 0;
  let allNetOfCommission = true;
  let best: number | null = null;
  let worst: number | null = null;

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;

  let durationTotal = 0;
  let durationCount = 0;

  for (const trade of trades) {
    const result = netPnl(trade);
    if (result === null) {
      unscoreable += 1;
      continue;
    }
    if (!result.net) allNetOfCommission = false;
    const value = result.value;

    switch (outcomeOf(trade)) {
      case "win":
        wins += 1;
        grossProfit += value;
        break;
      case "loss":
        losses += 1;
        grossLoss += Math.abs(value);
        break;
      case "breakeven":
        breakeven += 1;
        break;
      default:
        break;
    }

    net += value;
    best = best === null ? value : Math.max(best, value);
    worst = worst === null ? value : Math.min(worst, value);

    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);

    const seconds = durationSeconds(trade);
    if (seconds !== null) {
      durationTotal += seconds;
      durationCount += 1;
    }
  }

  const counted = wins + losses + breakeven;
  const decisive = wins + losses;

  return {
    counted,
    unscoreable,
    wins,
    losses,
    breakeven,
    // BREAKEVEN TRADES ARE EXCLUDED FROM THE DENOMINATOR, not counted as
    // losses. A trade that closed flat is not a loss, and the convention
    // is stated because both are defensible and only one can be right for
    // a given reader.
    winRatePercent: decisive >= MIN_SAMPLE_FOR_RATE ? (wins / decisive) * 100 : null,
    avgWin: wins > 0 ? grossProfit / wins : null,
    avgLoss: losses > 0 ? -(grossLoss / losses) : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    netPnl: net,
    netOfCommission: counted > 0 && allNetOfCommission,
    maxDrawdown,
    maxDrawdownPercent:
      typeof startingBalance === "number" && startingBalance > 0
        ? (maxDrawdown / startingBalance) * 100
        : null,
    avgDurationSeconds: durationCount > 0 ? durationTotal / durationCount : null,
    bestTrade: best,
    worstTrade: worst,
  };
}

export type EquityPoint = { at: string | null; equity: number; tradeId: string };

/**
 * The equity curve: the running total, one point per scoreable trade.
 *
 * STARTS AT THE STARTING BALANCE when there is one, and at zero when
 * there is not — a curve that starts at zero is a P&L curve, which is a
 * different chart with a different y-axis, and mislabelling one as the
 * other makes a 5% drawdown look like a 50% one.
 */
export function equityCurve(
  trades: readonly JournalTrade[],
  startingBalance?: number | null
): EquityPoint[] {
  let equity = typeof startingBalance === "number" && Number.isFinite(startingBalance) ? startingBalance : 0;
  const points: EquityPoint[] = [];
  for (const trade of trades) {
    const result = netPnl(trade);
    if (result === null) continue;
    equity += result.value;
    points.push({ at: trade.exitedAt ?? trade.enteredAt, equity, tradeId: trade.id });
  }
  return points;
}

export type Bucket = { key: string; stats: TradingStats };

/**
 * Statistics per instrument, and per session.
 *
 * BY PRIMARY SESSION, not by every session the trade touched. London and
 * New York overlap for four hours; grouping by the overlap would count
 * those trades twice and produce a table whose win rates cannot be
 * compared with each other. See lib/trading/journal.ts for the two
 * different questions and why only one of them belongs here.
 */
export function statsByInstrument(trades: readonly JournalTrade[]): Bucket[] {
  return bucketed(trades, (t) => t.instrument);
}

export function statsBySession(trades: readonly JournalTrade[]): Bucket[] {
  return bucketed(trades, (t) => t.session ?? primarySessionAt(t.enteredAt));
}

function bucketed(
  trades: readonly JournalTrade[],
  keyOf: (t: JournalTrade) => string | TradingSession | null
): Bucket[] {
  const groups = new Map<string, JournalTrade[]>();
  for (const trade of trades) {
    const key = keyOf(trade);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), trade]);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, stats: computeStats(group) }))
    // Most-traded first: a table sorted by name buries the bucket the
    // trader actually lives in.
    .sort((a, b) => b.stats.counted - a.stats.counted || a.key.localeCompare(b.key));
}

export type AfterLossPattern = {
  /** Trades that immediately followed a losing trade. */
  afterLoss: number;
  afterLossWinRatePercent: number | null;
  /** Every other scoreable trade. */
  baseline: number;
  baselineWinRatePercent: number | null;
  /** Positive when trading after a loss goes WORSE. Null when either side
   *  is below the sample floor. */
  differencePercentagePoints: number | null;
};

/**
 * "Trades after a loss: 31% win rate against 58% normally."
 *
 * THE COMPARISON IS THE POINT, and it is why this is not the same as
 * lib/trading-pattern.ts's loss-continuation rate. A 31% win rate after a
 * loss means nothing on its own — the trader might win 31% of everything.
 * It is only a finding when the baseline is beside it.
 *
 * IT IS AN OBSERVATION, NOT A DIAGNOSIS. The honest sentence is "these
 * trades went worse", not "you are revenge trading" — the second is a
 * claim about somebody's state of mind from a spreadsheet.
 *
 * `trades` must be oldest first: "immediately followed" is an ordering
 * claim.
 */
export function afterLossPattern(trades: readonly JournalTrade[]): AfterLossPattern {
  const scoreable = trades.filter((t) => netPnl(t) !== null);
  const outcomes: TradeOutcome[] = scoreable.map(outcomeOf);

  let afterLoss = 0;
  let afterLossWins = 0;
  let baseline = 0;
  let baselineWins = 0;

  for (let i = 0; i < outcomes.length; i += 1) {
    const outcome = outcomes[i];
    if (outcome !== "win" && outcome !== "loss") continue;
    // BREAKEVEN DOES NOT BREAK THE CHAIN and does not start one: the
    // previous DECISIVE trade is what "after a loss" means, and a flat
    // scratch in between does not make the next trade a fresh start.
    let previous: TradeOutcome | null = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (outcomes[j] === "win" || outcomes[j] === "loss") {
        previous = outcomes[j];
        break;
      }
    }
    if (previous === "loss") {
      afterLoss += 1;
      if (outcome === "win") afterLossWins += 1;
    } else {
      baseline += 1;
      if (outcome === "win") baselineWins += 1;
    }
  }

  const afterRate = afterLoss >= MIN_SAMPLE_FOR_RATE ? (afterLossWins / afterLoss) * 100 : null;
  const baseRate = baseline >= MIN_SAMPLE_FOR_RATE ? (baselineWins / baseline) * 100 : null;

  return {
    afterLoss,
    afterLossWinRatePercent: afterRate,
    baseline,
    baselineWinRatePercent: baseRate,
    differencePercentagePoints: afterRate !== null && baseRate !== null ? baseRate - afterRate : null,
  };
}
