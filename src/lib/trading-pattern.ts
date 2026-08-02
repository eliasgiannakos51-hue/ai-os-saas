// Pure, deterministic pattern check over the user's own trades — no AI
// call, no machine learning, just a conditional-probability count. Trading
// Workflow's flagship "moat" insight per the brief: of the trades that
// immediately followed a loss, how many were also losses.

export type TradeForPattern = {
  id: string;
  created_at: string;
  result: string | null;
  pnl: number | null;
  symbol: string | null;
};

export type TradeOutcome = "win" | "loss" | "unknown";

const SAMPLE_SIZE = 10;
// Below this many loss->trade pairs, a "continuation rate" is just noise
// (e.g. 1-for-1 is either 0% or 100%) — nothing is shown instead of a
// misleadingly precise-looking number.
const MIN_PAIRS_FOR_PATTERN = 3;

// Same reasoning as MIN_PAIRS_FOR_PATTERN, applied to the hour/day-of-week/
// symbol buckets below: a bucket with only 1-2 trades has a "win rate"
// that's really just a coin flip, not a real pattern.
const MIN_BUCKET_SAMPLES = 3;

// pnl (a real signed number) is the unambiguous source of truth when
// present; the free-text `result` field (placeholder "win / loss", not an
// enforced enum — see lib/modules.ts) is only a fallback for rows where
// pnl was left blank.
export function outcomeFor(trade: TradeForPattern): TradeOutcome {
  if (typeof trade.pnl === "number") {
    if (trade.pnl < 0) return "loss";
    if (trade.pnl > 0) return "win";
    return "unknown";
  }
  const result = (trade.result ?? "").trim().toLowerCase();
  if (result.includes("loss") || result.includes("lose") || result.includes("lost")) return "loss";
  if (result.includes("win")) return "win";
  return "unknown";
}

export type LossStreakPattern = {
  analyzedCount: number;
  pairsAfterLoss: number;
  lossesAfterLoss: number;
  continuationRatePercent: number;
};

// `trades` is expected newest-first (as fetched), same order the trades
// table is always queried in across this app. Analyzes only the most
// recent SAMPLE_SIZE trades with a determinable win/loss outcome.
export function detectLossStreakPattern(trades: TradeForPattern[]): LossStreakPattern | null {
  const sample = trades.slice(0, SAMPLE_SIZE).slice().reverse(); // oldest -> newest
  const outcomes = sample.map(outcomeFor);

  let pairsAfterLoss = 0;
  let lossesAfterLoss = 0;
  for (let i = 1; i < outcomes.length; i++) {
    if (outcomes[i - 1] === "loss" && outcomes[i] !== "unknown") {
      pairsAfterLoss += 1;
      if (outcomes[i] === "loss") lossesAfterLoss += 1;
    }
  }

  if (pairsAfterLoss < MIN_PAIRS_FOR_PATTERN) return null;

  return {
    analyzedCount: sample.length,
    pairsAfterLoss,
    lossesAfterLoss,
    continuationRatePercent: Math.round((lossesAfterLoss / pairsAfterLoss) * 100),
  };
}

type BucketEntry = { wins: number; losses: number };

// Groups every trade with a determinable outcome into buckets by keyFn
// (e.g. hour of day, day of week, symbol), counting wins/losses per
// bucket. Uses the FULL trade history, not just the last SAMPLE_SIZE like
// detectLossStreakPattern — a per-symbol or per-hour win rate needs as
// much data as it can get, since it's already being split into buckets.
function bucketOutcomes<K>(
  trades: TradeForPattern[],
  keyFn: (trade: TradeForPattern) => K
): Map<K, BucketEntry> {
  const map = new Map<K, BucketEntry>();
  for (const trade of trades) {
    const outcome = outcomeFor(trade);
    if (outcome === "unknown") continue;
    const key = keyFn(trade);
    const entry = map.get(key) ?? { wins: 0, losses: 0 };
    if (outcome === "win") entry.wins += 1;
    else entry.losses += 1;
    map.set(key, entry);
  }
  return map;
}

type BestBucket<K> = { key: K; winRatePercent: number; sampleSize: number };

// Picks the highest-win-rate bucket among those with at least
// MIN_BUCKET_SAMPLES trades — ties broken by whichever has more trades
// (a more reliable number beats a smaller sample at the same rate).
function bestQualifyingBucket<K>(stats: Map<K, BucketEntry>): BestBucket<K> | null {
  let best: BestBucket<K> | null = null;
  for (const [key, entry] of stats) {
    const total = entry.wins + entry.losses;
    if (total < MIN_BUCKET_SAMPLES) continue;
    const winRatePercent = Math.round((entry.wins / total) * 100);
    if (
      !best ||
      winRatePercent > best.winRatePercent ||
      (winRatePercent === best.winRatePercent && total > best.sampleSize)
    ) {
      best = { key, winRatePercent, sampleSize: total };
    }
  }
  return best;
}

export type HourOfDayPattern = {
  hour: number;
  winRatePercent: number;
  sampleSize: number;
};

// Best-performing hour of day (0-23), by created_at's hour on whatever
// clock the server runs on — same limitation as every other server-side
// "now"-based calculation in this app (e.g. reflection.ts's rolling
// windows): no reliable per-user timezone is available here, so this is
// an honest (if not timezone-personalized) signal rather than a
// fabricated precise one.
export function detectHourOfDayPattern(trades: TradeForPattern[]): HourOfDayPattern | null {
  const stats = bucketOutcomes(trades, (t) => new Date(t.created_at).getHours());
  const best = bestQualifyingBucket(stats);
  return best ? { hour: best.key, winRatePercent: best.winRatePercent, sampleSize: best.sampleSize } : null;
}

export type DayOfWeekPattern = {
  // JS Date#getDay() convention: 0 = Sunday ... 6 = Saturday.
  dayIndex: number;
  winRatePercent: number;
  sampleSize: number;
};

export function detectDayOfWeekPattern(trades: TradeForPattern[]): DayOfWeekPattern | null {
  const stats = bucketOutcomes(trades, (t) => new Date(t.created_at).getDay());
  const best = bestQualifyingBucket(stats);
  return best ? { dayIndex: best.key, winRatePercent: best.winRatePercent, sampleSize: best.sampleSize } : null;
}

export type SymbolPerformancePattern = {
  symbol: string;
  winRatePercent: number;
  sampleSize: number;
};

// Best-performing symbol/instrument — only meaningful once the user has
// traded at least 2 DIFFERENT symbols with enough history each (a single
// symbol's "best symbol" is trivially itself, not a real insight).
export function detectSymbolPerformance(trades: TradeForPattern[]): SymbolPerformancePattern | null {
  const stats = bucketOutcomes(trades, (t) => (t.symbol ?? "").trim().toUpperCase() || "UNKNOWN");
  const qualifyingSymbolCount = [...stats.values()].filter(
    (entry) => entry.wins + entry.losses >= MIN_BUCKET_SAMPLES
  ).length;
  if (qualifyingSymbolCount < 2) return null;

  const best = bestQualifyingBucket(stats);
  return best
    ? { symbol: best.key, winRatePercent: best.winRatePercent, sampleSize: best.sampleSize }
    : null;
}
