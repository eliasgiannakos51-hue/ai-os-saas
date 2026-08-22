import {
  netPnl,
  outcomeOf,
  plannedRiskReward,
  sessionsAt,
  tradingDay,
  type JournalTrade,
} from "@/lib/trading/journal";
import type { RuleKind, RuleParams, TradingRule } from "@/lib/trading/rules";

/**
 * THE STRATEGY GUARDIAN: the user's own rules, counted.
 *
 * Every function here is arithmetic. No model is asked anything, so the
 * same trades and the same rules always produce the same violations —
 * which is what makes "eight times in March" a fact the trader can check
 * one by one rather than a number they have to take on faith.
 *
 * WHAT IT NEVER DOES. It does not say a trade was wrong, only that it did
 * not match a rule the user wrote. It does not suggest a different trade.
 * It has no opinion about the market. The difference is the entire
 * product: "you broke your own 2% rule" is a mirror; "don't buy EURUSD"
 * is advice, and this product does not give it.
 *
 * A RULE THAT CANNOT BE CHECKED IS REPORTED AS UNCHECKABLE, never as
 * passed. A trade with no risk_amount cannot be measured against a 2%
 * rule, and silently treating it as compliant would mean a journal full
 * of unrecorded risk showing a perfect record.
 */

export type ViolationDetail = {
  observed: number | string | null;
  allowed: number | string | null;
  unit: string;
};

export type Violation = {
  tradeId: string;
  ruleId: string;
  ruleKind: RuleKind;
  ruleText: string;
  occurredAt: string | null;
  detail: ViolationDetail;
};

export type Uncheckable = {
  tradeId: string;
  ruleId: string;
  ruleKind: RuleKind;
  /** Which field was missing — so the UI can say "add your risk amount"
   *  rather than "could not check". */
  missing: string;
};

export type GuardianResult = {
  violations: Violation[];
  uncheckable: Uncheckable[];
  /** Trades that were evaluated against at least one rule. */
  evaluated: number;
};

export type GuardianContext = {
  /** The account's starting balance, for percentage-risk rules. Null
   *  makes those rules uncheckable rather than assumed. */
  startingBalance: number | null;
};

/**
 * `trades` must be oldest first: three rules depend on order or on what
 * else happened that day.
 */
export function evaluate(
  trades: readonly JournalTrade[],
  rules: readonly TradingRule[],
  context: GuardianContext
): GuardianResult {
  const active = rules.filter((r) => r.isActive);
  const violations: Violation[] = [];
  const uncheckable: Uncheckable[] = [];
  const evaluatedIds = new Set<string>();

  // Per-day indexes, built once. A rule like "max 3 trades a day" is
  // about the trade's neighbours, not the trade.
  const byDay = new Map<string, JournalTrade[]>();
  for (const trade of trades) {
    const day = tradingDay(trade.enteredAt ?? trade.exitedAt);
    if (!day) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), trade]);
  }

  for (const rule of active) {
    for (const [index, trade] of trades.entries()) {
      // A rule scoped to one account ignores trades made in another.
      if (rule.accountId && trade.accountId !== rule.accountId) continue;
      evaluatedIds.add(trade.id);

      const outcome = check(rule.params, {
        trade,
        index,
        trades,
        byDay,
        startingBalance: context.startingBalance,
      });
      if (outcome.kind === "ok") continue;
      if (outcome.kind === "uncheckable") {
        uncheckable.push({
          tradeId: trade.id,
          ruleId: rule.id,
          ruleKind: rule.params.kind,
          missing: outcome.missing,
        });
        continue;
      }
      violations.push({
        tradeId: trade.id,
        ruleId: rule.id,
        ruleKind: rule.params.kind,
        ruleText: rule.originalText,
        occurredAt: trade.exitedAt ?? trade.enteredAt,
        detail: outcome.detail,
      });
    }
  }

  return { violations, uncheckable, evaluated: evaluatedIds.size };
}

type CheckInput = {
  trade: JournalTrade;
  index: number;
  trades: readonly JournalTrade[];
  byDay: Map<string, JournalTrade[]>;
  startingBalance: number | null;
};

type CheckOutcome =
  | { kind: "ok" }
  | { kind: "uncheckable"; missing: string }
  | { kind: "violation"; detail: ViolationDetail };

