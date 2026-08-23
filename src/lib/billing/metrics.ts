/**
 * FIFTEEN METRICS, AND THREE KINDS OF TRUTH.
 *
 * A financial dashboard's failure mode is not being wrong — it is being
 * CONFIDENT. Every figure on it looks the same: same font, same box, same
 * authority. So the type below distinguishes what the number actually is,
 * and the page renders the three differently:
 *
 *   COMPUTED — from rows in this database. MRR, ARR, ARPU, gross margin,
 *   AI cost per user, cost per successful task. These are arithmetic on
 *   things that really happened.
 *
 *   NEEDS AN INPUT ONLY THE OWNER HAS. CAC needs marketing spend. Burn
 *   needs salaries and hosting. Runway needs a bank balance. None of the
 *   three is in this product and none can be derived from anything that
 *   is. The alternative to saying so was a CAC computed from a marketing
 *   spend of zero — infinitely good, and a lie.
 *
 *   NEEDS HISTORY WE DO NOT HAVE YET. Churn, retention, NRR, LTV and
 *   payback are comparisons between two months. On the day the snapshot
 *   tables ship there is one month, and a churn rate computed from one
 *   month is a division by a number that does not exist. It says how much
 *   history it has and what it needs.
 *
 * Pure. Every input is passed in; nothing here reads a database or a
 * clock, so the build gate exercises every branch.
 */

