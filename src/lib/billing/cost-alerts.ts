import { MARGIN_TARGET } from "@/lib/billing/margin-report";

/**
 * THE SAFETY NET, and why most of this file is about NOT firing.
 *
 * An alert that cries wolf is worse than no alert, and it fails in a
 * specific way: the owner mutes it, and then the real one arrives into a
 * muted channel. So every rule here has three parts — a ratio, an
 * ABSOLUTE FLOOR, and a MINIMUM SAMPLE — and the last two are what make
 * it usable:
 *
 *   A RATIO WITHOUT A FLOOR fires on noise. Spend of €0.20 rising to
 *   €0.30 is +50% and is nothing. The floor is "is this an amount worth
 *   waking somebody for", asked before the ratio.
 *
 *   A RATIO WITHOUT A SAMPLE fires on arithmetic. "One user spent 3x the
 *   average" is guaranteed on the second day of a product with two
 *   users, one of whom is the owner testing it. It is also guaranteed
 *   when the average includes the outlier.
 *
 * And where a distribution is involved the comparison is a MEDIAN, not a
 * mean: spend across users is heavy-tailed by nature, and a mean is
 * dragged by the very outlier it is supposed to detect.
 *
 * Everything here is pure. The queries live in the cron route; this
 * decides. That split is what lets the "normal usage fires nothing" case
 * be a test rather than a hope.
 */

export type CostAlertType =
  | "daily_spend_spike"
  | "user_outlier"
  | "feature_margin"
  | "absorbed_refusals"
  | "unpriced_usage"
  | "call_burst";

export type CostAlert = {
  type: CostAlertType;
  title: string;
  body: string;
  /** The numbers that triggered it — logged, and what a test asserts on
   *  rather than on the prose. */
  detail: Record<string, number | string | null>;
};

/**
 * Every threshold, in one object, with a default and a reason.
 *
 * Overridable by env so a real deployment can tune them without a
 * release — but every one has a working default, because a safety net
 * that only works once somebody configures it is not a safety net.
 */
export type CostAlertConfig = {
  /** Rolling 24h spend must exceed the 7-day baseline by this much. */
  dailySpikeRatio: number;
  /** …and be at least this many euros. Below it, a spike is noise. */
  dailyFloorEur: number;
  /** …and exceed the baseline by at least this many euros in absolute
   *  terms, so a 1.3x on a small base is not an alert. */
  dailyExcessFloorEur: number;
  /** Days of history required before the daily rule may fire at all. */
  dailyMinDays: number;

  /** One user over this multiple of the median of the others. */
  userRatio: number;
  userFloorEur: number;
  /** Distinct spending users required before "an outlier" means anything. */
  userMinCount: number;

  /** A feature's achieved margin below this is a shortfall. */
  marginTarget: number;
  /** …measured over at least this many CHARGED calls. */
  marginMinChargedCalls: number;
  marginMinCostEur: number;

  /** Absorbed refusals over this share of monthly revenue. */
  absorbedShareLimit: number;

  /** Calls in the last complete hour over this multiple of the median. */
  burstRatio: number;
  burstFloorCalls: number;
  burstMinHours: number;
};

