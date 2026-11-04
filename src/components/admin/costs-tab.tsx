"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { formatNumber } from "@/lib/format-number";

type DayProvider = { date: string; provider: string; costEur: number; calls: number };
type ProviderTotal = { provider: string; costEur: number; calls: number };
type FlaggedUser = {
  userId: string;
  email: string;
  costEur: number;
  monthlyPrice: number;
  margin: number | null;
  calls: number;
};

type CostsData = {
  days: number;
  totalCostEur: number;
  totalCalls: number;
  providerTotals: ProviderTotal[];
  dailyProviderCosts: DayProvider[];
  flaggedUsers: FlaggedUser[];
};

export function AdminCostsTab() {
  const t = useTranslations("adminDashboard.costs");
  const locale = useLocale();
  const [data, setData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchCosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/costs?days=${days}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok) setData(json);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted">{t("loading")}</p>;
  }

  if (!data) {
    return <p className="py-8 text-center text-sm text-muted">{t("noData")}</p>;
  }

  const dates = [...new Set(data.dailyProviderCosts.map((d) => d.date))].sort((a, b) =>
    b.localeCompare(a),
  );
  const providers = data.providerTotals.map((p) => p.provider);

  const costByDateProvider = new Map<string, number>();
  for (const dp of data.dailyProviderCosts) {
    costByDateProvider.set(`${dp.date}|${dp.provider}`, dp.costEur);
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-muted">{t("period")}</label>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-item border border-border bg-panel px-2 py-1 text-xs text-foreground"
        >
          <option value={7}>7 {t("days")}</option>
          <option value={14}>14 {t("days")}</option>
          <option value={30}>30 {t("days")}</option>
          <option value={60}>60 {t("days")}</option>
          <option value={90}>90 {t("days")}</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-item border border-border bg-panel px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
            {t("totalCost")}
          </p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">
            &euro;{data.totalCostEur.toFixed(2)}
          </p>
        </div>
        <div className="rounded-item border border-border bg-panel px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
            {t("totalCalls")}
          </p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">
            {formatNumber(data.totalCalls, locale)}
          </p>
        </div>
        {data.providerTotals.slice(0, 2).map((pt) => (
          <div key={pt.provider} className="rounded-item border border-border bg-panel px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
              {pt.provider}
            </p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">
              &euro;{pt.costEur.toFixed(2)}
            </p>
            <p className="text-[10px] text-muted">
              {formatNumber(pt.calls, locale)} {t("callsLabel")}
            </p>
          </div>
        ))}
      </div>

      {/* Flagged users: cost > what they pay */}
      {data.flaggedUsers.length > 0 && (
        <div className="rounded-item border border-danger/40 bg-danger/10 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <h3 className="text-xs font-semibold text-danger">
              {t("flaggedTitle")}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] font-medium uppercase tracking-wide text-danger/70">
                  <th className="px-2 py-1">{t("flaggedEmail")}</th>
                  <th className="px-2 py-1 text-right">{t("flaggedCost")}</th>
                  <th className="px-2 py-1 text-right">{t("flaggedPays")}</th>
                  <th className="px-2 py-1 text-right">{t("flaggedMargin")}</th>
                  <th className="px-2 py-1 text-right">{t("flaggedCalls")}</th>
                </tr>
              </thead>
              <tbody>
                {data.flaggedUsers.map((u) => (
                  <tr key={u.userId} className="border-t border-danger/30">
                    <td className="px-2 py-1 font-mono">{u.email}</td>
                    <td className="px-2 py-1 text-right font-mono text-danger">
                      &euro;{u.costEur.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {u.monthlyPrice > 0 ? `€${u.monthlyPrice.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-danger">
                      {u.margin !== null ? `${u.margin.toFixed(1)}x` : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">{u.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Provider totals table */}
      {data.providerTotals.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-foreground">{t("byProvider")}</h3>
          <div className="overflow-x-auto rounded-item border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-panel text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">{t("provider")}</th>
                  <th className="px-3 py-2 text-right">{t("cost")}</th>
                  <th className="px-3 py-2 text-right">{t("callsLabel")}</th>
                  <th className="px-3 py-2 text-right">{t("share")}</th>
                </tr>
              </thead>
              <tbody>
                {data.providerTotals.map((pt) => (
                  <tr key={pt.provider} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium capitalize">{pt.provider}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      &euro;{pt.costEur.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatNumber(pt.calls, locale)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {data.totalCostEur > 0
                        ? `${((pt.costEur / data.totalCostEur) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily breakdown table */}
      {dates.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-foreground">{t("dailyBreakdown")}</h3>
          <div className="max-h-[400px] overflow-auto rounded-item border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-panel text-[10px] font-medium uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">{t("date")}</th>
                  {providers.map((p) => (
                    <th key={p} className="px-3 py-2 text-right capitalize">
                      {p}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">{t("dayTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {dates.map((date) => {
                  const dayTotal = providers.reduce(
                    (s, p) => s + (costByDateProvider.get(`${date}|${p}`) ?? 0),
                    0,
                  );
                  return (
                    <tr key={date} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 font-mono text-muted">{date}</td>
                      {providers.map((p) => {
                        const cost = costByDateProvider.get(`${date}|${p}`) ?? 0;
                        return (
                          <td key={p} className="px-3 py-1.5 text-right font-mono">
                            {cost > 0 ? `€${cost.toFixed(4)}` : "—"}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right font-mono font-medium">
                        {dayTotal > 0 ? `€${dayTotal.toFixed(4)}` : "—"}
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
