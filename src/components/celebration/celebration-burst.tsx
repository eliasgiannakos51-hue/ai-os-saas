"use client";

import { useEffect, useState } from "react";

// The app's celebration moment: a radial confetti spray plus an amber
// bloom, anchored to whatever element renders it. Fires when `trigger`
// flips from false to true.
//
// Hand-rolled instead of pulling in a confetti library — the whole effect
// is these 24 spans plus two keyframe blocks in globals.css, which is not
// worth a canvas-based dependency and a bundle hit.
//
// Positioning: the parent must be `position: relative`. This renders
// `absolute inset-0` with `pointer-events-none` so it can never intercept
// a click on the thing being celebrated — a burst that ate the next click
// would be worse than no burst.

const PIECE_COUNT = 24;

// Brand amber through gold, plus two greens for the "success" read. Fixed
// palette rather than random hues so the burst always looks like this
// product rather than like generic party confetti.
const COLORS = ["#fbbf24", "#f97316", "#fcd34d", "#ea580c", "#10b981", "#34d399"];

// Precomputed once at module load, not per render: the spray needs to be
// irregular (a perfectly even ring reads as a mechanical loading spinner,
// not a celebration) but it must also be IDENTICAL on the server and the
// first client render, or React hydration mismatches. Math.random() at
// render time would do exactly that. These offsets are deterministic —
// derived from the index — while still looking scattered.
const PIECES = Array.from({ length: PIECE_COUNT }, (_, i) => {
  const angle = (i / PIECE_COUNT) * Math.PI * 2 + (i % 3) * 0.22;
  const distance = 90 + ((i * 37) % 70);
  return {
    tx: `${Math.round(Math.cos(angle) * distance)}px`,
    // Biased upward (the -0.75 factor) so the spray launches up and then
    // falls, the way real confetti does, instead of expanding evenly.
    ty: `${Math.round(Math.sin(angle) * distance * 0.75 - 30)}px`,
    rot: `${((i * 97) % 2 === 0 ? 1 : -1) * (180 + ((i * 53) % 360))}deg`,
    dur: `${900 + ((i * 61) % 500)}ms`,
    color: COLORS[i % COLORS.length],
    // Alternating shapes — squares and circles mixed reads richer than
    // one uniform shape.
    round: i % 3 === 0,
  };
});

export function CelebrationBurst({
  trigger,
  onDone,
}: {
  trigger: boolean;
  onDone?: () => void;
}) {
  // `runId` (rather than a plain boolean) is what lets the burst replay:
  // it becomes the React key below, so a second trigger remounts every
  // piece and the CSS animations restart. Without it, a re-trigger would
  // do nothing, because a CSS animation only plays on mount.
  const [runId, setRunId] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!trigger) return;

    // Respect the app's own reduce-motion switch AND the OS-level one.
    // A confetti explosion is exactly the kind of thing someone with
    // vestibular sensitivity turns that setting on to avoid, and the
    // global CSS kill-switch can't help here — it would still mount 24
    // animated elements, just instantly.
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      onDone?.();
      return;
    }

    setRunId((n) => n + 1);
    setVisible(true);

    // Longest piece duration (900 + 499) plus a small margin.
    const timer = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 1600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  if (!visible) return null;

  return (
    <div
      key={runId}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 overflow-visible"
    >
      <span className="celebration-ring" />
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              backgroundColor: p.color,
              borderRadius: p.round ? "9999px" : "2px",
              "--tx": p.tx,
              "--ty": p.ty,
              "--rot": p.rot,
              "--dur": p.dur,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
