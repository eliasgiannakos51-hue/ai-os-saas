// The insight detectors.
//
// THE ONE DESIGN DECISION THAT MATTERS HERE: the patterns are found by
// THIS CODE, not by a model. A model is given the numbers afterwards and
// asked only to phrase them.
//
// The reason is the requirement itself — "only real patterns from the
// user's own data, never generic advice, and if there is not enough data
// then say so rather than inventing something". A model handed a
// spreadsheet and asked to find patterns will always find some, because
// that is what it was asked for; it has no way to distinguish "the three
// worst trades were on a Monday" (a fact) from "the three worst trades
// were on a Monday, suggesting you trade emotionally after the weekend"
// (a story). Both come out in the same confident sentence, and the user
// cannot tell which is which.
//
// So every claim this product makes about somebody's business is
// computed, has a sample size, and carries the numbers it rests on. The
// model's job is grammar.
//
// Pure functions over plain rows: no database, no network, no clock
// except what is passed in. That is what makes them testable against
// fixtures where the right answer is known in advance.

export type DetectorEvidence = Record<string, string | number | boolean | string[] | number[]>;

export type Finding = {
  /** Stable identifier, also stored on the row. A fixed vocabulary is
   *  what makes "which code produced this claim" answerable. */
  detector: string;
  /** Where the user goes to check it. */
  moduleSlug: string;
  /** How many of their rows the pattern rests on. Shown to the user: a
   *  pattern in nine rows is a hint, and saying so is the difference
   *  between an insight and a horoscope. */
  sampleSize: number;
  /** The numbers, stored alongside the sentence so the claim stays
   *  auditable after the fact. */
  evidence: DetectorEvidence;
  /**
   * The claim, in plain English, already true.
   *
   * The narrator rewrites this into the user's language and voice — it
   * does NOT get to add to it. Producing the finished sentence here is
   * what makes the model's step safe to check: if the narration contains
   * a number that is not in `evidence`, it is rejected.
   */
  statement: string;
};

// ---------------------------------------------------------------------
// Row shapes. Deliberately minimal — a detector should not need to know
// what else is on the table.
// ---------------------------------------------------------------------

export type TradeRow = {
  symbol?: string | null;
  direction?: string | null;
  result?: string | null;
  pnl?: number | string | null;
  occurred_at?: string | null;
};

export type FinanceRow = {
  description?: string | null;
  type?: string | null;
  amount?: number | string | null;
  counterparty?: string | null;
  occurred_at?: string | null;
};

export type CountRow = { created_at?: string | null };

// ---------------------------------------------------------------------
// Minimum evidence.
//
// These are the thresholds below which a detector returns nothing. They
// are the "do not invent" rule expressed as code: a pattern in four rows
// is noise, and the honest output for four rows is silence, not a
// hedged sentence.
// ---------------------------------------------------------------------

export const MIN_TRADES = 12;
export const MIN_LOSING_TRADES = 5;
export const MIN_FINANCE_ROWS = 8;
export const MIN_COUNTERPARTIES = 3;
export const MIN_MONTHS = 3;

/** A weekday concentration has to beat chance by this much to be worth
 *  saying. 3/5 of losses on one weekday is not a finding; the bar is set
 *  where the pattern is visible to the naked eye once pointed out. */
const WEEKDAY_SHARE_THRESHOLD = 0.5;

/** Revenue concentration worth flagging. Two clients at 40% is the
 *  spec's own example and is a genuine risk; two at 25% of a
 *  well-spread book is not news. */
const CONCENTRATION_THRESHOLD = 0.4;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * A row is only usable for a time-based pattern if it knows when it
 * happened.
 *
 * `created_at` is NOT a fallback, and that is the point. An import
 * writes 400 rows in one second; treating the write time as the event
 * time would make every imported trade land on the same weekday, and the
 * detector would then "find" a 100% Monday concentration that is purely
 * an artefact of when the file was uploaded. That is the exact failure
 * this whole feature exists to avoid, so a row with no `occurred_at` is
 * excluded rather than approximated.
 */
