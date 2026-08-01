"use client";

import { useTranslations } from "next-intl";
import { BarChart3, Zap, Layers, Database } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export type ModuleUsage = { title: string; count: number };

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-input p-3.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="mt-2 text-xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

export function AiUsageSettings({
  totalCreditsUsed,
  totalEntries,
  mostActiveModuleTitle,
  moduleUsage,
}: {
  totalCreditsUsed: number;
  totalEntries: number;
  mostActiveModuleTitle: string | null;
  moduleUsage: ModuleUsage[];
}) {
  const t = useTranslations("settings.aiUsage");
  // Top 8 by count, ascending, so the biggest bar ends up at the top of a
  // horizontal chart — keeps a ~23-module fan-out readable instead of a
  // wall of thin bars.
  const chartData = [...moduleUsage]
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .reverse();

  return (
    <div id="ai-usage" className="mb-6 scroll-mt-20 space-y-4 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <BarChart3 className="h-4 w-4 text-orange-400" /> {t("title")}
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile icon={Zap} label={t("creditsUsed")} value={totalCreditsUsed.toLocaleString()} />
        <StatTile icon={Database} label={t("totalEntries")} value={totalEntries.toLocaleString()} />
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="title"
                width={100}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--foreground)",
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
