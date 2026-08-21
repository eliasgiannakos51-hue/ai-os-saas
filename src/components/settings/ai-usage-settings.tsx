"use client";

import { useTranslations, useLocale } from "next-intl";
import { BarChart3, Zap, Layers, Database } from "lucide-react";
import { formatNumber } from "@/lib/format-number";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export type ModuleUsage = { titleKey: string; count: number };

function StatTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  /** Optional second line — used to say what an uncharged account's
   *  activity would have cost, so "Unlimited" is not the whole story. */
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-input p-3.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="mt-2 text-xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{label}</p>
      {detail && <p className="mt-1 text-[11px] leading-snug text-muted/80">{detail}</p>}
    </div>
  );
}

export function AiUsageSettings({
  totalCreditsUsed,
  wouldHaveUsedCredits = null,
  totalEntries,
  mostActiveModuleTitle,
  moduleUsage,
}: {
  totalCreditsUsed: number;
  /** For an account that is never charged (admin, beta): what the same
   *  activity WOULD have cost. Null for a normal account, which is
   *  charged for real and whose tile is already truthful. */
  wouldHaveUsedCredits?: number | null;
  totalEntries: number;
  mostActiveModuleTitle: string | null;
  moduleUsage: ModuleUsage[];
}) {
  const t = useTranslations("settings.aiUsage");
  const locale = useLocale();
  const tKey = useTranslations();
  // Top 8 by count, ascending, so the biggest bar ends up at the top of a
  // horizontal chart — keeps a ~23-module fan-out readable instead of a
  // wall of thin bars.
  // The axis binds by STRING dataKey, which no type check can follow: when
  // moduleUsage stopped carrying `title` and started carrying `titleKey`,
  // tsc stayed green and the Y axis would simply have rendered blank
  // labels. The translated name is materialised here so the key the chart
  // reads and the field this object has cannot drift apart again.
  const chartData = [...moduleUsage]
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .reverse()
    .map((m) => ({ ...m, title: tKey(m.titleKey) }));

  return (
    <div id="ai-usage" className="mb-6 scroll-mt-20 space-y-4 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <BarChart3 className="h-4 w-4 text-orange-400" /> {t("title")}
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* "0 credits used" was true and useless: a bypass account is
            charged nothing by design, so credit_transactions is empty
            while the margin report on the same page shows real euros of
            Anthropic spend. Two numbers about one activity that could not
            both be right. settleReservation already stores what the charge
            would have been — this is the first thing to read it. */}
        <StatTile
          icon={Zap}
          label={t("creditsUsed")}
          value={
            wouldHaveUsedCredits !== null
              ? t("unlimited")
              : formatNumber(totalCreditsUsed, locale)
          }
          detail={
            wouldHaveUsedCredits !== null
              ? t("wouldHaveCost", { credits: formatNumber(wouldHaveUsedCredits, locale) })
              : undefined
          }
        />
        <StatTile icon={Database} label={t("totalEntries")} value={formatNumber(totalEntries, locale)} />
        <StatTile
          icon={Layers}
          label={t("mostActiveModule")}
          value={mostActiveModuleTitle ?? "—"}
        />
      </div>

      {chartData.length > 0 && (
        <div className="h-64 pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="title"
                width={100}
                tick={{ fill: "rgb(var(--muted))", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "rgb(var(--panel))",
                  border: "1px solid rgb(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "rgb(var(--foreground))",
                }}
                cursor={{ fill: "rgba(249,115,22,0.06)" }}
              />
              <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
