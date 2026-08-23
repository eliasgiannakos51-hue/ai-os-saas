import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { getPlan } from "@/lib/billing/plans";
import { monthlyRecurringRevenue, type MrrInputRow } from "@/lib/billing/monthly-revenue";
import type { CohortInputs, MetricInputs, TrendPoint } from "@/lib/billing/metrics";

/**
 * WRITING THE HISTORY, AND READING IT BACK.
 *
 * auth.users holds the CURRENT tier and nothing else, so every question
 * about the past — churn, retention, NRR, LTV, payback, any 30- or
 * 90-day trend — is unanswerable without something recording it as it
 * happens. That is what this file does, once a day.
 *
 * THE SNAPSHOT IS A LOG, NEVER AN AUTHORITY. Nothing reads it to decide
 * what a customer may do. If it disagrees with auth.users, auth.users is
 * right and the log has a gap — a reporting problem, not an entitlement
 * one. That is the whole reason it is safe for it to exist alongside the
 * metadata that gates features, and it is why the aggregate function
 * mrr_inputs() was NOT replaced by a table.
 */

/** First of the month containing `at`, as YYYY-MM-DD. */
export function monthKey(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
export function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The month before `month` (a YYYY-MM-01 string). */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 2, 1));
  return monthKey(date);
}

export type SnapshotResult = {
  day: string;
  mrrEur: number;
  payingSubscribers: number;
  totalAccounts: number;
  aiCostEur: number;
  subscriberMonthsWritten: number;
  incomplete: boolean;
};

/**
 * One day's snapshot, plus this month's per-account rows.
 *
 * IDEMPOTENT BY DAY AND BY MONTH. Both writes are upserts keyed on the
 * date, so running the cron twice, or re-running it after a failure,
 * produces the same row rather than a second one — which for a churn
 * denominator is the difference between a real number and a doubled one.
 */
export async function writeDailySnapshot(now = new Date()): Promise<SnapshotResult | null> {
  try {
    const admin = createAdminClient();
    const day = dayKey(now);
    const month = monthKey(now);

    const { data: mrrRows, error: mrrError } = await admin.rpc("mrr_inputs", {});
    if (mrrError) throw mrrError;

    const rows: MrrInputRow[] = (mrrRows ?? []).map((row: Record<string, unknown>) => ({
      tier: String(row.tier ?? "free"),
      billingInterval: String(row.billing_interval ?? "month"),
      subscribers: Number(row.subscribers ?? 0),
      seats: Number(row.seats ?? 0),
    }));

    // PRICED IN TYPESCRIPT, from plans.ts. The prices live where the
    // customer can see them, and duplicating them into SQL would create
    // the same two-sources problem one level down — see the migration.
    const revenue = monthlyRecurringRevenue(rows);
    const paying = rows
      .filter((r) => {
        const plan = getPlan(r.tier);
        return plan && typeof plan.price === "number" && plan.price > 0;
      })
      .reduce((sum, r) => sum + r.subscribers, 0);
    const totalAccounts = rows.reduce((sum, r) => sum + r.subscribers, 0);

    // The day's real AI cost, from the cost log. The only cost this
    // database can see by itself, and the other half of gross margin.
    const since = `${day}T00:00:00.000Z`;
    const until = `${day}T23:59:59.999Z`;
    const { data: costRows, error: costError } = await admin
      .from("ai_cost_log")
      .select("real_cost_eur, credits_charged")
      .gte("created_at", since)
      .lte("created_at", until)
      .limit(50_000);
    if (costError) throw costError;
    const aiCostEur = (costRows ?? []).reduce(
      (sum: number, row: Record<string, unknown>) => sum + (Number(row.real_cost_eur) || 0),
      0
    );
    const creditsCharged = (costRows ?? []).reduce(
      (sum: number, row: Record<string, unknown>) => sum + (Number(row.credits_charged) || 0),
      0
    );

    const { error: snapError } = await admin.from("revenue_snapshots").upsert(
      {
        day,
        mrr_eur: round2(revenue.eur),
        arr_eur: round2(revenue.eur * 12),
        paying_subscribers: paying,
        total_accounts: totalAccounts,
        ai_cost_eur: Math.round(aiCostEur * 10_000) / 10_000,
        credits_charged: creditsCharged,
        tiers: rows,
        incomplete: !revenue.complete,
        taken_at: now.toISOString(),
      },
      { onConflict: "day" }
    );
    if (snapError) throw snapError;

    const subscriberMonthsWritten = await writeSubscriberMonths(month, now);

    return {
      day,
      mrrEur: round2(revenue.eur),
      payingSubscribers: paying,
      totalAccounts,
      aiCostEur: round2(aiCostEur),
      subscriberMonthsWritten,
      incomplete: !revenue.complete,
    };
  } catch (err) {
    logApiError("billing:revenue-history", err, { stage: "snapshot" });
    return null;
  }
}

