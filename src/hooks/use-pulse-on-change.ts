"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns a key that changes whenever `value` changes, for replaying a
 * one-shot CSS animation.
 *
 * A CSS animation only runs on mount or when the animation-name actually
 * changes, so re-rendering with the same class does nothing. Changing the
 * element's React key remounts it, which is what makes the pulse replay
 * on the second and third change rather than only the first.
 *
 * Returns 0 on the first render on purpose: a stat should not pulse just
 * because the page loaded. It pulses when the number MOVED.
 */
export function usePulseOnChange(value: number | string | null | undefined): number {
  const [pulseKey, setPulseKey] = useState(0);
  const previous = useRef(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      previous.current = value;
      return;
    }
    if (previous.current !== value) {
      previous.current = value;
      setPulseKey((n) => n + 1);
    }
  }, [value]);

  return pulseKey;
}
