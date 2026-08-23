import { foldForMatch } from "@/lib/text/unicode-patterns";

/**
 * WHAT A TRADE IS, ONCE IT HAS BEEN WRITTEN DOWN.
 *
 * Pure and deterministic: no AI, no network, no database. Everything here
 * is arithmetic over numbers the user recorded, which is the only kind of
 * claim this feature is allowed to make about their trading.
 *
 * NOTHING HERE PREDICTS OR ADVISES. There is no function that says what
 * to do next, and adding one would be a product change, not a feature —
 * see lib/trading/conduct.ts.
 */

/**
 * THE FOUR SESSIONS, in UTC, and the fact everybody gets wrong: THEY
 * OVERLAP.
 *
 * London runs 07:00-16:00 and New York 12:00-21:00, so a trade opened at
 * 13:00 UTC is in BOTH. That is not an edge case, it is the busiest four
 * hours of the trading day.
 *
 * So there are two different questions and two different answers:
 *
 *   `sessionsAt`      every session containing this moment. This is what
 *                     a rule like "only London" must use — a 13:00 trade
 *                     IS a London trade, and reporting it as a violation
 *                     because something else also claimed the hour would
 *                     be wrong in the way that destroys trust in the whole
 *                     feature.
 *
 *   `primarySessionAt` ONE session, for the stored column and for
 *                     grouping statistics. Grouping by a set produces
 *                     buckets that double-count, and a "win rate by
 *                     session" whose percentages sum to 160% is not a
 *                     statistic.
 *
 * Sydney is the wrapping one (21:00-06:00), which is why the containment
 * test cannot be a simple `>= start && < end`.
 */
export const TRADING_SESSIONS = ["sydney", "tokyo", "london", "new_york", "other"] as const;
export type TradingSession = (typeof TRADING_SESSIONS)[number];

export function isTradingSession(value: unknown): value is TradingSession {
  return typeof value === "string" && (TRADING_SESSIONS as readonly string[]).includes(value);
}

/** UTC hour ranges, start inclusive, end exclusive. */
export const SESSION_HOURS_UTC: Record<Exclude<TradingSession, "other">, { start: number; end: number }> = {
  sydney: { start: 21, end: 6 },
  tokyo: { start: 0, end: 9 },
  london: { start: 7, end: 16 },
  new_york: { start: 12, end: 21 },
};

function containsHour(range: { start: number; end: number }, hour: number): boolean {
  // A range that wraps midnight (Sydney) is two intervals, not one.
  if (range.start <= range.end) return hour >= range.start && hour < range.end;
  return hour >= range.start || hour < range.end;
}

/** Every session containing this moment. Empty only when nothing does. */
export function sessionsAt(when: Date | string | null | undefined): TradingSession[] {
  const date = toDate(when);
  if (!date) return [];
  const hour = date.getUTCHours();
  const found = (Object.keys(SESSION_HOURS_UTC) as Exclude<TradingSession, "other">[]).filter((s) =>
    containsHour(SESSION_HOURS_UTC[s], hour)
  );
  return found.length > 0 ? found : ["other"];
}

/**
 * ONE session, for grouping.
 *
 * The precedence is by LIQUIDITY, highest first: London, then New York,
 * then Tokyo, then Sydney. That is a choice, it is arbitrary in the sense
 * that another order would also be defensible, and it is written down
 * here rather than left implicit in the order of an object's keys —
 * because a statistic grouped by an accidental precedence is a statistic
 * that changes when somebody reorders a literal.
 */
const PRIMARY_ORDER: TradingSession[] = ["london", "new_york", "tokyo", "sydney", "other"];

