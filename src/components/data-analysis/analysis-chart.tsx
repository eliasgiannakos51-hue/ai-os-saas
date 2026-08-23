"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslations } from "next-intl";
import type { BuiltChart } from "@/lib/data-analysis/charts";

// EVERY POINT WAS COMPUTED ON THE SERVER, from the real rows, by
// lib/data-analysis/charts.ts. This component draws what it is given and
// computes nothing — which is what keeps "the chart and the export and
// the answer all agree" true by construction rather than by care.
//
// THE dataKey STRINGS ARE THE TRAP. Recharts resolves "label" and "value"
// at RUNTIME against each datum: a typo, or a rename of ChartPoint's
// fields, compiles perfectly and renders an empty chart. They are written
// once here, against a type whose field names the build gate asserts.

// THE THEME TOKENS ARE CHANNEL TRIPLES ("163 163 163"), not colours, so
// they are only valid inside rgb(). Recharts takes stroke and fill as
// STRINGS, which the compiler never looks at — a bare var(--muted) here
// compiles, renders `stroke: var(--muted)`, and the axis simply has no
// colour. light-theme-contrast.test.mjs scans for exactly this.
const COLOURS = ["#f97316", "#60a5fa", "#4ade80", "#f472b6", "#facc15", "#a78bfa", "#22d3ee", "#fb7185"];

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return abs >= 100 ? String(Math.round(value)) : String(Math.round(value * 100) / 100);
}

export function AnalysisChart({ chart }: { chart: BuiltChart }) {
  const t = useTranslations("dataAnalysis.chart");
  const { spec, points } = chart;

  if (points.length === 0) {
    // AN EMPTY CHART SAYS SO. A blank axis reads as "there is none of
    // this in your data", which is a different claim from "nothing could
    // be computed for it".
    return (
      <div className="rounded-2xl border border-border bg-panel p-5">
        <p className="text-sm font-semibold text-foreground">{spec.title}</p>
        <p className="mt-2 text-xs text-muted">{t("nothingToPlot")}</p>
      </div>
    );
  }

  const axis = { stroke: "rgb(var(--muted))", fontSize: 11 };
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />;
  const tooltip = (
    <Tooltip
      formatter={(value) => formatValue(Number(value))}
      contentStyle={{
        background: "rgb(var(--panel))",
        border: "1px solid rgb(var(--border))",
        borderRadius: 12,
        fontSize: 12,
        color: "rgb(var(--foreground))",
      }}
    />
  );

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <p className="text-sm font-semibold text-foreground">{spec.title}</p>
      {spec.reason ? <p className="mt-1 text-xs text-muted">{spec.reason}</p> : null}
      {chart.truncated ? (
        <p className="mt-1 text-xs text-amber-400">
          {t("truncated", { count: points.length })}
        </p>
      ) : null}

      <div className="mt-3 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {spec.kind === "bar" ? (
            <BarChart data={points}>
              {grid}
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
              <YAxis {...axis} tickFormatter={formatValue} />
              {tooltip}
              <Bar dataKey="value" fill={COLOURS[0]} radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : spec.kind === "line" ? (
            <LineChart data={points}>
              {grid}
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
              <YAxis {...axis} tickFormatter={formatValue} />
              {tooltip}
              <Line type="monotone" dataKey="value" stroke={COLOURS[0]} strokeWidth={2} dot={false} />
            </LineChart>
          ) : spec.kind === "area" ? (
            <AreaChart data={points}>
              {grid}
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
              <YAxis {...axis} tickFormatter={formatValue} />
              {tooltip}
              <Area type="monotone" dataKey="value" stroke={COLOURS[0]} fill={COLOURS[0]} fillOpacity={0.2} />
            </AreaChart>
          ) : spec.kind === "pie" ? (
            <PieChart>
              {tooltip}
              <Pie data={points} dataKey="value" nameKey="label" outerRadius={90} innerRadius={40}>
                {points.map((point, index) => (
                  <Cell key={point.label} fill={COLOURS[index % COLOURS.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <ScatterChart>
              {grid}
              <XAxis dataKey="label" type="number" name={spec.x} {...axis} tickFormatter={formatValue} />
              <YAxis dataKey="value" type="number" name={spec.y ?? ""} {...axis} tickFormatter={formatValue} />
              {tooltip}
              <Scatter data={points} fill={COLOURS[1]} />
            </ScatterChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
