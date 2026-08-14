import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The pulsing ring + gently bobbing icon are pure CSS animation — both
// collapse to a static state automatically under the "reduce motion"
// accessibility setting (globals.css's html[data-motion="reduce"] rule
// zeroes every animation-duration), so this needs no extra logic here to
// stay accessible.
export function EmptyState({
  icon: Icon = Inbox,
  children,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(249,115,22,0.18) 0%, rgba(220,38,38,0.06) 50%, transparent 75%)",
        }}
      />
      <span className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-orange-500/10" />
        <span className="absolute inset-2 rounded-full border border-orange-500/15" />
        <span className="relative flex h-20 w-20 animate-[float_3s_ease-in-out_infinite] items-center justify-center rounded-full bg-orange-500/10">
          <Icon className="h-9 w-9 text-orange-400/80" aria-hidden="true" />
        </span>
      </span>
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * An empty list that answers the three questions someone actually has.
 *
 * WHAT THE OLD ONE SAID, on eleven different screens:
 *
 *     No entries yet — use the button above to log your first one.
 *
 * That sentence describes the SCREEN's state, which the reader can already
 * see, and then points at a button they can also already see. It never says
 * what this list is for, why they would want anything in it, or what a good
 * first row even looks like — so the honest response to it is to leave, and
 * on a fresh account there are nineteen of these in a row.
 *
 * So every empty list now answers, in order:
 *
 *   1. WHAT THIS IS      — the one sentence that says what belongs here.
 *   2. WHY YOU WANT IT   — the payoff, in terms of something this product
 *                          does with the data once it exists. Not "stay
 *                          organized"; something concrete and true.
 *   3. ONE EXAMPLE       — a real, specific row, and it is CLICKABLE. The
 *                          gap between "log your first one" and knowing
 *                          what to type is the whole reason these screens
 *                          stay empty, and an example that fills the form
 *                          in closes it.
 *
 * `example` is deliberately not optional-by-convenience. A list that cannot
 * offer an example is a list whose empty state is still guesswork, and the
 * type makes that a decision rather than an omission.
 */
export function GuidedEmptyState({
  icon,
  what,
  why,
  example,
}: {
  icon?: LucideIcon;
  what: string;
  why: string;
  example: React.ReactNode;
}) {
  return (
    <EmptyState icon={icon}>
      <p className="text-base font-semibold text-foreground">{what}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{why}</p>
      <div className="mt-5 flex justify-center">{example}</div>
    </EmptyState>
  );
}
