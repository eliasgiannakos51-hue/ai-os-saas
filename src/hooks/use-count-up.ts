"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// useLayoutEffect on the client, useEffect on the server. React logs a
// warning if useLayoutEffect runs during SSR (it can't, there is no
// layout), and this hook needs the layout variant on the client — see
// the comment in useCountUp for why.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
  // Initial state is the TARGET, not zero, and that is deliberate: it is
  // the one value the server and the client's first render can both
  // produce. Seeding it from prefersReducedMotion() (as this did
  // originally) gave `target` on the server — where `window` is
  // undefined — and `0` on the client, so every animated stat hydrated
  // with mismatched text and React threw away the server HTML for the
  // whole subtree ("Text content does not match server-rendered HTML").
  const [value, setValue] = useState(target);
  const frameRef = useRef<number | null>(null);

  // Layout effect, not a passive one: this resets the display to 0 before
  // starting the count. A passive useEffect runs AFTER paint, so the user
  // would see the final number for one frame and then watch it snap back
  // to zero and climb again.
  useIsomorphicLayoutEffect(() => {
    if (!Number.isFinite(target) || target === 0 || prefersReducedMotion()) {
      setValue(target);
      return;
    }

    setValue(0);
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
  // Never called during SSR any more (the only caller is a client-side
  // layout effect), but kept safe for it regardless: with no window there
  // is no motion to reduce and no animation to run.
  if (typeof window === "undefined") return true;
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
