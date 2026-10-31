"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { parseAnswerChart } from "@/lib/chat/answer-chart";
import { chartShapes, formatChartValue } from "@/lib/presentations/chart-geometry";

const W = 320;
const H = 140;
// The design system's own chart palette (--chart-1…5 in globals.css), the
// same tokens presentations/deck-chart.tsx and data-analysis/analysis-chart
// draw with — never a bare color, so dark mode and any future palette
// change reach this chart too.
const SLICE_COLOURS = ["rgb(var(--chart-1))", "rgb(var(--chart-2))", "rgb(var(--chart-3))", "rgb(var(--chart-4))", "rgb(var(--chart-5))"];
const ACCENT = SLICE_COLOURS[0];

/**
 * A CODE-COMPUTED CHART UNDER A CHAT ANSWER (the owner's «30. CHAT:
 * ΓΡΑΦΗΜΑΤΑ...», 2026-10-31, Κομμάτι 1), read from the answer's own stored
 * text (lib/chat/answer-chart.ts) — so a reload shows exactly what the
 * stream did, with no new column. Renders nothing when the answer carries
 * no chart, which is the common case.
 *
 * The figure mirrors components/presentations/deck-chart.tsx almost
 * exactly — same shapes, same palette, same source line — with one
 * addition: a small circle at every line point ("σημεία" in the owner's
 * own three chart kinds, γραμμή/στήλες/σημεία), since lib/presentations/
 * chart-geometry.ts has no separate scatter shape to draw markers without
 * a line between them.
 *
 * BELOW the figure, a SEPARATE card — not a caption — states in full
 * sentences how the numbers were produced, because the stop-gate asks for
 * a chart AND a card in the one screenshot, not one figure with a caption
 * under it. Its body reuses presentations.chart's own already-translated
 * sentence (`source`, `how.*`, `openFile`) rather than duplicating those
 * strings under a new key.
 */
export function AnswerChart({ content }: { content: string }) {
  const chart = parseAnswerChart(content);
  const t = useTranslations("presentations.chart");
  const tc = useTranslations("dashboard.chat.chart");
  const locale = useLocale();
  if (!chart) return null;
  const shapes = chartShapes(chart, W, H);
  const { file, x, y, rows, aggregation, dataId } = chart.source;
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
    <div data-testid="answer-chart" className="answer-chart mt-3">
      <figure data-testid="answer-chart-figure" data-kind={chart.kind}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${chart.title}. ${values.join(", ")}`} className="h-36 w-full">
          {chart.kind !== "pie" && <line x1={0} y1={shapes.zero} x2={W} y2={shapes.zero} stroke="currentColor" className="text-border" strokeWidth={1} />}
          {shapes.bars.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={Math.max(b.h, 0.5)} fill={ACCENT} rx={1.5} />
          ))}
          {shapes.line.length > 0 && (
            <polyline points={shapes.line.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" />
          )}
          {shapes.line.map((p, i) => (
            <circle key={i} data-testid="answer-chart-point" cx={p.x} cy={p.y} r={2.5} fill={ACCENT} />
          ))}
          {shapes.slices.map((s, i) => (
            <path key={i} d={s.path} fill={SLICE_COLOURS[i % SLICE_COLOURS.length]} />
          ))}
        </svg>
        <ul data-testid="answer-chart-values" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground">
          {chart.points.map((p, i) => (
            <li key={i} className="inline-flex items-center gap-1">
              {chart.kind === "pie" && <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: SLICE_COLOURS[i % SLICE_COLOURS.length] }} />}
              <span className="text-muted">{p.label}</span>
              <span className="tabular-nums">{formatChartValue(p.value, locale)}</span>
            </li>
          ))}
        </ul>
      </figure>
      <div data-testid="answer-chart-card" className="surface-tight mt-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{tc("cardTitle")}</p>
        <p className="mt-1 text-[11px] text-foreground">
          {t("source", { file, rows, how })}{" "}
          <Link href={`/dashboard/data-analysis?id=${encodeURIComponent(dataId)}`} className="underline underline-offset-2">
            {t("openFile")}
          </Link>
        </p>
      </div>
    </div>
  );
}