/**
 * One row per PAYING account for this month.
 *
 * WHY PER ACCOUNT, when everything else here is an aggregate: churn and
 * NRR are comparisons between two months PER ACCOUNT. Two months with the
 * same subscriber count can be the same twenty customers or forty with
 * twenty of them gone, and no aggregate can tell those apart.
 *
 * FREE ACCOUNTS ARE NOT WRITTEN. A free user who stops using the product
 * has not churned in any sense a revenue figure cares about, and counting
 * them would put the churn rate an order of magnitude out.
 */
async function writeSubscriberMonths(month: string, now: Date): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1_000 });
  if (error) throw error;

  const rows: Record<string, unknown>[] = [];
  for (const user of data.users) {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const tier = String(meta.subscription_tier ?? "free");
    const plan = getPlan(tier);
    if (!plan || typeof plan.price !== "number" || plan.price <= 0) continue;

    const interval = String(meta.billing_interval ?? "month");
    const seats = Math.max(1, Number(meta.seat_count ?? 1) || 1);
    const single = monthlyRecurringRevenue([
      { tier, billingInterval: interval, subscribers: 1, seats },
    ]);

    rows.push({
      user_id: user.id,
      month,
      tier,
      billing_interval: interval,
      seats,
      mrr_eur: round2(single.eur),
      updated_at: now.toISOString(),
    });
  }

  if (rows.length === 0) return 0;
  const { error: upsertError } = await admin
    .from("subscriber_months")
    .upsert(rows, { onConflict: "user_id,month" });
  if (upsertError) throw upsertError;
  return rows.length;
}

function round2(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

// ---------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------

export type TrendSeries = { mrr: TrendPoint[]; aiCost: TrendPoint[]; subscribers: TrendPoint[] };

export async function loadTrend(days: number): Promise<TrendSeries> {
  const empty: TrendSeries = { mrr: [], aiCost: [], subscribers: [] };
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await admin
      .from("revenue_snapshots")
      .select("day, mrr_eur, ai_cost_eur, paying_subscribers")
      .gte("day", since)
      .order("day", { ascending: true });
    if (error) throw error;

    const series: TrendSeries = { mrr: [], aiCost: [], subscribers: [] };
    for (const row of data ?? []) {
      const day = String(row.day);
      series.mrr.push({ day, value: Number(row.mrr_eur) || 0 });
      series.aiCost.push({ day, value: Number(row.ai_cost_eur) || 0 });
      series.subscribers.push({ day, value: Number(row.paying_subscribers) || 0 });
    }
    return series;
  } catch (err) {
    logApiError("billing:revenue-history", err, { stage: "trend" });
    return empty;
  }
}

/**
 * Everything computeMetrics needs, gathered.
 *
 * WHAT IS MISSING STAYS NULL. Every "we could not read this" becomes a
 * null rather than a zero, because computeMetrics distinguishes the two:
 * a null makes the metric say what it needs, and a zero would make it
 * print a confident wrong number.
 */
