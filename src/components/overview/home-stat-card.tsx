"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { useCountUp, splitLeadingNumber } from "@/hooks/use-count-up";
import { usePulseOnChange } from "@/hooks/use-pulse-on-change";
import { formatNumber } from "@/lib/format-number";
import { useLocale } from "next-intl";

// Compact stat card for the top-of-Home strip (see overview/page.tsx) —
// `trend`, when provided, is a real daily-count series (not synthetic):
// overview/page.tsx builds it from actual `created_at` timestamps across
// every module, bucketed into rolling 24h windows. Cards with no real
// history to show (Most Active, Credits Remaining) simply omit `trend`
// and render the number alone rather than a fabricated line.
//
// `icon` takes an already-rendered element (`<Database className="..." />`),
// not a component reference (`Database`) — this card is a Client Component
// (needs recharts), and its Server Component callers can't pass a bare
// component reference across that boundary (React can serialize rendered
// output, not a function/component value), which is exactly the "Functions
// cannot be passed directly to Client Components" crash this shape avoids.
export function HomeStatCard({
  icon,
  label,
  value,
  trend,
  placeholderLabel,
  explain,
  basis,
  href,
  openLabel,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  trend?: number[];
  /**
   * One line: what this number counts, and why anybody should care.
   *
   * V4.6 #7. A number with a two-word label is a number the reader has to
   * guess at — "This week" of WHAT, counted how, since when. Required
   * rather than optional, because an optional explanation is the one that
   * does not get written for the next card.
   */
  explain: string;
  /**
   * What it was computed from — "from 24 entries".
   *
   * Optional, and absent means something specific: this number is not an
   * aggregate of anything countable (a credit balance is a balance, not a
   * summary of rows). A card that HAS a basis and omits it is the case
   * this parameter exists to make awkward.
   */
  basis?: string;
  /**
   * Where the records behind the number live.
   *
   * THE POINT OF THE WHOLE SECTION. A number you cannot open is a number
   * you have to trust; a number you can open is one you can check. The
   * destinations already existed — /dashboard/timeline takes ?range= and
   * ?module= and has since it was built — so this is a link, not a
   * feature.
   */
  href?: string;
  /** "See the entries" — the affordance on a card that links. */
  openLabel?: string;
  /**
   * Shown INSTEAD of the line when `trend` exists but is still all
   * zeroes — "fills in after 3 entries", or whatever the caller words it
   * as. Optional: a card that passes no trend at all (Most Active,
   * Credits Remaining) has no chart to stand in for and gets nothing.
   */
  placeholderLabel?: string;
}) {
  const chartData = trend?.map((count, i) => ({ i, count }));
  const hasTrend = chartData && chartData.length > 1 && chartData.some((d) => d.count > 0);

  // Reading order is label -> number -> trend, top to bottom, with the
  // icon parked top-right in its own tinted chip. The number is the
  // largest thing in the card because it is the thing being reported;
  // the label above it is a quiet caption, not a heading.
  // A LINK WHEN THERE IS SOMEWHERE TO GO, a plain box when there is not.
  // Not a button that navigates: a real <a> so it opens in a new tab,
  // shows its destination on hover and reaches the keyboard for free.
  const Shell = href ? Link : "div";
  const shellProps = href
    ? { href, className: "glass-card group relative block overflow-hidden rounded-2xl p-4 transition-colors duration-150 hover:border-orange-500/40" }
    : { className: "glass-card relative overflow-hidden rounded-2xl p-4" };

  return (
    <Shell {...(shellProps as { href: string; className: string })}>
      <div className="relative z-[1] flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-wider text-muted">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-bold leading-none text-foreground sm:text-[1.75rem]">
            <CountUpValue value={value} />
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/25 to-purple-500/20 text-orange-300 ring-1 ring-inset ring-white/10">
          {icon}
        </span>
      </div>
      {/* NEVER AN EMPTY CHART, AND NEVER A MISSING ONE EITHER — V4.6 #5.
          An all-zero series used to render nothing at all, so the card
          silently changed height between an account with data and one
          without, and a new user was never told the space would ever
          fill. This is the same 32px slot holding a flat, dimmed
          placeholder curve and a sentence saying what fills it.

          The placeholder is deliberately NOT the real dataKey and not the
          accent colour: it must not be mistakable for a reading of zero.
          aria-hidden because the sentence beside it already says the
          thing a screen reader needs. */}
      {!hasTrend && placeholderLabel && chartData && (
        <div className="relative z-[1] mt-3 h-8 w-full">
          <div
            className="absolute inset-x-0 top-1/2 h-px bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.14)_0_6px,transparent_6px_12px)]"
            aria-hidden="true"
          />
          <p className="absolute inset-x-0 bottom-0 truncate text-[10px] leading-none text-muted">
            {placeholderLabel}
          </p>
        </div>
      )}
      {hasTrend && (
        <div className="relative z-[1] mt-3 h-8 w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line
                type="monotone"
                dataKey="count"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                // recharts' own animation is left off and the draw-in is
                // done in CSS instead (globals.css .draw-line), so it
                // obeys the app's reduce-motion switch like everything
                // else — recharts has no notion of that setting.
                isAnimationActive={false}
                className="draw-line"
                pathLength={1}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* THE LINE THE BRIEF ASKED FOR, under the number rather than in a
          tooltip: a hover is not available on a phone and is not there
          when somebody is reading rather than pointing. */}
      <p className="relative z-[1] mt-2 text-[11px] leading-snug text-muted">{explain}</p>
      {basis && (
        <p className="relative z-[1] mt-0.5 text-[10px] leading-none text-muted/70">{basis}</p>
      )}
      {href && (
        <span className="relative z-[1] mt-1.5 block text-[10px] font-medium text-muted transition-colors duration-150 group-hover:text-orange-300">
          {openLabel}
        </span>
      )}
    </Shell>
  );
}

// Counts the numeric part of an already-formatted stat up from zero on
// mount. Values with no leading integer ("Ideas", "—", "n/a") render
// verbatim — splitLeadingNumber returns null for those, and the hook is
// still called unconditionally above it to keep hook order stable.
function CountUpValue({ value }: { value: string }) {
  const locale = useLocale();
  const parts = splitLeadingNumber(value);
  const animated = useCountUp(parts?.number ?? 0);
  // Pulses when the number MOVES, not when the page loads — the count-up
  // above already covers arrival. The key is what makes a CSS animation
  // replay on the second and third change rather than only the first.
  const pulseKey = usePulseOnChange(value);
  if (!parts) return <>{value}</>;
  return (
    <span key={pulseKey} className={pulseKey > 0 ? "stat-pulse" : undefined}>
      {parts.prefix}
      {formatNumber(animated, locale)}
      {parts.suffix}
    </span>
  );
}
