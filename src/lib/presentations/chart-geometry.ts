import type { SlideChart } from "@/lib/presentations/deck";

/**
 * A CHART'S SHAPES, ONCE, for the two places that draw it themselves:
 * the slide on the page (components/presentations/deck-chart.tsx, SVG)
 * and the PDF (lib/pdf/deck.tsx, @react-pdf's Svg). PowerPoint draws its
 * own from the numbers (lib/presentations/pptx.ts). Pure arithmetic on
 * the stored points, so the page and the PDF cannot disagree about which
 * bar is taller — scripts/tests/slides-charts.test.mjs measures it.
 *
 * The scale runs from zero (or the lowest value, when it is below zero)
 * to the highest, so a bar's height is its value and a negative one hangs
 * below the line.
 */
export type ChartShapes = {
  /** The y of the zero line. */
  zero: number;
  bars: { x: number; y: number; w: number; h: number }[];
  line: { x: number; y: number }[];
  slices: { path: string; share: number }[];
};

export function chartShapes(chart: Pick<SlideChart, "kind" | "points">, width: number, height: number): ChartShapes {
  const values = chart.points.map((p) => p.value);
  const out: ChartShapes = { zero: height, bars: [], line: [], slices: [] };
  if (values.length === 0) return out;

  if (chart.kind === "pie") {
    const total = values.reduce((s, v) => s + Math.max(0, v), 0);
    if (total <= 0) return out;
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2;
    let angle = -Math.PI / 2;
    for (const v of values) {
      const share = Math.max(0, v) / total;
      const next = angle + share * Math.PI * 2;
      const large = share > 0.5 ? 1 : 0;
      const p = (a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
      // A whole circle is two half arcs: one arc from a point to itself draws nothing.
      const path =
        share >= 0.9999
          ? `M ${p(angle)} A ${r} ${r} 0 1 1 ${p(angle + Math.PI)} A ${r} ${r} 0 1 1 ${p(angle)} Z`
          : `M ${cx} ${cy} L ${p(angle)} A ${r} ${r} 0 ${large} 1 ${p(next)} Z`;
      out.slices.push({ path, share });
      angle = next;
    }
    return out;
  }

  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const span = top - bottom || 1;
  const yOf = (v: number) => ((top - v) / span) * height;
  out.zero = yOf(0);

  if (chart.kind === "line") {
    const step = values.length > 1 ? width / (values.length - 1) : 0;
    out.line = values.map((v, i) => ({ x: values.length > 1 ? i * step : width / 2, y: yOf(v) }));
    return out;
  }

  const slot = width / values.length;
  const w = slot * 0.7;
  out.bars = values.map((v, i) => {
    const y = Math.min(yOf(v), out.zero);
    return { x: i * slot + (slot - w) / 2, y, w, h: Math.abs(yOf(v) - out.zero) };
  });
  return out;
}

/** A value as a person reads it: grouped digits, at most two decimals. */
export function formatChartValue(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  } catch {
    return String(value);
  }
}