function datable<T extends { occurred_at?: string | null }>(rows: T[]): (T & { at: Date })[] {
  const out: (T & { at: Date })[] = [];
  for (const row of rows) {
    if (!row.occurred_at) continue;
    const at = new Date(row.occurred_at);
    if (Number.isNaN(at.getTime())) continue;
    out.push({ ...row, at });
  }
  return out;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function pct(share: number): number {
  return Math.round(share * 100);
}

/** Group by a normalised key so "Acme Ltd" and "acme ltd " are one
 *  client. Casing and trailing whitespace are formatting, not identity,
 *  and a concentration analysis that splits one client into three is
 *  worse than none. */
function normaliseName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------
// 1. Losses concentrated on one weekday.
// ---------------------------------------------------------------------

/**
 * "Your three worst trades were all on a Monday."
 *
 * Looks at the WORST losses specifically rather than all losing trades,
 * because that is the claim people actually recognise — and it is
 * checkable: the detector names the symbols, so the user can go and
 * look.
 */
export function detectWorstTradeWeekday(trades: TradeRow[]): Finding | null {
  const rows = datable(trades);
  if (rows.length < MIN_TRADES) return null;

  const losses = rows
    .map((row) => ({ ...row, value: toNumber(row.pnl) }))
    .filter((row): row is typeof row & { value: number } => row.value !== null && row.value < 0)
    .sort((a, b) => a.value - b.value);

  if (losses.length < MIN_LOSING_TRADES) return null;

  // The worst three, or the worst quarter of the losses when there are
  // many — a fixed 3 out of 200 losses would be a coincidence, not a
  // pattern.
  const takeCount = Math.max(3, Math.min(10, Math.round(losses.length * 0.25)));
  const worst = losses.slice(0, takeCount);

  const byDay = new Map<number, number>();
  for (const row of worst) {
    const day = row.at.getUTCDay();
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  let topDay = -1;
  let topCount = 0;
  for (const [day, count] of byDay) {
    if (count > topCount) {
      topCount = count;
      topDay = day;
    }
  }

  const share = topCount / worst.length;
  if (share < WEEKDAY_SHARE_THRESHOLD || topCount < 3) return null;

  // The baseline matters: if a third of ALL trades are on Mondays,
  // Mondays holding a third of the worst losses is not a finding.
  const baselineCount = rows.filter((r) => r.at.getUTCDay() === topDay).length;
  const baselineShare = baselineCount / rows.length;
  if (share <= baselineShare * 1.4) return null;

  const day = WEEKDAYS[topDay];
  const total = round(worst.reduce((sum, r) => sum + r.value, 0));

  return {
    detector: "worst_trade_weekday",
    moduleSlug: "trading",
    sampleSize: rows.length,
    evidence: {
      weekday: day,
      worstCount: worst.length,
      onThatDay: topCount,
      sharePercent: pct(share),
      baselinePercent: pct(baselineShare),
      combinedPnl: total,
      symbols: worst.filter((r) => r.at.getUTCDay() === topDay).map((r) => String(r.symbol ?? "?")).slice(0, 5),
      datedTrades: rows.length,
      totalTrades: trades.length,
    },
    statement: `${topCount} of your ${worst.length} worst trades happened on a ${day}, which is ${pct(share)}% of them against a ${pct(baselineShare)}% baseline. Together those ${day} trades lost ${Math.abs(total)}.`,
  };
}

// ---------------------------------------------------------------------
// 2. Win rate differs sharply by direction.
// ---------------------------------------------------------------------

export function detectDirectionWinRate(trades: TradeRow[]): Finding | null {
  const usable = trades
    .map((row) => ({
      direction: row.direction ? normaliseName(row.direction) : null,
      value: toNumber(row.pnl),
      result: row.result ? normaliseName(row.result) : null,
    }))
    .filter((row) => row.direction === "long" || row.direction === "short")
    .map((row) => ({
      direction: row.direction as "long" | "short",
      // The result column when present, the P&L sign otherwise. Both are
      // the user's own record; neither is inferred from anything else.
      won: row.result ? row.result === "win" : row.value !== null ? row.value > 0 : null,
    }))
    .filter((row): row is { direction: "long" | "short"; won: boolean } => row.won !== null);

  if (usable.length < MIN_TRADES) return null;

  const longs = usable.filter((r) => r.direction === "long");
  const shorts = usable.filter((r) => r.direction === "short");
  // Each side needs enough rows to have a rate at all. Comparing a 100%
  // win rate over two trades against anything is not a comparison.
  if (longs.length < 5 || shorts.length < 5) return null;

  const longRate = longs.filter((r) => r.won).length / longs.length;
  const shortRate = shorts.filter((r) => r.won).length / shorts.length;
  const gap = Math.abs(longRate - shortRate);
  if (gap < 0.25) return null;

  const better = longRate > shortRate ? "long" : "short";
  const worse = better === "long" ? "short" : "long";

  return {
    detector: "direction_win_rate",
    moduleSlug: "trading",
    sampleSize: usable.length,
    evidence: {
      betterSide: better,
      worseSide: worse,
      longPercent: pct(longRate),
      shortPercent: pct(shortRate),
      longCount: longs.length,
      shortCount: shorts.length,
      gapPercent: pct(gap),
    },
    statement: `Your ${better} trades win ${pct(better === "long" ? longRate : shortRate)}% of the time across ${better === "long" ? longs.length : shorts.length} trades, while your ${worse} trades win ${pct(worse === "long" ? longRate : shortRate)}% across ${worse === "long" ? longs.length : shorts.length}.`,
  };
}

// ---------------------------------------------------------------------
// 3. Revenue concentrated in a few clients.
// ---------------------------------------------------------------------

/**
 * "40% of your revenue comes from two clients."
 *
 * Grouped on `counterparty`, falling back to `description` only when the
 * counterparty column is genuinely absent for every row — a book kept
 * with the client name in the memo field is common, and refusing to
 * analyse it would mean refusing most real exports. When the fallback is
 * used it is recorded in the evidence, so the claim carries its own
 * caveat.
 */
export function detectRevenueConcentration(entries: FinanceRow[]): Finding | null {
  const income = entries
    .map((row) => ({
      amount: toNumber(row.amount),
      party: row.counterparty?.trim() || null,
      description: row.description?.trim() || null,
      type: row.type ? normaliseName(row.type) : null,
    }))
    .filter((row): row is typeof row & { amount: number } => row.amount !== null && row.type === "income");

  if (income.length < MIN_FINANCE_ROWS) return null;

  const usedFallback = income.every((row) => !row.party);
  const keyed = income
    .map((row) => ({ amount: Math.abs(row.amount), name: (row.party ?? row.description ?? "").trim() }))
    .filter((row) => row.name.length > 0);

  if (keyed.length < MIN_FINANCE_ROWS) return null;

  const totals = new Map<string, { label: string; total: number; count: number }>();
  for (const row of keyed) {
    const key = normaliseName(row.name);
    const existing = totals.get(key);
    if (existing) {
      existing.total += row.amount;
      existing.count++;
    } else {
      totals.set(key, { label: row.name, total: row.amount, count: 1 });
    }
  }

  if (totals.size < MIN_COUNTERPARTIES) return null;

  const ranked = [...totals.values()].sort((a, b) => b.total - a.total);
  const grandTotal = ranked.reduce((sum, r) => sum + r.total, 0);
  if (grandTotal <= 0) return null;

  const topTwo = ranked.slice(0, 2);
  const share = topTwo.reduce((sum, r) => sum + r.total, 0) / grandTotal;
  if (share < CONCENTRATION_THRESHOLD) return null;

  return {
    detector: "revenue_concentration",
    moduleSlug: "finance",
    sampleSize: income.length,
    evidence: {
      sharePercent: pct(share),
      topNames: topTwo.map((r) => r.label),
      topAmounts: topTwo.map((r) => round(r.total)),
      totalClients: totals.size,
      totalIncome: round(grandTotal),
      groupedByDescription: usedFallback,
    },
    statement: `${pct(share)}% of your recorded income comes from ${topTwo.length} of ${totals.size} sources: ${topTwo.map((r) => r.label).join(" and ")}.`,
  };
}

// ---------------------------------------------------------------------
// 4. One supplier taking a large share of spend.
// ---------------------------------------------------------------------

export function detectExpenseConcentration(entries: FinanceRow[]): Finding | null {
  const expenses = entries
    .map((row) => ({
      amount: toNumber(row.amount),
      name: (row.counterparty?.trim() || row.description?.trim() || "").trim(),
      type: row.type ? normaliseName(row.type) : null,
    }))
    .filter((row): row is typeof row & { amount: number } => row.amount !== null && row.type === "expense" && row.name.length > 0);

  if (expenses.length < MIN_FINANCE_ROWS) return null;

  const totals = new Map<string, { label: string; total: number; count: number }>();
  for (const row of expenses) {
    const key = normaliseName(row.name);
    const existing = totals.get(key);
    if (existing) {
      existing.total += Math.abs(row.amount);
      existing.count++;
    } else {
      totals.set(key, { label: row.name, total: Math.abs(row.amount), count: 1 });
    }
  }
  if (totals.size < MIN_COUNTERPARTIES) return null;

  const ranked = [...totals.values()].sort((a, b) => b.total - a.total);
  const grandTotal = ranked.reduce((sum, r) => sum + r.total, 0);
  if (grandTotal <= 0) return null;

  const top = ranked[0];
  const share = top.total / grandTotal;
  if (share < 0.3) return null;

  return {
    detector: "expense_concentration",
    moduleSlug: "finance",
    sampleSize: expenses.length,
    evidence: {
      sharePercent: pct(share),
      name: top.label,
      amount: round(top.total),
      entries: top.count,
      totalSuppliers: totals.size,
      totalSpend: round(grandTotal),
    },
    statement: `${pct(share)}% of your recorded spending goes to ${top.label} — ${round(top.total)} across ${top.count} entries.`,
  };
}

// ---------------------------------------------------------------------
// 5. Margin moving month over month.
// ---------------------------------------------------------------------

export function detectMarginTrend(entries: FinanceRow[]): Finding | null {
  const rows = datable(entries)
    .map((row) => ({
      at: row.at,
      amount: toNumber(row.amount),
      type: row.type ? normaliseName(row.type) : null,
    }))
    .filter((row): row is typeof row & { amount: number } => row.amount !== null && (row.type === "income" || row.type === "expense"));

  if (rows.length < MIN_FINANCE_ROWS) return null;

  const months = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    const key = `${row.at.getUTCFullYear()}-${String(row.at.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = months.get(key) ?? { income: 0, expense: 0 };
    if (row.type === "income") bucket.income += Math.abs(row.amount);
    else bucket.expense += Math.abs(row.amount);
    months.set(key, bucket);
  }

  const ordered = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (ordered.length < MIN_MONTHS) return null;

  // The last complete month against the average of the ones before it.
  // Comparing to the immediately preceding month alone turns ordinary
  // month-to-month noise into a "trend".
  const latest = ordered[ordered.length - 1];
  const earlier = ordered.slice(0, -1);

  const latestNet = latest[1].income - latest[1].expense;
  const earlierNet = earlier.reduce((sum, [, m]) => sum + (m.income - m.expense), 0) / earlier.length;
  if (earlierNet === 0) return null;

  const change = (latestNet - earlierNet) / Math.abs(earlierNet);
  if (Math.abs(change) < 0.3) return null;

  return {
    detector: "margin_trend",
    moduleSlug: "finance",
    sampleSize: rows.length,
    evidence: {
      month: latest[0],
      latestNet: round(latestNet),
      averageNet: round(earlierNet),
      changePercent: pct(Math.abs(change)),
      direction: change > 0 ? "up" : "down",
      monthsCompared: ordered.length,
    },
    statement: `In ${latest[0]} your income minus expenses was ${round(latestNet)}, ${change > 0 ? "up" : "down"} ${pct(Math.abs(change))}% against the ${round(earlierNet)} average of the previous ${earlier.length} months.`,
  };
}

// ---------------------------------------------------------------------
// 6. A single loss that dwarfs the rest.
// ---------------------------------------------------------------------

export function detectOutlierLoss(trades: TradeRow[]): Finding | null {
  const losses = trades
    .map((row) => ({ symbol: row.symbol, value: toNumber(row.pnl) }))
    .filter((row): row is { symbol: string | null | undefined; value: number } => row.value !== null && row.value < 0)
    .sort((a, b) => a.value - b.value);

  if (losses.length < MIN_LOSING_TRADES + 3) return null;

  const worst = losses[0];
  const rest = losses.slice(1);
  const averageRest = rest.reduce((sum, r) => sum + Math.abs(r.value), 0) / rest.length;
  if (averageRest <= 0) return null;

  const ratio = Math.abs(worst.value) / averageRest;
  if (ratio < 3) return null;

  const totalLoss = losses.reduce((sum, r) => sum + Math.abs(r.value), 0);

  return {
    detector: "outlier_loss",
    moduleSlug: "trading",
    sampleSize: losses.length,
    evidence: {
      symbol: String(worst.symbol ?? "?"),
      amount: round(Math.abs(worst.value)),
      averageLoss: round(averageRest),
      timesLarger: round(ratio, 1),
      shareOfLossesPercent: pct(Math.abs(worst.value) / totalLoss),
      losingTrades: losses.length,
    },
    statement: `One trade in ${String(worst.symbol ?? "?")} lost ${round(Math.abs(worst.value))}, which is ${round(ratio, 1)} times your average losing trade of ${round(averageRest)} and ${pct(Math.abs(worst.value) / totalLoss)}% of everything you lost.`,
  };
}

// ---------------------------------------------------------------------
// 7. Captured but never acted on.
// ---------------------------------------------------------------------

/** "You have 12 ideas logged and none of them became a mission." A count
 *  comparison, so it needs no dates and works on day one. */
export function detectUnactionedIdeas(ideas: CountRow[], missionCount: number): Finding | null {
  if (ideas.length < 5) return null;
  if (missionCount > 0) return null;

  return {
    detector: "unactioned_ideas",
    moduleSlug: "ideas",
    sampleSize: ideas.length,
    evidence: { ideaCount: ideas.length, missionCount },
    statement: `You have ${ideas.length} ideas recorded and none of them has been turned into a mission yet.`,
  };
}

// ---------------------------------------------------------------------
// 8. Rows that arrived without a date.
// ---------------------------------------------------------------------

/**
 * Not a business insight — a data-quality one, and the most useful thing
 * we can say when the time-based detectors found nothing.
 *
 * "I could not look for patterns over time because 380 of your 400 rows
 * have no date" is a true, specific, actionable sentence. The
 * alternative, staying silent, leaves the user thinking there was
 * nothing to find.
 */
export function detectMissingDates(
  rows: { occurred_at?: string | null }[],
  moduleSlug: string
): Finding | null {
  if (rows.length < MIN_TRADES) return null;
  const withDate = datable(rows).length;
  const without = rows.length - withDate;
  if (without === 0) return null;
  if (without / rows.length < 0.5) return null;

  return {
    detector: "missing_dates",
    moduleSlug,
    sampleSize: rows.length,
    evidence: { total: rows.length, withoutDate: without, withDate },
    statement: `${without} of your ${rows.length} rows have no date, so patterns over time cannot be checked on them.`,
  };
}

// ---------------------------------------------------------------------
// The whole pass.
// ---------------------------------------------------------------------

export type DetectorInput = {
  trades: TradeRow[];
  finance: FinanceRow[];
  ideas: CountRow[];
  missionCount: number;
};

/**
 * Run every detector and return what actually fired, best first.
 *
 * "Best" is a deliberate ordering rather than a score: a finding about
 * where the money comes from outranks one about a trading weekday, which
 * outranks a data-quality note. The user sees three to five of these and
 * the first one has to be the one worth reading.
 */
export function runDetectors(input: DetectorInput): Finding[] {
  const findings: (Finding | null)[] = [
    detectRevenueConcentration(input.finance),
    detectWorstTradeWeekday(input.trades),
    detectMarginTrend(input.finance),
    detectExpenseConcentration(input.finance),
    detectDirectionWinRate(input.trades),
    detectOutlierLoss(input.trades),
    detectUnactionedIdeas(input.ideas, input.missionCount),
    detectMissingDates(input.trades, "trading"),
    detectMissingDates(input.finance, "finance"),
  ];

  return findings.filter((f): f is Finding => f !== null);
}

/** How many findings we will ever show at once. Five is the spec's
 *  ceiling and also about the number a person reads before scrolling
 *  past. */
export const MAX_INSIGHTS = 5;
