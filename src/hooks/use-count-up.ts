"use client";

import { useEffect, useRef, useState } from "react";

// Animates a number from 0 up to `target` over `durationMs`, driven by
// requestAnimationFrame rather than a setInterval tick — rAF is already
// synced to the display's refresh rate, so the count never renders a
// frame the browser is about to throw away, and it pauses automatically
// in a backgrounded tab.
//
// Returns the target immediately (no animation) when:
//   - the user asked for reduced motion, via our own data-motion="reduce"
//     attribute or the OS-level prefers-reduced-motion query. The global
//     CSS motion kill-switch can't help here, since this is a JS-driven
//     text change rather than a CSS animation — it has to be checked
//     explicitly.
//   - the target isn't a finite number (guards against NaN from a parsed
//     stat) or is 0, where counting up to zero is just a flicker.
const EASE_OUT_CUBIC = (t: number) => 1 - Math.pow(1 - t, 3);

export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target) || target === 0 || prefersReducedMotion()) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      setValue(Math.round(target * EASE_OUT_CUBIC(progress)));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs]);

  return value;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true; // SSR: render the final value
  if (document.documentElement.dataset.motion === "reduce") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Stat values in the UI are already-formatted strings ("12", "1.2k",
// "€48", "3 days"). Rather than forcing every caller to thread a raw
// number through, this splits off a leading integer so the numeric part
// can animate while any prefix/suffix stays put. Returns null when there
// is no leading integer to animate (e.g. "Ideas", "—"), which callers
// use as the "just render the string as-is" signal.
export function splitLeadingNumber(
  formatted: string
): { prefix: string; number: number; suffix: string } | null {
  // [\s\S] rather than the `s` (dotAll) flag — the tsconfig target
  // predates es2018, where that flag was introduced.
  const match = /^(\D*?)(\d[\d,.]*)([\s\S]*)$/.exec(formatted);
  if (!match) return null;
  const numeric = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) return null;
  return { prefix: match[1], number: numeric, suffix: match[3] };
}