export async function loadMetricInputs(now = new Date()): Promise<MetricInputs> {
  const admin = createAdminClient();
  const month = monthKey(now);
  const prior = previousMonth(month);

  const fallback: MetricInputs = {
    mrrEur: 0,
    mrrComplete: true,
    payingSubscribers: 0,
    totalAccounts: 0,
    aiCostEur: 0,
    successfulTasks: 0,
    cohort: null,
    historyMonths: 0,
    marketingSpendEur: null,
    fixedCostsEur: null,
    cashBalanceEur: null,
    newCustomers: 0,
    previousMrrEur: null,
  };

  try {
    const [{ data: mrrRows }, { data: latest }, { data: inputs }, { data: months }] = await Promise.all([
      admin.rpc("mrr_inputs", {}),
      admin.from("revenue_snapshots").select("day, mrr_eur, paying_subscribers, total_accounts").order("day", { ascending: false }).limit(40),
      admin.from("business_inputs").select("marketing_spend_eur, fixed_costs_eur, cash_balance_eur").eq("month", month).maybeSingle(),
      admin.from("subscriber_months").select("month").order("month", { ascending: false }).limit(2000),
    ]);

    const rows: MrrInputRow[] = (mrrRows ?? []).map((row: Record<string, unknown>) => ({
      tier: String(row.tier ?? "free"),
      billingInterval: String(row.billing_interval ?? "month"),
      subscribers: Number(row.subscribers ?? 0),
      seats: Number(row.seats ?? 0),
    }));
    const revenue = monthlyRecurringRevenue(rows);

    const distinctMonths = new Set((months ?? []).map((r: Record<string, unknown>) => String(r.month)));
    const historyMonths = distinctMonths.size;

    // COHORT ONLY WHEN THERE ARE TWO MONTHS TO COMPARE. Asking the
    // function for a month that does not exist returns zeros, and zeros
    // in a churn formula produce a churn rate of 0% — which reads as
    // "nobody left" rather than "we do not know".
    let cohort: CohortInputs | null = null;
    if (distinctMonths.has(prior) && distinctMonths.has(month)) {
      const { data: cohortRows } = await admin.rpc("subscription_cohort", { p_from: prior, p_to: month });
      const c = Array.isArray(cohortRows) ? cohortRows[0] : cohortRows;
      if (c) {
        cohort = {
          startAccounts: Number(c.start_accounts ?? 0),
          startMrr: Number(c.start_mrr ?? 0),
          retainedAccounts: Number(c.retained_accounts ?? 0),
          retainedMrr: Number(c.retained_mrr ?? 0),
          churnedAccounts: Number(c.churned_accounts ?? 0),
          churnedMrr: Number(c.churned_mrr ?? 0),
          expansionMrr: Number(c.expansion_mrr ?? 0),
          contractionMrr: Number(c.contraction_mrr ?? 0),
        };
      }
    }

    // Thirty days of AI cost and completed work, for margin and cost per
    // successful task.
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: costs }, { count: successes }, { count: newCustomers }] = await Promise.all([
      admin.from("ai_cost_log").select("real_cost_eur").gte("created_at", since).limit(50_000),
      admin.from("ai_cost_log").select("id", { count: "exact", head: true }).gte("created_at", since).gt("credits_charged", 0),
      admin
        .from("subscription_events")
        .select("id", { count: "exact", head: true })
        .in("kind", ["started", "reactivated"])
        .gte("at", since),
    ]);
    const aiCostEur = (costs ?? []).reduce(
      (sum: number, row: Record<string, unknown>) => sum + (Number(row.real_cost_eur) || 0),
      0
    );

    // The snapshot from ~30 days ago, for growth.
    const snapshots = latest ?? [];
    const previous = snapshots.find((row: Record<string, unknown>) => {
      const age = (now.getTime() - new Date(String(row.day)).getTime()) / (24 * 60 * 60 * 1000);
      return age >= 28;
    });

    return {
      mrrEur: round2(revenue.eur),
      mrrComplete: revenue.complete,
      payingSubscribers: rows
        .filter((r) => {
          const plan = getPlan(r.tier);
          return plan && typeof plan.price === "number" && plan.price > 0;
        })
        .reduce((sum, r) => sum + r.subscribers, 0),
      totalAccounts: rows.reduce((sum, r) => sum + r.subscribers, 0),
      aiCostEur: round2(aiCostEur),
      successfulTasks: successes ?? 0,
      cohort,
      historyMonths,
      marketingSpendEur: numberOrNull(inputs?.marketing_spend_eur),
      fixedCostsEur: numberOrNull(inputs?.fixed_costs_eur),
      cashBalanceEur: numberOrNull(inputs?.cash_balance_eur),
      newCustomers: newCustomers ?? 0,
      previousMrrEur: previous ? Number(previous.mrr_eur) || 0 : null,
    };
  } catch (err) {
    logApiError("billing:revenue-history", err, { stage: "metric_inputs" });
    return fallback;
  }
}

/** null, not 0. The difference is the difference between "the owner has
 *  not entered this" and "the owner entered zero", and one of them is a
 *  metric that must not be computed. */
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