export const METRIC_KEYS = [
  "mrr",
  "arr",
  "arpu",
  "grossMarginPercent",
  "aiCostPerUserEur",
  "costPerSuccessfulTaskEur",
  "churnPercent",
  "retentionPercent",
  "nrrPercent",
  "ltvEur",
  "cacEur",
  "paybackMonths",
  "ruleOf40",
  "burnEur",
  "runwayMonths",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export type MetricUnit = "eur" | "percent" | "months" | "count" | "score";

export type Metric =
  | { key: MetricKey; unit: MetricUnit; state: "computed"; value: number; note?: string }
  /** The figure cannot be produced, and the reason names the fix. */
  | { key: MetricKey; unit: MetricUnit; state: "needs_input"; missing: MissingInput[] }
  | { key: MetricKey; unit: MetricUnit; state: "needs_history"; haveMonths: number; needMonths: number }
  /** Computable in principle, but the denominator is zero — no
   *  subscribers, no tasks. Different from "we cannot know": there is
   *  simply nothing yet. */
  | { key: MetricKey; unit: MetricUnit; state: "no_data"; why: string };

export type MissingInput = "marketing_spend" | "fixed_costs" | "cash_balance";

/** Two months of subscriber history before a churn figure means anything.
 *  One month cannot be compared with anything. */
export const MIN_MONTHS_FOR_COHORT = 2;

export type MetricInputs = {
  /** From mrr_inputs() priced through lib/billing/plans.ts. */
  mrrEur: number;
  /** False when a subscriber sits on a tier with no listed price. Every
   *  metric derived from MRR inherits it. */
  mrrComplete: boolean;
  payingSubscribers: number;
  totalAccounts: number;

  /** Real AI spend for the period, in euros, from ai_cost_log. */
  aiCostEur: number;
  /** Actions that actually completed. The denominator of "cost per
   *  successful task" — and using ATTEMPTS instead would make a month of
   *  failures look cheap. */
  successfulTasks: number;

  /** From subscription_cohort(), when there is enough history. */
  cohort: CohortInputs | null;
  /** How many distinct months of subscriber history exist. */
  historyMonths: number;

  /** What only the owner knows, for the period. */
  marketingSpendEur: number | null;
  fixedCostsEur: number | null;
  cashBalanceEur: number | null;
  /** New paying customers in the period — CAC's denominator. */
  newCustomers: number;

  /** MRR one period ago, for growth and Rule of 40. Null when there is
   *  no earlier snapshot. */
  previousMrrEur: number | null;
};

export type CohortInputs = {
  startAccounts: number;
  startMrr: number;
  retainedAccounts: number;
  retainedMrr: number;
  churnedAccounts: number;
  churnedMrr: number;
  expansionMrr: number;
  contractionMrr: number;
};

const round = (value: number, dp = 2): number => {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** dp;
  return Math.round(value * f) / f;
};

const computed = (key: MetricKey, unit: MetricUnit, value: number, note?: string): Metric => ({
  key,
  unit,
  state: "computed",
  value: round(value),
  ...(note ? { note } : {}),
});

const INCOMPLETE_NOTE = "at least one subscriber is on a tier with no listed price, so this is a floor";

/**
 * Every metric, in one pass.
 *
 * ORDER MATTERS ONLY FOR READING. Each is computed from the inputs, never
 * from another metric's rendered value — so a metric that could not be
 * produced makes the ones that depend on it say `needs_*` rather than
 * quietly inheriting a zero.
 */
export function computeMetrics(inputs: MetricInputs): Metric[] {
  const out: Metric[] = [];
  const note = inputs.mrrComplete ? undefined : INCOMPLETE_NOTE;

  // ---- straight from the rows ---------------------------------------
  out.push(computed("mrr", "eur", inputs.mrrEur, note));
  out.push(computed("arr", "eur", inputs.mrrEur * 12, note));

  out.push(
    inputs.payingSubscribers > 0
      ? computed("arpu", "eur", inputs.mrrEur / inputs.payingSubscribers, note)
      : { key: "arpu", unit: "eur", state: "no_data", why: "no paying subscribers yet" }
  );

  // GROSS MARGIN, and what it is a margin ON. Revenue minus the cost of
  // serving it — here, the AI calls. It is NOT the 4x credit margin,
  // which is a per-action guarantee; this is the business's own.
  const grossMargin =
    inputs.mrrEur > 0
      ? ((inputs.mrrEur - inputs.aiCostEur) / inputs.mrrEur) * 100
      : null;
  out.push(
    grossMargin === null
      ? { key: "grossMarginPercent", unit: "percent", state: "no_data", why: "no revenue in the period" }
      : computed("grossMarginPercent", "percent", grossMargin, note)
  );

  out.push(
    inputs.totalAccounts > 0
      ? computed("aiCostPerUserEur", "eur", inputs.aiCostEur / inputs.totalAccounts)
      : { key: "aiCostPerUserEur", unit: "eur", state: "no_data", why: "no accounts yet" }
  );

  // COST PER SUCCESSFUL TASK. The denominator is deliberately successes
  // and not attempts: a month where half the runs failed cost the same
  // and delivered half as much, and dividing by attempts hides exactly
  // that.
  out.push(
    inputs.successfulTasks > 0
      ? computed("costPerSuccessfulTaskEur", "eur", inputs.aiCostEur / inputs.successfulTasks)
      : { key: "costPerSuccessfulTaskEur", unit: "eur", state: "no_data", why: "nothing completed in the period" }
  );

  // ---- the ones that need two months --------------------------------
  const cohortMetrics: MetricKey[] = ["churnPercent", "retentionPercent", "nrrPercent"];
  if (!inputs.cohort || inputs.historyMonths < MIN_MONTHS_FOR_COHORT) {
    for (const key of cohortMetrics) {
      out.push({
        key,
        unit: "percent",
        state: "needs_history",
        haveMonths: inputs.historyMonths,
        needMonths: MIN_MONTHS_FOR_COHORT,
      });
    }
  } else {
    const c = inputs.cohort;
    if (c.startAccounts === 0) {
      for (const key of cohortMetrics) {
        out.push({ key, unit: "percent", state: "no_data", why: "no paying accounts at the start of the period" });
      }
    } else {
      // CHURN BY LOGO. Reported alongside revenue churn rather than
      // instead of it: losing one large account and losing five small
      // ones are different problems with the same revenue figure.
      const churn = (c.churnedAccounts / c.startAccounts) * 100;
      out.push(computed("churnPercent", "percent", churn));
      out.push(computed("retentionPercent", "percent", 100 - churn));

      out.push(
        c.startMrr > 0
          ? computed(
              "nrrPercent",
              "percent",
              ((c.startMrr - c.churnedMrr - c.contractionMrr + c.expansionMrr) / c.startMrr) * 100
            )
          : { key: "nrrPercent", unit: "percent", state: "no_data", why: "no revenue at the start of the period" }
      );
    }
  }

  // ---- LTV: needs churn AND margin ----------------------------------
  const churnMetric = out.find((m) => m.key === "churnPercent");
  const arpuMetric = out.find((m) => m.key === "arpu");
  const marginMetric = out.find((m) => m.key === "grossMarginPercent");
  if (churnMetric?.state !== "computed" || arpuMetric?.state !== "computed" || marginMetric?.state !== "computed") {
    out.push({
      key: "ltvEur",
      unit: "eur",
      state: "needs_history",
      haveMonths: inputs.historyMonths,
      needMonths: MIN_MONTHS_FOR_COHORT,
    });
  } else if (churnMetric.value <= 0) {
    // ZERO CHURN IS NOT INFINITE LTV. It is a month too short to have
    // seen one, and printing infinity — or a very large number — as a
    // customer's lifetime value is the single most misleading thing this
    // dashboard could do.
    out.push({ key: "ltvEur", unit: "eur", state: "no_data", why: "no churn yet, so a lifetime cannot be estimated" });
  } else {
    const monthlyChurn = churnMetric.value / 100;
    out.push(computed("ltvEur", "eur", (arpuMetric.value * (marginMetric.value / 100)) / monthlyChurn));
  }

  // ---- CAC: only the owner knows the numerator ----------------------
  if (inputs.marketingSpendEur === null) {
    out.push({ key: "cacEur", unit: "eur", state: "needs_input", missing: ["marketing_spend"] });
  } else if (inputs.newCustomers <= 0) {
    out.push({ key: "cacEur", unit: "eur", state: "no_data", why: "no new paying customers in the period" });
  } else {
    out.push(computed("cacEur", "eur", inputs.marketingSpendEur / inputs.newCustomers));
  }

  // ---- payback: CAC over gross-margin-adjusted ARPU -----------------
  const cacMetric = out.find((m) => m.key === "cacEur");
  if (cacMetric?.state === "needs_input") {
    out.push({ key: "paybackMonths", unit: "months", state: "needs_input", missing: ["marketing_spend"] });
  } else if (cacMetric?.state !== "computed" || arpuMetric?.state !== "computed" || marginMetric?.state !== "computed") {
    out.push({ key: "paybackMonths", unit: "months", state: "no_data", why: "CAC or margin could not be computed" });
  } else {
    const monthlyGrossPerCustomer = arpuMetric.value * (marginMetric.value / 100);
    out.push(
      monthlyGrossPerCustomer > 0
        ? computed("paybackMonths", "months", cacMetric.value / monthlyGrossPerCustomer)
        : { key: "paybackMonths", unit: "months", state: "no_data", why: "gross margin per customer is not positive" }
    );
  }

  // ---- Rule of 40: growth% + profit margin% -------------------------
  // Growth needs a previous period; profit needs the owner's fixed costs,
  // because a "profit" that ignores salaries is not one.
  if (inputs.previousMrrEur === null) {
    out.push({ key: "ruleOf40", unit: "score", state: "needs_history", haveMonths: inputs.historyMonths, needMonths: 2 });
  } else if (inputs.fixedCostsEur === null) {
    out.push({ key: "ruleOf40", unit: "score", state: "needs_input", missing: ["fixed_costs"] });
  } else if (inputs.previousMrrEur <= 0 || inputs.mrrEur <= 0) {
    out.push({ key: "ruleOf40", unit: "score", state: "no_data", why: "no revenue to compare" });
  } else {
    const growthPercent = ((inputs.mrrEur - inputs.previousMrrEur) / inputs.previousMrrEur) * 100;
    const profitPercent = ((inputs.mrrEur - inputs.aiCostEur - inputs.fixedCostsEur) / inputs.mrrEur) * 100;
    out.push(computed("ruleOf40", "score", growthPercent + profitPercent));
  }

  // ---- burn and runway: both need what only the owner knows ---------
  if (inputs.fixedCostsEur === null) {
    out.push({ key: "burnEur", unit: "eur", state: "needs_input", missing: ["fixed_costs"] });
  } else {
    // POSITIVE MEANS BURNING. A profitable month returns a negative burn
    // rather than a zero, so the trend line does not flatten out at
    // break-even and hide the difference between "just profitable" and
    // "very profitable".
    const marketing = inputs.marketingSpendEur ?? 0;
    out.push(
      computed(
        "burnEur",
        "eur",
        inputs.fixedCostsEur + inputs.aiCostEur + marketing - inputs.mrrEur,
        inputs.marketingSpendEur === null ? "marketing spend not entered, so this is a floor" : undefined
      )
    );
  }

  const burnMetric = out.find((m) => m.key === "burnEur");
  if (inputs.cashBalanceEur === null || burnMetric?.state === "needs_input") {
    const missing: MissingInput[] = [];
    if (inputs.cashBalanceEur === null) missing.push("cash_balance");
    if (inputs.fixedCostsEur === null) missing.push("fixed_costs");
    out.push({ key: "runwayMonths", unit: "months", state: "needs_input", missing });
  } else if (burnMetric?.state !== "computed" || burnMetric.value <= 0) {
    out.push({ key: "runwayMonths", unit: "months", state: "no_data", why: "not burning cash this period" });
  } else {
    out.push(computed("runwayMonths", "months", inputs.cashBalanceEur / burnMetric.value));
  }

  return out;
}

/** A trend point, for the 30/90-day charts. */
export type TrendPoint = { day: string; value: number };

/**
 * The change between the first and last point of a series, as a
 * percentage.
 *
 * NULL FROM A ZERO BASE, for the same reason the weekly digest refuses
 * one: "up infinity percent" is not a fact, and 100% would be a claim
 * about a baseline that did not exist.
 */
export function trendChangePercent(points: readonly TrendPoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (first <= 0) return null;
  return round(((last - first) / first) * 100);
}
