"use client";

import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { useCountUp } from "@/hooks/use-count-up";

// overview/page.tsx computes the score (see lib/health-score.ts) and
// resolves every string via getTranslations — this stays purely
// presentational.
//
// `trend` is optional and, when given, is the SAME real 7-day activity
// series the stat cards use (built from actual created_at timestamps in
// overview/page.tsx). Deliberately optional rather than defaulted: a
// synthetic curve here would read as a history of the health score
// itself, which is not something this app stores.
const RADIUS = 52;
const STROKE_WIDTH = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function HealthScoreCard({
  title,
  score,
  rangeLabel,
  suggestion,
  trend,
}: {
  title: string;
  score: number;
  rangeLabel: string;
  suggestion: string;
  trend?: number[];
}) {
  const clamped = Math.min(100, Math.max(0, score));
  // Counts up over the same duration the ring takes to sweep round, so
  // the number and the arc arrive together instead of the number snapping
  // to its final value while the ring is still filling.
  const animatedScore = useCountUp(clamped, 1000);
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  const chartData = trend?.map((count, i) => ({ i, count }));
  const hasTrend = chartData && chartData.length > 1 && chartData.some((d) => d.count > 0);

  return (
    <div className="glass-panel mt-6 flex flex-col gap-5 rounded-2xl p-5 sm:flex-row sm:items-center">
      {/* `shrink-0` used to be on THIS row, which put it around the ring
          AND the text beside it. The text block's own `min-w-0` below then
          did nothing — a child cannot shrink inside a parent that has
          refused to. In English it fit and nobody noticed; in Greek
          "Σκορ Υγείας Επιχείρησης" pushed this card to 926px inside a
          768px window, i.e. the whole page scrolled sideways on a tablet.
          The ring itself is still `shrink-0` (on the <svg>), which is the
          thing that genuinely must not squash. */}
      <div className="relative z-[1] flex min-w-0 items-center gap-4">
        <svg
          viewBox="0 0 120 120"
          className="h-[104px] w-[104px] shrink-0 -rotate-90"
          role="img"
          aria-label={`${title}: ${clamped} / 100`}
        >
          <defs>
            {/* A stroke can't take a CSS gradient, so the amber-to-violet
                sweep has to be an SVG paint server referenced by url(). */}
            <linearGradient id="healthRing" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="55%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <filter id="healthRingGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={STROKE_WIDTH}
          />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="url(#healthRing)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            filter="url(#healthRingGlow)"
            className="transition-[stroke-dashoffset] duration-1000 ease-out"
          />
          <text
            x="60"
            y="60"
            textAnchor="middle"
            dominantBaseline="central"
            className="rotate-90 fill-foreground text-[28px] font-bold"
            style={{ transformOrigin: "60px 60px" }}
          >
            {animatedScore}
          </text>
        </svg>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-lg font-bold text-transparent">
            {rangeLabel}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{suggestion}</p>
        </div>
      </div>

      {/* WHY THIS CARRIES A BASIS AND NOT JUST `flex-1`.
          `flex-1` is `flex: 1 1 0%` — a basis of ZERO. Beside a sibling
          whose basis is `auto`, that is not "share the row", it is "take
          whatever is left over", and when the sibling's max-content is
          wider than the row there is nothing left over. Measured on a
          real build at 1024 (scripts/tests/home-audit.prodtest.mjs
          section 3): the sibling list in setup-progress-card.tsx — the
          card this one swaps places with — came out EIGHT PIXELS wide,
          and its `shrink-0` arrow overflowed the page by 14px. This
          sparkline has the same shape and the same sibling, so it
          collapses the same way; it carries no `shrink-0` child, so it
          vanishes silently instead of overflowing, which is the worse of
          the two failures. A real basis makes both columns shrink in
          proportion instead, so the deficit is shared and neither
          collapses. */}
      {hasTrend && (
        <div className="relative z-[1] h-16 min-w-0 flex-1 sm:basis-60" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="healthArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="count"
                stroke="#fbbf24"
                strokeWidth={2}
                fill="url(#healthArea)"
                // CSS handles the draw-in (globals.css .draw-line) so it
                // respects the app's reduce-motion switch, which recharts'
                // own animation would ignore.
                isAnimationActive={false}
                className="draw-line"
                pathLength={1}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
