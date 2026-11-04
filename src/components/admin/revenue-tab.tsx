"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  AlertCircle,
  UserPlus,
  UserMinus,
} from "lucide-react";

type TrendPoint = { day: string; value: number };
type TrendSeries = { mrr: TrendPoint[]; aiCost: TrendPoint[]; subscribers: TrendPoint[] };
type MonthlyEvent = {
  month: string;
  started: number;
  reactivated: number;
  cancelled: number;
  upgraded: number;
  downgraded: number;
};
type MetricData = {
  key: string;
  unit: string;
  state: string;
  value?: number;
  note?: string;
  missing?: string[];
  haveMonths?: number;
  needMonths?: number;
  haveDays?: number;
  needDays?: number;
  why?: string;
};

type RevenueData = {
  days: number;
  trend: TrendSeries;
  metrics: MetricData[];
  events: MonthlyEvent[];
  currentMrr: number;
  payingSubscribers: number;
  totalAccounts: number;
};

const METRIC_LABELS: Record<string, string> = {
  mrr: "MRR",
  arr: "ARR",
  arpu: "ARPU",
  grossMarginPercent: "Gross Margin",
  aiCostPerUserEur: "AI Cost/User",
  costPerSuccessfulTaskEur: "Cost/Task",
  churnPercent: "Churn",
  retentionPercent: "Retention",
  nrrPercent: "NRR",
  ltvEur: "LTV",
  cacEur: "CAC",
  paybackMonths: "Payback",
  ruleOf40: "Rule of 40",
  burnEur: "Burn",
  runwayMonths: "Runway",
};

function formatMetricValue(m: MetricData): string {
  if (m.state !== "computed" || m.value === undefined) return "—";
  if (m.unit === "eur") return `€${m.value.toFixed(2)}`;
  if (m.unit === "percent") return `${m.value.toFixed(1)}%`;
  if (m.unit === "months") return `${m.value.toFixed(1)}`;
  if (m.unit === "score") return `${m.value.toFixed(1)}`;
  return String(m.value);
}

