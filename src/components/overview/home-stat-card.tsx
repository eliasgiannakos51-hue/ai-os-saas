"use client";

import type { LucideIcon } from "lucide-react";
import { ResponsiveContainer, LineChart, Line } from "recharts";

// Compact stat card for the top-of-Home strip (see overview/page.tsx) —
// `trend`, when provided, is a real daily-count series (not synthetic):
// overview/page.tsx builds it from actual `created_at` timestamps across
// every module, bucketed into rolling 24h windows. Cards with no real
// history to show (Most Active, Credits Remaining) simply omit `trend`
// and render the number alone rather than a fabricated line.
export function HomeStatCard({
  icon: Icon,
  label,
  value,
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: number[];
}) {
  const chartData = trend?.map((count, i) => ({ i, count }));
  const hasTrend = chartData && chartData.length > 1 && chartData.some((d) => d.count > 0);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-panel p-4 transition-colors duration-150 hover:border-orange-500/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="mt-2.5 truncate text-xl font-bold text-foreground">{value}</p>
          <p className="mt-0.5 truncate text-[11px] uppercase tracking-wide text-muted">{label}</p>
        </div>
        {hasTrend && (
          <div className="h-10 w-16 shrink-0" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#f97316"
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