export const DEFAULT_COST_ALERT_CONFIG: CostAlertConfig = {
  dailySpikeRatio: 1.3,
  // €5/day is €150/month — the point at which a jump is worth a person's
  // attention. Below it the absolute numbers are too small for a ratio to
  // mean anything.
  dailyFloorEur: 5,
  dailyExcessFloorEur: 2,
  dailyMinDays: 7,

  userRatio: 3,
  userFloorEur: 2,
  // Five spending users is the point where "the others" is a group rather
  // than a person. Under it, every ratio is a statement about one or two
  // accounts, one of which is usually the owner's.
  userMinCount: 5,

  marginTarget: MARGIN_TARGET,
  // Twenty charged calls: below that an average margin is one unusual
  // action, and every feature would take its turn being alarming.
  marginMinChargedCalls: 20,
  marginMinCostEur: 1,

  absorbedShareLimit: 0.02,

  burstRatio: 10,
  // Fifty calls in an hour before a multiple means anything: 1 -> 10 is
  // ten times and is somebody opening the app.
  burstFloorCalls: 50,
  burstMinHours: 24,
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  // A malformed override falls back rather than disabling the rule. A
  // typo in an env var must not silently switch off a safety net.
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveCostAlertConfig(): CostAlertConfig {
  const d = DEFAULT_COST_ALERT_CONFIG;
  return {
    dailySpikeRatio: envNumber("COST_ALERT_DAILY_RATIO", d.dailySpikeRatio),
    dailyFloorEur: envNumber("COST_ALERT_DAILY_FLOOR_EUR", d.dailyFloorEur),
    dailyExcessFloorEur: envNumber("COST_ALERT_DAILY_EXCESS_EUR", d.dailyExcessFloorEur),
    dailyMinDays: d.dailyMinDays,
    userRatio: envNumber("COST_ALERT_USER_RATIO", d.userRatio),
    userFloorEur: envNumber("COST_ALERT_USER_FLOOR_EUR", d.userFloorEur),
    userMinCount: envNumber("COST_ALERT_USER_MIN_COUNT", d.userMinCount),
    marginTarget: d.marginTarget,
    marginMinChargedCalls: envNumber("COST_ALERT_MARGIN_MIN_CALLS", d.marginMinChargedCalls),
    marginMinCostEur: d.marginMinCostEur,
    absorbedShareLimit: d.absorbedShareLimit,
    burstRatio: envNumber("COST_ALERT_BURST_RATIO", d.burstRatio),
    burstFloorCalls: envNumber("COST_ALERT_BURST_FLOOR_CALLS", d.burstFloorCalls),
    burstMinHours: d.burstMinHours,
  };
}

// ---------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

const eur = (value: number) => `€${value.toFixed(2)}`;

// ---------------------------------------------------------------------
// α — the day cost more than the week said it would
// ---------------------------------------------------------------------

export type HourlyPoint = { hour: string; calls: number; costEur: number };

/**
 * A ROLLING 24 HOURS against the seven 24-hour windows before it.
 *
 * Not calendar days, and the difference matters twice. A calendar-day
 * comparison pits a partial day against complete ones, which under-fires
 * all morning and then fires at midnight — a safety net that reports
 * yesterday. And a spike that starts at 18:00 is worth knowing about at
 * 19:00, not at 00:05 tomorrow.
 *
 * `hours` is expected oldest-first and to cover 8 windows; anything
 * shorter than dailyMinDays + 1 windows returns null rather than
 * comparing against whatever happens to be there.
 */
export function evaluateDailySpendSpike(
  hours: HourlyPoint[],
  config: CostAlertConfig
): CostAlert | null {
  const HOURS_PER_WINDOW = 24;
  const needed = HOURS_PER_WINDOW * (config.dailyMinDays + 1);
  if (hours.length < needed) return null;

  const recent = hours.slice(-needed);
  const windows: number[] = [];
  for (let i = 0; i < config.dailyMinDays + 1; i += 1) {
    const slice = recent.slice(i * HOURS_PER_WINDOW, (i + 1) * HOURS_PER_WINDOW);
    windows.push(slice.reduce((sum, h) => sum + h.costEur, 0));
  }
  const current = windows[windows.length - 1];
  const baselineWindows = windows.slice(0, -1);
  const baseline = mean(baselineWindows);

  if (current < config.dailyFloorEur) return null;
  if (baseline <= 0) return null;
  if (current <= baseline * config.dailySpikeRatio) return null;
  if (current - baseline < config.dailyExcessFloorEur) return null;

  const ratio = current / baseline;
  return {
    type: "daily_spend_spike",
    title: `AI spend is ${ratio.toFixed(1)}x the weekly average`,
    body:
      `The last 24 hours cost ${eur(current)}. The seven 24-hour windows before it ` +
      `averaged ${eur(baseline)}. That is ${eur(current - baseline)} more than expected.`,
    detail: {
      currentEur: round(current),
      baselineEur: round(baseline),
      ratio: round(ratio),
      excessEur: round(current - baseline),
    },
  };
}

// ---------------------------------------------------------------------
// β — one account is not like the others
// ---------------------------------------------------------------------

export type UserSpend = { userId: string; costEur: number; calls?: number };

/**
 * The top spender against the MEDIAN OF EVERYONE ELSE.
 *
 * Three things this deliberately does not do:
 *
 *   It does not compare against an average that INCLUDES the user being
 *   judged — a big enough account raises its own bar and stops being
 *   detectable, which is backwards.
 *
 *   It does not use a mean of the others. Spend across users is
 *   heavy-tailed: two heavy accounts drag the mean up until a third one
 *   looks ordinary. The median is what "everyone else" means.
 *
 *   It does not judge accounts that are not customers. The owner's own
 *   account has real spend and no revenue, and it is usually the biggest
 *   line in a young product — an alert firing on it every hour is how
 *   this feature gets muted in week one. Callers pass those ids in.
 */
export function evaluateUserOutlier(
  users: UserSpend[],
  config: CostAlertConfig,
  excludedUserIds: Set<string> = new Set()
): CostAlert | null {
  const eligible = users.filter((u) => !excludedUserIds.has(u.userId) && u.costEur > 0);
  if (eligible.length < config.userMinCount) return null;

  const sorted = [...eligible].sort((a, b) => b.costEur - a.costEur);
  const top = sorted[0];
  const others = sorted.slice(1).map((u) => u.costEur);

  if (top.costEur < config.userFloorEur) return null;

  // The median is the comparison; the mean is the fallback for the case
  // where more than half of the spending users spent a rounding error and
  // the median is zero. If BOTH are zero this account is the only one
  // spending anything, which with a group this size is more likely a
  // seeded database than a runaway customer — so it does not fire.
  let comparator = median(others);
  let comparatorKind = "median";
  if (comparator <= 0) {
    comparator = mean(others);
    comparatorKind = "mean";
  }
  if (comparator <= 0) return null;
  if (top.costEur <= comparator * config.userRatio) return null;

  const ratio = top.costEur / comparator;
  return {
    type: "user_outlier",
    title: `One account is spending ${ratio.toFixed(1)}x the typical user`,
    body:
      `Account ${top.userId} cost ${eur(top.costEur)} in the last 24 hours. The ${comparatorKind} ` +
      `across the other ${others.length} spending accounts is ${eur(comparator)}.`,
    detail: {
      userId: top.userId,
      userCostEur: round(top.costEur),
      comparatorEur: round(comparator),
      comparatorKind,
      ratio: round(ratio),
      spendingUsers: eligible.length,
    },
  };
}

// ---------------------------------------------------------------------
// γ — a feature is being sold below cost-plus
// ---------------------------------------------------------------------

export type FeatureMargin = {
  feature: string;
  costEur: number;
  chargedCalls: number;
  /** Sum of achieved_margin over the CHARGED calls only. */
  marginSum: number;
};

/**
 * CHARGED calls only, and enough of them.
 *
 * A bypass row stores achieved_margin null by design — the owner and
 * beta testers genuinely produce no revenue — so averaging over all
 * calls would divide real margin by a call count that includes them and
 * report a shortfall that does not exist. And an average over three
 * calls is one unusual action, which is how every feature would take its
 * turn being alarming.
 */
export function evaluateFeatureMargin(
  features: FeatureMargin[],
  config: CostAlertConfig
): CostAlert | null {
  const candidates = features
    .filter((f) => f.chargedCalls >= config.marginMinChargedCalls && f.costEur >= config.marginMinCostEur)
    .map((f) => ({ ...f, margin: f.marginSum / f.chargedCalls }))
    .filter((f) => f.margin < config.marginTarget)
    .sort((a, b) => a.margin - b.margin);

  const worst = candidates[0];
  if (!worst) return null;

  return {
    type: "feature_margin",
    title: `${worst.feature} is running at ${worst.margin.toFixed(2)}x margin`,
    body:
      `Target is ${config.marginTarget}x. Measured over ${worst.chargedCalls} charged calls ` +
      `costing ${eur(worst.costEur)}.` +
      (candidates.length > 1 ? ` ${candidates.length - 1} other feature(s) are also below target.` : ""),
    detail: {
      feature: worst.feature,
      margin: round(worst.margin),
      target: config.marginTarget,
      chargedCalls: worst.chargedCalls,
      costEur: round(worst.costEur),
      othersBelowTarget: candidates.length - 1,
    },
  };
}

// ---------------------------------------------------------------------
// δ — the refusals we decided to absorb stopped being small
// ---------------------------------------------------------------------

export type AbsorbedRefusals = {
  calls: number;
  costEur: number;
  /** Null when revenue is unknown — see MonthlyRevenue.complete. */
  shareOfRevenue: number | null;
};

/**
 * The alert this whole workstream was blocked on.
 *
 * The decision was to absorb the cost of an agent run that refuses,
 * rather than charge the customer for a failure — on the theory that it
 * is rare, because the agent disables itself in the same transaction.
 * Crossing 2% of real revenue means the theory is wrong.
 *
 * It needs a revenue figure, and a WRONG one is worse than none: an
 * understated denominator inflates the share and fires falsely, and this
 * is the alert whose whole purpose is to tell us a business assumption
 * broke. So it refuses to fire on an incomplete figure.
 */
export function evaluateAbsorbedRefusals(
  absorbed: AbsorbedRefusals | null,
  config: CostAlertConfig
): CostAlert | null {
  if (!absorbed) return null;
  if (absorbed.shareOfRevenue === null) return null;
  if (absorbed.shareOfRevenue <= config.absorbedShareLimit) return null;

  return {
    type: "absorbed_refusals",
    title: `Absorbed refusals are ${(absorbed.shareOfRevenue * 100).toFixed(1)}% of revenue`,
    body:
      `${absorbed.calls} agent run(s) that could not complete cost ${eur(absorbed.costEur)} and were ` +
      `not charged to anyone. The ceiling for that is ${(config.absorbedShareLimit * 100).toFixed(0)}% ` +
      `of monthly revenue.`,
    detail: {
      calls: absorbed.calls,
      costEur: round(absorbed.costEur),
      shareOfRevenue: round(absorbed.shareOfRevenue, 4),
      limit: config.absorbedShareLimit,
    },
  };
}

// ---------------------------------------------------------------------
// ε — "provider price change", as far as it is observable at all
// ---------------------------------------------------------------------

/**
 * WHAT CANNOT BE DETECTED, said plainly, because the alternative is an
 * alert that claims to watch something it does not.
 *
 * A change in Anthropic's prices is NOT visible in this application's
 * data. Every cost figure we store is COMPUTED from our own table
 * (lib/billing/model-pricing.ts) — so if their price doubled tomorrow,
 * every number in ai_cost_log would carry on agreeing with itself
 * perfectly, and the only witness would be the invoice. Nothing short of
 * reading the invoice or scraping their pricing page detects that, and
 * both are outside this app.
 *
 * WHAT IS OBSERVABLE is the failure that makes our table WRONG: usage
 * served by a model, or on a service tier, the table does not price. Then
 * cost is a guess, and the margin computed from that guess reads healthy
 * by construction — which is exactly how a $0.10 chat message once
 * settled for 2 credits with no alert firing.
 *
 * So this alert is named for what it actually watches. Settlement already
 * logs each occurrence; this catches the case where nobody read the log.
 */
export type UnpricedUsage = { models: string[]; calls: number; costEur: number };

export function evaluateUnpricedUsage(usage: UnpricedUsage | null): CostAlert | null {
  if (!usage) return null;
  if (usage.calls <= 0 || usage.models.length === 0) return null;
  return {
    type: "unpriced_usage",
    title: `${usage.calls} call(s) priced by guesswork`,
    body:
      `Usage from ${usage.models.join(", ")} was priced with the fallback rates because ` +
      `MODEL_PRICING_USD does not carry them. Every margin computed from those ${eur(usage.costEur)} ` +
      `is a guess that reads healthy whatever the real rate is. This is also the only signal we have ` +
      `that a provider's pricing moved — a change to a model we DO price is invisible here, because ` +
      `our costs are computed from our own table.`,
    detail: {
      models: usage.models.join(","),
      calls: usage.calls,
      costEur: round(usage.costEur),
    },
  };
}

// ---------------------------------------------------------------------
// στ — a great many calls, very suddenly
// ---------------------------------------------------------------------

/**
 * The LAST COMPLETE hour against the median of the hours before it.
 *
 * Complete, because a partial hour compared against full ones is a
 * comparison with the clock rather than with the traffic. At most one
 * hour late, which for "something is looping" is soon enough — and a
 * rule that fires at :01 every hour on a fifth of an hour's traffic is
 * one nobody keeps switched on.
 */
export function evaluateCallBurst(
  hours: HourlyPoint[],
  config: CostAlertConfig
): CostAlert | null {
  if (hours.length < config.burstMinHours + 1) return null;

  const latest = hours[hours.length - 1];
  const history = hours.slice(0, -1).map((h) => h.calls);
  const baseline = median(history);

  if (latest.calls < config.burstFloorCalls) return null;

  if (baseline <= 0) {
    // No baseline at all. A ratio is undefined, so the only honest test
    // is an absolute one, and it is set high: this is "hundreds of calls
    // in an hour on a system that normally makes none", not "the first
    // busy hour of a quiet week".
    if (latest.calls < config.burstFloorCalls * config.burstRatio) return null;
    return {
      type: "call_burst",
      title: `${latest.calls} AI calls in one hour, from a standing start`,
      body:
        `The hour ending ${latest.hour} made ${latest.calls} calls costing ${eur(latest.costEur)}. ` +
        `The ${history.length} hours before it had no measurable traffic to compare against.`,
      detail: {
        calls: latest.calls,
        baselineCalls: 0,
        ratio: null,
        costEur: round(latest.costEur),
        hour: latest.hour,
      },
    };
  }

  if (latest.calls <= baseline * config.burstRatio) return null;
  const ratio = latest.calls / baseline;
  return {
    type: "call_burst",
    title: `${ratio.toFixed(0)}x the usual AI calls in one hour`,
    body:
      `The hour ending ${latest.hour} made ${latest.calls} calls costing ${eur(latest.costEur)}. ` +
      `The median of the previous ${history.length} hours is ${baseline} calls.`,
    detail: {
      calls: latest.calls,
      baselineCalls: baseline,
      ratio: round(ratio),
      costEur: round(latest.costEur),
      hour: latest.hour,
    },
  };
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Every rule, in one call, so the cron route cannot forget one. */
export function evaluateAllCostAlerts(input: {
  hours: HourlyPoint[];
  users: UserSpend[];
  features: FeatureMargin[];
  absorbed: AbsorbedRefusals | null;
  unpriced: UnpricedUsage | null;
  excludedUserIds?: Set<string>;
  config?: CostAlertConfig;
}): CostAlert[] {
  const config = input.config ?? resolveCostAlertConfig();
  return [
    evaluateDailySpendSpike(input.hours, config),
    evaluateUserOutlier(input.users, config, input.excludedUserIds ?? new Set()),
    evaluateFeatureMargin(input.features, config),
    evaluateAbsorbedRefusals(input.absorbed, config),
    evaluateUnpricedUsage(input.unpriced),
    evaluateCallBurst(input.hours, config),
  ].filter((a): a is CostAlert => a !== null);
}

/**
 * Turn "the hours that had traffic" into "every hour", oldest first.
 *
 * A quiet hour produces no ai_cost_log rows and therefore no group, so
 * the query returns a shorter, gappy series. Feeding that straight to a
 * median gives the median of the BUSY hours — against which an ordinary
 * hour looks like a burst, and a genuinely quiet week looks like a
 * baseline of hundreds. The zeros have to be there.
 */
export function fillHours(
  rows: { hour: string; calls: number; cost_eur: string | number }[],
  count: number
): HourlyPoint[] {
  const byHour = new Map<string, { calls: number; costEur: number }>();
  for (const row of rows) {
    const key = new Date(row.hour).toISOString().slice(0, 13);
    byHour.set(key, { calls: Number(row.calls ?? 0), costEur: Number(row.cost_eur ?? 0) });
  }
  // Anchored on the last COMPLETE hour, not on now: the hour in progress
  // is a partial sample, and comparing a partial hour with full ones is a
  // comparison with the clock.
  const end = new Date();
  end.setUTCMinutes(0, 0, 0);
  end.setUTCHours(end.getUTCHours() - 1);

  const out: HourlyPoint[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const at = new Date(end.getTime() - i * 3_600_000);
    const key = at.toISOString().slice(0, 13);
    const found = byHour.get(key);
    out.push({
      hour: `${key}:00Z`,
      calls: found?.calls ?? 0,
      costEur: found?.costEur ?? 0,
    });
  }
  return out;
}