function metricStateLabel(m: MetricData, t: (k: string) => string): string | null {
  if (m.state === "needs_input") return t("needsInput");
  if (m.state === "needs_history")
    return `${t("needsHistory")} (${m.haveMonths ?? 0}/${m.needMonths ?? 2})`;
  if (m.state === "needs_history_days")
    return `${t("needsHistoryDays")} (${m.haveDays ?? 0}/${m.needDays ?? 28})`;
  if (m.state === "no_data") return m.why ?? t("noData");
  return null;
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-sm bg-border">
      <div
        className="h-2 rounded-sm bg-foreground/60"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function AdminRevenueTab() {
  const t = useTranslations("adminDashboard.revenue");
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);

  const fetchRevenue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/revenue?days=${days}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok) setData(json);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted">{t("loading")}</p>;
  }
  if (!data) {
    return <p className="py-8 text-center text-sm text-muted">{t("noData")}</p>;
  }

  const mrrChange =
    data.trend.mrr.length >= 2
      ? data.trend.mrr[data.trend.mrr.length - 1].value - data.trend.mrr[0].value
      : null;

  const totalNewUsers = data.events.reduce((s, e) => s + e.started + e.reactivated, 0);
  const totalCancellations = data.events.reduce((s, e) => s + e.cancelled, 0);

  const keyMetrics = data.metrics.filter((m) =>
    ["mrr", "arr", "arpu", "grossMarginPercent", "churnPercent", "nrrPercent"].includes(m.key),
  );
  const otherMetrics = data.metrics.filter(
    (m) => !["mrr", "arr", "arpu", "grossMarginPercent", "churnPercent", "nrrPercent"].includes(m.key),
  );

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-muted">{t("period")}</label>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-item border border-border bg-surface px-2 py-1 text-xs text-foreground"
        >
          <option value={30}>30 {t("days")}</option>
          <option value={60}>60 {t("days")}</option>
          <option value={90}>90 {t("days")}</option>
          <option value={180}>180 {t("days")}</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-item border border-border bg-surface px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
            {t("currentMrr")}
          </p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">
            &euro;{data.currentMrr.toFixed(2)}
          </p>
          {mrrChange !== null && (
            <p
              className={`flex items-center gap-0.5 text-[10px] ${mrrChange >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            >
              {mrrChange >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {mrrChange >= 0 ? "+" : ""}
              &euro;{mrrChange.toFixed(2)}
            </p>
          )}
        </div>

        <div className="rounded-item border border-border bg-surface px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
            {t("payingSubscribers")}
          </p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">
            {data.payingSubscribers}
          </p>
          <p className="text-[10px] text-muted">
            / {data.totalAccounts} {t("totalAccounts")}
          </p>
        </div>

        <div className="rounded-item border border-border bg-surface px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
            {t("newUsers")}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-lg font-semibold text-green-600 dark:text-green-400">
            <UserPlus className="h-4 w-4" />
            {totalNewUsers}
          </p>
        </div>

        <div className="rounded-item border border-border bg-surface px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
            {t("cancellations")}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-lg font-semibold text-red-600 dark:text-red-400">
            <UserMinus className="h-4 w-4" />
            {totalCancellations}
          </p>
        </div>
      </div>

      {/* Key metrics */}
      <div>
        <h3 className="mb-2 text-xs font-semibold text-foreground">{t("keyMetrics")}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {keyMetrics.map((m) => {
            const stateLabel = metricStateLabel(m, t);
            return (
              <div
                key={m.key}
                className="rounded-item border border-border bg-surface px-3 py-2"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  {METRIC_LABELS[m.key] ?? m.key}
                </p>
                {m.state === "computed" ? (
                  <>
                    <p className="mt-0.5 text-lg font-semibold text-foreground">
                      {formatMetricValue(m)}
                    </p>
                    {m.note && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">{m.note}</p>
                    )}
                  </>
                ) : (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                    <AlertCircle className="h-3 w-3" />
                    {stateLabel}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Other metrics */}
      {otherMetrics.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-foreground">{t("otherMetrics")}</h3>
          <div className="overflow-x-auto rounded-item border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">{t("metric")}</th>
                  <th className="px-3 py-2 text-right">{t("value")}</th>
                  <th className="px-3 py-2">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {otherMetrics.map((m) => {
                  const stateLabel = metricStateLabel(m, t);
                  return (
                    <tr key={m.key} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {METRIC_LABELS[m.key] ?? m.key}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {formatMetricValue(m)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {stateLabel ?? (m.note ?? "")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MRR trend */}
      {data.trend.mrr.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-foreground">{t("mrrTrend")}</h3>
          <div className="max-h-[300px] overflow-auto rounded-item border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-surface text-[10px] font-medium uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">{t("date")}</th>
                  <th className="px-3 py-2 text-right">MRR</th>
                  <th className="px-3 py-2 text-right">{t("aiCost")}</th>
                  <th className="px-3 py-2 text-right">{t("subscribers")}</th>
                  <th className="px-3 py-2 w-24">{t("margin")}</th>
                </tr>
              </thead>
              <tbody>
                {[...data.trend.mrr].reverse().map((point, i) => {
                  const idx = data.trend.mrr.length - 1 - i;
                  const cost = data.trend.aiCost[idx]?.value ?? 0;
                  const subs = data.trend.subscribers[idx]?.value ?? 0;
                  const margin = point.value > 0 ? ((point.value - cost) / point.value) * 100 : 0;
                  return (
                    <tr key={point.day} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 font-mono text-muted">{point.day}</td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        &euro;{point.value.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        &euro;{cost.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{subs}</td>
                      <td className="px-3 py-1.5">
                        <MiniBar value={margin} max={100} />
                        <span className="ml-1 text-[10px] text-muted">{margin.toFixed(0)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subscription events by month */}
      {data.events.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-foreground">{t("eventsByMonth")}</h3>
          <div className="overflow-x-auto rounded-item border border-border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-[10px] font-medium uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">{t("month")}</th>
                  <th className="px-3 py-2 text-right text-green-600 dark:text-green-400">
                    {t("started")}
                  </th>
                  <th className="px-3 py-2 text-right text-green-600 dark:text-green-400">
                    {t("reactivated")}
                  </th>
                  <th className="px-3 py-2 text-right text-red-600 dark:text-red-400">
                    {t("cancelled")}
                  </th>
                  <th className="px-3 py-2 text-right">{t("upgraded")}</th>
                  <th className="px-3 py-2 text-right">{t("downgraded")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("net")}</th>
                </tr>
              </thead>
              <tbody>
                {[...data.events].reverse().map((ev) => {
                  const net = ev.started + ev.reactivated - ev.cancelled;
                  return (
                    <tr key={ev.month} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 font-mono text-muted">{ev.month}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-green-600 dark:text-green-400">
                        {ev.started > 0 ? `+${ev.started}` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-green-600 dark:text-green-400">
                        {ev.reactivated > 0 ? `+${ev.reactivated}` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-red-600 dark:text-red-400">
                        {ev.cancelled > 0 ? `-${ev.cancelled}` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {ev.upgraded > 0 ? ev.upgraded : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {ev.downgraded > 0 ? ev.downgraded : "—"}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right font-mono font-semibold ${
                          net > 0
                            ? "text-green-600 dark:text-green-400"
                            : net < 0
                              ? "text-red-600 dark:text-red-400"
                              : ""
                        }`}
                      >
                        {net > 0 ? `+${net}` : net === 0 ? "0" : String(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
