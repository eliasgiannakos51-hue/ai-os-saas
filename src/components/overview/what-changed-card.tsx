import Link from "next/link";
import { History } from "lucide-react";

/**
 * WHAT IS DIFFERENT SINCE YOU WERE LAST HERE.
 *
 * V4.6 #10: "this is the reason somebody opens it again tomorrow." The
 * rest of the Home describes a state; this describes a CHANGE, and a
 * state you have already seen is not a reason to come back.
 *
 * IT NEEDS A REAL LAST TIME, and nothing recorded one — user_devices
 * .last_seen is touched by the device check on the very load that is
 * rendering, so it always says "now". user_onboarding.home_seen_at is
 * written by /api/home/seen AFTER the page is shown, so the render can
 * diff against the previous value.
 *
 * RENDERS NOTHING ON A FIRST VISIT, and nothing when nothing changed.
 * There is no "since last time" when there is no last time, and "nothing
 * has changed" is a sentence that makes the page longer and the reason to
 * return weaker. Both are the absence of the card, not an empty one.
 */
export type Change = { label: string; count: number; href?: string };

export function WhatChangedCard({
  title,
  sinceLabel,
  changes,
}: {
  title: string;
  sinceLabel: string;
  changes: Change[];
}) {
  const real = changes.filter((c) => c.count > 0);
  if (real.length === 0) return null;
  return (
    <section className="mt-6 rounded-2xl border border-border bg-panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
          <History className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {/* THE PERIOD, NOT JUST THE NUMBER — V4.6 #7. "3 new entries" is
            a number without a window; "3 new entries since Tuesday" is a
            fact. */}
        <span className="text-xs text-muted">{sinceLabel}</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {real.map((c) => (
          <li key={c.label} className="text-sm">
            {c.href ? (
              <Link
                href={c.href}
                className="inline-flex min-h-[44px] items-center gap-1.5 text-foreground/90 transition-colors duration-150 hover:text-foreground"
              >
                <span className="font-semibold tabular-nums text-foreground">{c.count}</span>
                <span className="text-muted underline decoration-dotted underline-offset-2">{c.label}</span>
              </Link>
            ) : (
              <span className="inline-flex min-h-[44px] items-center gap-1.5">
                <span className="font-semibold tabular-nums text-foreground">{c.count}</span>
                <span className="text-muted">{c.label}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
