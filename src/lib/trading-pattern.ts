// Pure, deterministic pattern check over the user's own trades — no AI
// call, no machine learning, just a conditional-probability count. Trading
// Workflow's flagship "moat" insight per the brief: of the trades that
// immediately followed a loss, how many were also losses.

export type TradeForPattern = {
  id: string;
  created_at: string;
  result: string | null;
  pnl: number | null;
};

export type TradeOutcome = "win" | "loss" | "unknown";

const SAMPLE_SIZE = 10;
// Below this many loss->trade pairs, a "continuation rate" is just noise
// (e.g. 1-for-1 is either 0% or 100%) — nothing is shown instead of a
// misleadingly precise-looking number.
const MIN_PAIRS_FOR_PATTERN = 3;

// pnl (a real signed number) is the unambiguous source of truth when
// present; the free-text `result` field (placeholder "win / loss", not an
// enforced enum — see lib/modules.ts) is only a fallback for rows where
// pnl was left blank.
function outcomeFor(trade: TradeForPattern): TradeOutcome {
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
