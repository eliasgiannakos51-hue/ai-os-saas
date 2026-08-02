// Pure presentational — overview/page.tsx computes the score (see
// lib/health-score.ts) and resolves every string via getTranslations,
// same convention as AiCoachCard/ActiveMissionCard. Static SVG ring, no
// client JS needed.
const RADIUS = 40;
const STROKE_WIDTH = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function HealthScoreCard({
  title,
  score,
  rangeLabel,
  suggestion,
}: {
  title: string;
  score: number;
  rangeLabel: string;
  suggestion: string;
}) {
  const clamped = Math.min(100, Math.max(0, score));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <div className="mt-6 flex items-center gap-4 rounded-2xl border border-border bg-panel p-4">
      <svg
        viewBox="0 0 96 96"
        className="h-20 w-20 shrink-0 -rotate-90"
        role="img"
        aria-label={`${title}: ${clamped} / 100`}
      >
        <circle
          cx="48"
          cy="48"
          r={RADIUS}
          fill="none"
          stroke="var(--input)"
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          cx="48"
          cy="48"
          r={RADIUS}
          fill="none"
          stroke="#f97316"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500"
        />
        <text
          x="48"
          y="48"
          textAnchor="middle"
          dominantBaseline="central"
          className="rotate-90 fill-foreground text-[22px] font-bold"
          style={{ transformOrigin: "48px 48px" }}
        >
          {clamped}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm text-orange-400">{rangeLabel}</p>
        <p className="mt-1 text-xs text-muted">{suggestion}</p>
      </div>
    </div>
  );
}
