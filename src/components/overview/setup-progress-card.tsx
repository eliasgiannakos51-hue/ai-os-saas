import Link from "next/link";
import { Check, Circle, ArrowRight } from "lucide-react";

/**
 * What stands where the score does, until there is enough to score.
 *
 * V4.6 #5. "Business Health Score: 0 / 100" on an account opened five
 * minutes ago is a verdict passed on no evidence — and it was measured
 * saying exactly that, on a real production build, before this existed.
 * Progress through setup is the same shape of thing (a ring, a number, a
 * sentence about what to do next) reporting something the account has
 * actually done.
 *
 * EVERY STEP IS DERIVED FROM DATA THE PAGE ALREADY HAS. No new query:
 * onboarding state, the entry total, the module summaries and the active
 * mission are all read by overview/page.tsx before this renders. A setup
 * checklist that needed its own round trip would be a worse trade than
 * the number it replaces.
 */
export type SetupStep = {
  id: string;
  label: string;
  done: boolean;
  href: string;
};

const RADIUS = 52;
const STROKE_WIDTH = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function SetupProgressCard({
  title,
  steps,
  countLabel,
  suggestion,
}: {
  title: string;
  steps: SetupStep[];
  /** Already interpolated by the caller — "2 of 4 steps". */
  countLabel: string;
  suggestion: string;
}) {
  const done = steps.filter((s) => s.done).length;
  const fraction = steps.length === 0 ? 0 : done / steps.length;
  const offset = CIRCUMFERENCE - fraction * CIRCUMFERENCE;
  const next = steps.find((s) => !s.done);

  return (
    <div className="glass-panel mt-6 flex flex-col gap-5 rounded-2xl p-5 sm:flex-row sm:items-center">
      <div className="relative z-[1] flex min-w-0 items-center gap-4">
        <svg
          viewBox="0 0 120 120"
          className="h-[104px] w-[104px] shrink-0 -rotate-90"
          role="img"
          aria-label={`${title}: ${done} / ${steps.length}`}
        >
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            className="text-white/[0.06]"
          />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="text-emerald-400/70"
          />
          {/* Counter-rotated so the text sits upright inside a ring the
              parent has turned -90deg to start the sweep at twelve. */}
          <text
            x="60"
            y="60"
            textAnchor="middle"
            dominantBaseline="central"
            transform="rotate(90 60 60)"
            className="fill-foreground text-[26px] font-bold"
          >
            {done}/{steps.length}
          </text>
        </svg>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {/* Deliberately NOT gradient text. The card it replaces put a
              gradient on this line; the page already has one gradient
              headline above it, and a second one here is the colour
              hierarchy the accent rule is about. */}
          <p className="mt-0.5 text-lg font-bold text-emerald-300">{countLabel}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{suggestion}</p>
        </div>
      </div>


      {/* WHY THIS CARRIES A BASIS AND NOT JUST `flex-1`.
          `flex-1` is `flex: 1 1 0%` — a basis of ZERO. Beside a sibling
          whose basis is `auto`, that is not "share the row", it is "take
          whatever is left over", and when the sibling's max-content is
          wider than the row there is nothing left over. Measured on a
          real build at 1024 (scripts/tests/home-audit.prodtest.mjs
          section 3): this list came out EIGHT PIXELS wide, each <li> was
          0px, and the `shrink-0` arrow at the end of the next step sat at
          x=1038 in a 1024 viewport — a 14px horizontal overflow of the
          whole page, which layout-stress.prodtest.mjs had been reporting
          as "widest: li > a > svg > path" without being able to say why.
          A real basis makes both columns shrink in proportion instead,
          so the deficit is shared and neither collapses. */}
      <ul className="relative z-[1] min-w-0 flex-1 space-y-1.5 sm:basis-60 sm:pl-2">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className={`flex min-h-[44px] items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-white/[0.04] ${
                step.done ? "text-muted" : "text-foreground"
              }`}
            >
              {step.done ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              )}
              <span className={`min-w-0 truncate ${step.done ? "line-through decoration-muted/50" : ""}`}>
                {step.label}
              </span>
              {step.id === next?.id && (
                <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