export function primarySessionAt(when: Date | string | null | undefined): TradingSession | null {
  const active = sessionsAt(when);
  if (active.length === 0) return null;
  return PRIMARY_ORDER.find((s) => active.includes(s)) ?? "other";
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * THE INSTRUMENT, normalised — so that "eur/usd", "EUR USD" and "eurusd"
 * are one bucket in the statistics rather than three.
 *
 * The user's own spelling is kept in `symbol` and never touched. This is
 * a grouping key, not a correction: a trader who writes "GER40" and means
 * the DAX gets a bucket called GER40, because renaming somebody's
 * instrument to what we think they meant is how a journal stops being
 * theirs.
 */
export function normaliseInstrument(symbol: string | null | undefined): string | null {
  if (typeof symbol !== "string") return null;
  const cleaned = symbol
    .trim()
    .toUpperCase()
    // Separators only. Letters, digits and nothing else survive, so
    // "EUR/USD", "EUR-USD" and "EUR USD" converge; "BTC-PERP" becomes
    // BTCPERP, which is still one consistent bucket.
    .replace(/[^A-Z0-9]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

export type JournalTrade = {
  id: string;
  accountId: string | null;
  instrument: string | null;
  direction: string | null;
  size: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  riskAmount: number | null;
  commission: number | null;
  pnl: number | null;
  enteredAt: string | null;
  exitedAt: string | null;
  session: TradingSession | null;
};

/** Seconds the position was open, or null when either end is missing. */
export function durationSeconds(trade: Pick<JournalTrade, "enteredAt" | "exitedAt">): number | null {
  const entered = toDate(trade.enteredAt);
  const exited = toDate(trade.exitedAt);
  if (!entered || !exited) return null;
  const seconds = Math.round((exited.getTime() - entered.getTime()) / 1000);
  // A negative duration means the row is wrong (the CHECK constraint
  // stops new ones). Null rather than a negative number: a negative
  // duration averaged into "average hold time" produces a figure that is
  // quietly wrong instead of visibly absent.
  return seconds >= 0 ? seconds : null;
}

/**
 * The trade's result in money, NET of commission where one was recorded.
 *
 * `pnl` is what the user (or an import) recorded, and is the source of
 * truth when present. When it is absent it is derived from entry, exit,
 * size and direction — and returns null rather than a guess if any of
 * those is missing, because a P&L invented from two of four numbers is
 * the input to every statistic below it.
 *
 * COMMISSION IS SUBTRACTED ONLY WHEN IT WAS RECORDED. A null commission
 * is not zero: treating it as zero would report a gross figure as a net
 * one, and the difference is exactly the thing that turns a marginally
 * profitable strategy into a losing one.
 */
export function netPnl(trade: JournalTrade): { value: number; net: boolean } | null {
  const gross = grossPnl(trade);
  if (gross === null) return null;
  if (typeof trade.commission !== "number" || !Number.isFinite(trade.commission)) {
    return { value: gross, net: false };
  }
  return { value: gross - trade.commission, net: true };
}

export function grossPnl(trade: JournalTrade): number | null {
  if (typeof trade.pnl === "number" && Number.isFinite(trade.pnl)) return trade.pnl;
  const { entryPrice, exitPrice, size } = trade;
  if (
    typeof entryPrice !== "number" || !Number.isFinite(entryPrice) ||
    typeof exitPrice !== "number" || !Number.isFinite(exitPrice) ||
    typeof size !== "number" || !Number.isFinite(size)
  ) {
    return null;
  }
  const sign = isShort(trade.direction) ? -1 : 1;
  return (exitPrice - entryPrice) * size * sign;
}

/**
 * "short", "sell", "s", "πώληση" — anything else is treated as long.
 *
 * FREE TEXT, because that column is free text and always has been: a user
 * types whatever their broker's statement says.
 *
 * FOLDED, NOT LOWER-CASED, and scripts/tests/accent-search.test.mjs is
 * the gate that insisted. `.toLowerCase()` maps "ΠΩΛΗΣΗ" to "πωληση" and
 * "Πώληση" to "πώληση" — two different strings, and a literal can only
 * be one of them. Greek is routinely typed in capitals without accents,
 * so folding is what makes a Greek trader's own word for "short"
 * actually register as one.
 */
const SHORT_WORDS = ["short", "sell", "s", "πωληση", "πωλησεισ", "πουλησα"];

export function isShort(direction: string | null | undefined): boolean {
  const folded = foldForMatch((direction ?? "").trim());
  if (!folded) return false;
  return SHORT_WORDS.some((word) => folded === word || folded.startsWith(word));
}

export type TradeOutcome = "win" | "loss" | "breakeven" | "unknown";

export function outcomeOf(trade: JournalTrade): TradeOutcome {
  const net = netPnl(trade);
  if (net === null) return "unknown";
  if (net.value > 0) return "win";
  if (net.value < 0) return "loss";
  return "breakeven";
}

/**
 * The PLANNED risk-reward ratio, from the prices the trader set at entry.
 *
 * PLANNED, NOT ACHIEVED, and this is the distinction a rule like
 * "RR >= 1:2" turns on. Computing it from the exit price would mark every
 * trade that was stopped out as a violation of the risk-reward rule —
 * punishing the trader for the stop working, which is precisely backwards.
 *
 * Null when either leg is missing, or when the stop is on the wrong side
 * of the entry (which is a data error, not a zero-risk trade).
 */
export function plannedRiskReward(trade: JournalTrade): number | null {
  const { entryPrice, stopPrice, targetPrice } = trade;
  if (
    typeof entryPrice !== "number" || typeof stopPrice !== "number" || typeof targetPrice !== "number" ||
    !Number.isFinite(entryPrice) || !Number.isFinite(stopPrice) || !Number.isFinite(targetPrice)
  ) {
    return null;
  }
  const risk = Math.abs(entryPrice - stopPrice);
  const reward = Math.abs(targetPrice - entryPrice);
  // BELT AND BRACES, and knowingly redundant: the side checks below
  // already reject a stop at the entry, so `risk` is strictly positive by
  // the time this could matter. Kept because a future edit to those
  // checks would otherwise make a division by zero reachable, and
  // Infinity flowing into a risk-reward comparison marks every trade
  // compliant. scripts/tests/trading-journal.mutation.mjs deliberately
  // carries no mutant for this line — there is no way to make it fire
  // that the checks below do not already catch, and a mutant that cannot
  // fail is a mutant that teaches nothing.
  if (risk <= 0) return null;
  const short = isShort(trade.direction);
  // The stop must be BELOW entry on a long and ABOVE it on a short. A row
  // that says otherwise is mis-entered, and computing a ratio from it
  // would produce a confident number about a trade that cannot exist.
  if (short ? stopPrice <= entryPrice : stopPrice >= entryPrice) return null;
  if (short ? targetPrice >= entryPrice : targetPrice <= entryPrice) return null;
  return reward / risk;
}

/** The calendar day a trade belongs to, in UTC, as YYYY-MM-DD. Used by
 *  the per-day rules; UTC because the account has no timezone and
 *  guessing one would move trades between days. */
export function tradingDay(when: Date | string | null | undefined): string | null {
  const date = toDate(when);
  return date ? date.toISOString().slice(0, 10) : null;
}
