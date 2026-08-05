"use client";

import { useMemo } from "react";

// Between 8 and 12 — enough for the field to read as a field rather than
// a few stray marks, few enough that it never becomes texture.
const DOT_COUNT = 10;

/**
 * Slow drifting dots behind page content.
 *
 * Deliberately NOT the globe (components/ui/network-field.tsx). That one
 * is a canvas animation with its own render loop and is left completely
 * alone; this is ten absolutely-positioned divs driven entirely by CSS,
 * cheap enough to sit under a scrolling dashboard.
 *
 * Positions and timings are derived from the index rather than
 * Math.random(), because a random layout would differ between the server
 * render and hydration and React would warn about the mismatch — and
 * because a fixed arrangement can be tuned, where a random one can only
 * be re-rolled.
 */
export function AmbientDots({ className = "" }: { className?: string }) {
  const dots = useMemo(
    () =>
      Array.from({ length: DOT_COUNT }, (_, i) => {
        // Golden-ratio stepping spreads the dots without them landing on
        // an obvious grid the way `i * 10%` would.
        const golden = 0.618033988749895;
        const left = ((i * golden) % 1) * 96 + 2;
        const top = ((i * golden * 2.3) % 1) * 92 + 4;
        const size = 3 + (i % 4);
        return {
          left: `${left.toFixed(2)}%`,
          top: `${top.toFixed(2)}%`,
          size,
          // Every dot gets its own distance, direction and period, so the
          // field never visibly repeats as a whole.
          dx: `${(i % 2 === 0 ? 1 : -1) * (12 + (i % 5) * 6)}px`,
          dy: `${(i % 3 === 0 ? -1 : 1) * (14 + (i % 4) * 7)}px`,
          dur: `${18 + (i % 7) * 3}s`,
          delay: `${-(i * 2.4).toFixed(1)}s`,
        };
      }),
    []
  );

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {dots.map((dot, i) => (
        <span
          key={i}
          className="ambient-dot"
          style={
            {
              left: dot.left,
              top: dot.top,
              width: dot.size,
              height: dot.size,
              "--dx": dot.dx,
              "--dy": dot.dy,
              "--dur": dot.dur,
              "--delay": dot.delay,
            } as React.CSSProperties
          }
        />
      ))}
      {/* The breathing glow. One soft pool of light, well off-centre so it
          reads as ambience rather than as a spotlight on the content. */}
      <div className="ambient-breathe absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-orange-500/[0.07] blur-3xl" />
      <div
        className="ambient-breathe absolute -left-20 bottom-1/4 h-64 w-64 rounded-full bg-orange-500/[0.05] blur-3xl"
        style={{ animationDelay: "-4.5s" }}
      />
    </div>
  );
}
