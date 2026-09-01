import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

/**
 * ONE CARD WHERE THERE WERE THREE.
 *
 * V4.6 #10. "What's Next?", "AI Coach" and "Active Mission" said
 * similar things in three stacked full-width cards, 208px of vertical
 * space between them, all answering "what do I do now". Measured on the
 * real page (scripts/tests/home-audit.prodtest.mjs): AI Coach 74px at
 * y=1026, the next-action card 134px at y=1124, and the plan card below
 * that — all of it under the fold, where the question "what do I do now"
 * is least useful.
 *
 * The three parts kept their content and lost their frames:
 *   - the ACTION, with the button that performs it
 *   - the WEEK, one line of what the coach used to say on its own
 *   - the PLAN, its progress, when there is one
 *
 * Every part is optional and the card renders nothing when all three are
 * empty — an empty "Next" card is a heading with no next.
 */
export function NextCard({
  title,
  action,
  weekSummary,
  plan,
}: {
  title: string;
  action: { message: string; href: string; ctaLabel: string } | null;
  weekSummary: string | null;
  plan: { goal: string; progressPercent: number; stepsLabel: string; href: string; openLabel: string } | null;
}) {
  if (!action && !weekSummary && !plan) return null;
  return (
    <section className="mt-6 rounded-2xl border border-border bg-panel p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
          <Compass className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>

      {action && (
        <div className="mt-3">
          <p className="text-sm leading-relaxed text-foreground/90">{action.message}</p>
          {/* OUTLINE, NOT FILLED — and the reason is that V4.6 #4's rule
              is ONE PRIMARY ACTION PER SCREEN, while this was read as one
              per card.
              Measured by accent-census.prodtest.mjs on the real page:
              /dashboard/overview carried two filled accent buttons —
              150x44 "Make anything" and 129x44 "Go there →" — and it was
              the only screen of six that did. Every other page has one,
              because the other one is the top bar's create button, which
              is on all thirty-nine.
              The top bar keeps the fill: it is the same affordance in the
              same place on every page, and giving Home a second one that
              outranks it locally is what makes a person hesitate. This
              stays visually accented and obviously clickable — it is an
              outline in the accent colour, the same treatment the plan
              link below already uses — so nothing is hidden; there is
              simply one filled button on the screen again. */}
          <Link
            href={action.href}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/60 px-4 py-2 text-sm font-semibold text-orange-300 transition-all duration-200 hover:border-orange-500 hover:bg-orange-500/10"
          >
            {action.ctaLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      {weekSummary && (
        <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted">
          {weekSummary}
        </p>
      )}

      {plan && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">{plan.goal}</p>
            <span className="shrink-0 text-xs text-muted">{plan.stepsLabel}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-input">
            <div
              className="h-full rounded-full bg-orange-500/70"
              style={{ width: `${Math.max(0, Math.min(100, plan.progressPercent))}%` }}
            />
          </div>
          <Link
            href={plan.href}
            className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-xs font-medium text-orange-400 transition-colors duration-150 hover:text-orange-300"
          >
            {plan.openLabel}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  );
}
