"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";
import type { TrendPoint } from "@/lib/billing/metrics";

// EVERY POINT IS A DAY THAT REALLY HAPPENED, read from revenue_snapshots.
// The series starts on the day the snapshot table shipped and not before —
// there is no back-fill, because a back-filled MRR would be today's price
// list applied to a past we did not record, which is a chart of an
// assumption.
//
// The theme tokens are CHANNEL TRIPLES and are only valid inside rgb();
// recharts takes stroke and fill as strings the compiler never checks.
export function TrendChart({
  title,
  points,
  changePercent,
  format = "eur",
}: {
  title: string;
  points: TrendPoint[];
  changePercent: number | null;
  format?: "eur" | "count";
}) {
  const t = useTranslations("finance");

  const value = (n: number) =>
    format === "eur"
      ? Math.abs(n) >= 1000
        ? `€${(n / 1000).toFixed(1)}k`
        : `€${Math.round(n)}`
      : String(Math.round(n));

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {changePercent === null ? (
          // NOT "0%". A change that cannot be computed — one point, or a
          // zero baseline — is not a change of nothing.
          <span className="text-xs text-muted">{t("noChangeYet")}</span>
        ) : (
          <span className={`text-xs ${changePercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {changePercent >= 0 ? "+" : ""}
            {changePercent.toFixed(1)}%
          </span>
        )}
      </div>

      {points.length < 2 ? (
        <p className="mt-3 text-xs text-muted">{t("notEnoughDays", { days: points.length })}</p>
      ) : (
        <div className="mt-3 h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
              <XAxis dataKey="day" stroke="rgb(var(--muted))" fontSize={10} interval="preserveStartEnd" />
              <YAxis stroke="rgb(var(--muted))" fontSize={10} tickFormatter={value} />
              <Tooltip
                formatter={(v) => value(Number(v))}
                contentStyle={{
                  background: "rgb(var(--panel))",
                  border: "1px solid rgb(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "rgb(var(--foreground))",
                }}
              />
              <Area type="monotone" dataKey="value" stroke="#f97316" fill="#f97316" fillOpacity={0.18} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
