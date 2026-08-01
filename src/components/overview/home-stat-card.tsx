"use client";

import type { ReactNode } from "react";
import { ResponsiveContainer, LineChart, Line } from "recharts";

// Compact stat card for the top-of-Home strip (see overview/page.tsx) —
// `trend`, when provided, is a real daily-count series (not synthetic):
// overview/page.tsx builds it from actual `created_at` timestamps across
// every module, bucketed into rolling 24h windows. Cards with no real
// history to show (Most Active, Credits Remaining) simply omit `trend`
// and render the number alone rather than a fabricated line.
//
// `icon` takes an already-rendered element (`<Database className="..." />`),
// not a component reference (`Database`) — this card is a Client Component
// (needs recharts), and its Server Component callers can't pass a bare
// component reference across that boundary (React can serialize rendered
// output, not a function/component value), which is exactly the "Functions
// cannot be passed directly to Client Components" crash this shape avoids.
export function HomeStatCard({
  icon,
  label,
  value,
  trend,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  trend?: number[];
}) {
  const chartData = trend?.map((count, i) => ({ i, count }));
  const hasTrend = chartData && chartData.length > 1 && chartData.some((d) => d.count > 0);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-[linear-gradient(160deg,var(--panel)_0%,var(--panel)_65%,rgba(249,115,22,0.035)_100%)] p-4 transition-all duration-150 hover:border-orange-500/50 hover:shadow-[0_0_0_1px_rgba(249,115,22,0.15),0_8px_28px_-8px_rgba(249,115,22,0.45)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
            {icon}
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