function check(params: RuleParams, input: CheckInput): CheckOutcome {
  const { trade } = input;

  switch (params.kind) {
    case "max_risk_percent": {
      if (input.startingBalance === null || input.startingBalance <= 0) {
        return { kind: "uncheckable", missing: "account starting balance" };
      }
      if (typeof trade.riskAmount !== "number" || !Number.isFinite(trade.riskAmount)) {
        return { kind: "uncheckable", missing: "risk amount on the trade" };
      }
      const percent = (trade.riskAmount / input.startingBalance) * 100;
      // Rounded to two places before comparing. Floating point makes a
      // risk of exactly 2% come out as 2.0000000000000004 often enough
      // to matter, and flagging a trader for a rounding error is the
      // fastest way to make them stop believing the report.
      const rounded = Math.round(percent * 100) / 100;
      return rounded > params.percent
        ? { kind: "violation", detail: { observed: rounded, allowed: params.percent, unit: "percent" } }
        : { kind: "ok" };
    }

    case "max_trades_per_day": {
      const day = tradingDay(trade.enteredAt ?? trade.exitedAt);
      if (!day) return { kind: "uncheckable", missing: "entry time" };
      const sameDay = input.byDay.get(day) ?? [];
      // THE POSITION IN THE DAY, not the day's total. Flagging all five
      // trades on a five-trade day against a limit of three would report
      // five violations for one broken rule; flagging the fourth and
      // fifth reports what actually happened.
      const position = sameDay.findIndex((t) => t.id === trade.id) + 1;
      return position > params.count
        ? { kind: "violation", detail: { observed: position, allowed: params.count, unit: "trades that day" } }
        : { kind: "ok" };
    }

    case "min_risk_reward": {
      const rr = plannedRiskReward(trade);
      if (rr === null) return { kind: "uncheckable", missing: "entry, stop and target prices" };
      const rounded = Math.round(rr * 100) / 100;
      return rounded < params.ratio
        ? { kind: "violation", detail: { observed: rounded, allowed: params.ratio, unit: "reward per unit of risk" } }
        : { kind: "ok" };
    }

    case "allowed_sessions": {
      const when = trade.enteredAt;
      if (!when) return { kind: "uncheckable", missing: "entry time" };
      // EVERY session containing the entry, not the primary one. London
      // and New York overlap for four hours, and a 13:00 UTC trade IS a
      // London trade — reporting it as a violation of "only London"
      // because the grouping key happened to say new_york would be wrong
      // in the way that ends trust in the feature.
      const active = sessionsAt(when);
      return active.some((s) => params.sessions.includes(s))
        ? { kind: "ok" }
        : {
            kind: "violation",
            detail: { observed: active.join(", "), allowed: params.sessions.join(", "), unit: "session" },
          };
    }

    case "allowed_instruments": {
      if (!trade.instrument) return { kind: "uncheckable", missing: "instrument" };
      return params.instruments.includes(trade.instrument)
        ? { kind: "ok" }
        : {
            kind: "violation",
            detail: { observed: trade.instrument, allowed: params.instruments.join(", "), unit: "instrument" },
          };
    }

    case "max_daily_loss": {
      const day = tradingDay(trade.exitedAt ?? trade.enteredAt);
      if (!day) return { kind: "uncheckable", missing: "exit time" };
      const sameDay = input.byDay.get(day) ?? [];
      // THE RUNNING TOTAL UP TO AND INCLUDING THIS TRADE. The rule is
      // "stop when you are down 500 today", so the violation is the trade
      // that took the day past the limit and every one after it — not
      // the whole day retroactively, which would flag the winning trades
      // that came before the loss.
      let running = 0;
      let crossedHere = false;
      for (const other of sameDay) {
        const value = netPnl(other);
        if (value === null) continue;
        running += value.value;
        if (other.id === trade.id) {
          crossedHere = running < -params.amount;
          break;
        }
      }
      return crossedHere
        ? {
            kind: "violation",
            detail: { observed: Math.round(running * 100) / 100, allowed: -params.amount, unit: "money that day" },
          }
        : { kind: "ok" };
    }

    case "no_trade_after_loss": {
      if (!trade.enteredAt) return { kind: "uncheckable", missing: "entry time" };
      // The most recent DECISIVE trade before this one, by exit time.
      let previousLossExit: number | null = null;
      for (let i = input.index - 1; i >= 0; i -= 1) {
        const earlier = input.trades[i];
        const outcome = outcomeOf(earlier);
        if (outcome !== "win" && outcome !== "loss") continue;
        if (outcome === "loss" && earlier.exitedAt) previousLossExit = Date.parse(earlier.exitedAt);
        break;
      }
      if (previousLossExit === null || !Number.isFinite(previousLossExit)) return { kind: "ok" };
      const gapMinutes = (Date.parse(trade.enteredAt) - previousLossExit) / 60_000;
      if (!Number.isFinite(gapMinutes)) return { kind: "uncheckable", missing: "entry time" };
      return gapMinutes < params.withinMinutes
        ? {
            kind: "violation",
            detail: {
              observed: Math.round(gapMinutes),
              allowed: params.withinMinutes,
              unit: "minutes after a loss",
            },
          }
        : { kind: "ok" };
    }

    case "max_position_size": {
      if (typeof trade.size !== "number" || !Number.isFinite(trade.size)) {
        return { kind: "uncheckable", missing: "position size" };
      }
      return trade.size > params.size
        ? { kind: "violation", detail: { observed: trade.size, allowed: params.size, unit: "size" } }
        : { kind: "ok" };
    }

    default:
      return { kind: "ok" };
  }
}

export type ViolationSummary = {
  ruleKind: RuleKind;
  ruleText: string;
  count: number;
  /** The most recent one, so the UI can link to a trade. */
  lastAt: string | null;
};

/**
 * "You broke the risk rule 8 times in March."
 *
 * A GROUPED COUNT, not a judgement. The sentence the UI builds from this
 * states what happened and stops; there is no "and that is why you lost
 * money", because that is a causal claim this data cannot support.
 */
export function summarise(violations: readonly Violation[], from?: Date, to?: Date): ViolationSummary[] {
  const inWindow = violations.filter((v) => {
    if (!from && !to) return true;
    if (!v.occurredAt) return false;
    const at = Date.parse(v.occurredAt);
    if (!Number.isFinite(at)) return false;
    if (from && at < from.getTime()) return false;
    if (to && at >= to.getTime()) return false;
    return true;
  });

  const groups = new Map<string, ViolationSummary>();
  for (const violation of inWindow) {
    // Grouped by RULE TEXT as well as kind: a trader with two risk rules
    // on different accounts must not have them merged into one count.
    const key = `${violation.ruleKind}::${violation.ruleText}`;
    const existing = groups.get(key);
    const at = violation.occurredAt;
    if (existing) {
      existing.count += 1;
      if (at && (!existing.lastAt || at > existing.lastAt)) existing.lastAt = at;
    } else {
      groups.set(key, {
        ruleKind: violation.ruleKind,
        ruleText: violation.ruleText,
        count: 1,
        lastAt: at,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
