"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { SlideChart } from "@/lib/presentations/deck";
import { chartShapes, formatChartValue } from "@/lib/presentations/chart-geometry";

const W = 320;
const H = 140;
// The chart palette of the design (--chart-1…5 in globals.css), as Analyze
// draws with it (components/data-analysis/analysis-chart.tsx).
const SLICE_COLOURS = ["rgb(var(--chart-1))", "rgb(var(--chart-2))", "rgb(var(--chart-3))", "rgb(var(--chart-4))", "rgb(var(--chart-5))"];
const ACCENT = SLICE_COLOURS[0];

/**
 * A CHART SLIDE'S CHART ON THE PAGE (package 13): the shapes the PDF draws
 * (lib/presentations/chart-geometry.ts), every point with its value under
 * them, and where the numbers came from — the file, its rows, the
 * arithmetic — with the file one press away in Analyze, where it lives.
 */
export function DeckChart({ chart }: { chart: SlideChart }) {
  const t = useTranslations("presentations.chart");
  const locale = useLocale();
  const shapes = chartShapes(chart, W, H);
  const { file, x, y, rows, aggregation, dataId } = chart.source;
  // One literal key per arithmetic, so the message slicer sees each.
  const how =
    aggregation === "sum"
      ? t("how.sum", { x, y: y ?? "" })
      : aggregation === "mean"
        ? t("how.mean", { x, y: y ?? "" })
        : aggregation === "min"
          ? t("how.min", { x, y: y ?? "" })
          : aggregation === "max"
            ? t("how.max", { x, y: y ?? "" })
            : t("how.count", { x, y: "" });
  const values = chart.points.map((p) => `${p.label}: ${formatChartValue(p.value, locale)}`);
  return (
    <figure data-testid="slide-chart" data-kind={chart.kind} className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${chart.title}. ${values.join(", ")}`} className="h-36 w-full">
        {chart.kind !== "pie" && <line x1={0} y1={shapes.zero} x2={W} y2={shapes.zero} stroke="currentColor" className="text-border" strokeWidth={1} />}
        {shapes.bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={Math.max(b.h, 0.5)} fill={ACCENT} rx={1.5} />
        ))}
        {shapes.line.length > 0 && (
          <polyline points={shapes.line.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" />
        )}
        {shapes.slices.map((s, i) => (
          <path key={i} d={s.path} fill={SLICE_COLOURS[i % SLICE_COLOURS.length]} />
        ))}
      </svg>
      <ul data-testid="slide-chart-values" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground">
        {chart.points.map((p, i) => (
          <li key={i} className="inline-flex items-center gap-1">
            {chart.kind === "pie" && <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: SLICE_COLOURS[i % SLICE_COLOURS.length] }} />}
            <span className="text-muted">{p.label}</span>
            <span className="tabular-nums">{formatChartValue(p.value, locale)}</span>
          </li>
        ))}
      </ul>
      <figcaption data-testid="slide-chart-source" className="mt-1 text-[11px] text-muted">
        {t("source", { file, rows, how })}{" "}
        <Link href={`/dashboard/data-analysis?id=${encodeURIComponent(dataId)}`} className="underline underline-offset-2">
          {t("openFile")}
        </Link>
      </figcaption>
    </figure>
  );
}
