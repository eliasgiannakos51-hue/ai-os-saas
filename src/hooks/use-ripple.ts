"use client";

import { useCallback, type MouseEvent as ReactMouseEvent } from "react";

/**
 * Click ripple, originating at the actual pointer position.
 *
 * The node is appended and removed directly rather than held in React
 * state: a ripple is transient decoration with no bearing on the
 * component's data, and routing it through a render would re-render the
 * button twice on every click for nothing.
 *
 * The host element needs `ripple-host` (position:relative + overflow:hidden).
 */
export function useRipple() {
  return useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const host = event.currentTarget;
    if (!host) return;

    const reduced =
      document.documentElement.getAttribute("data-motion") === "reduce" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const rect = host.getBoundingClientRect();
    // Diameter has to reach the furthest corner from the click, or the
    // ripple visibly stops short on a wide button.
    const size = Math.max(rect.width, rect.height) * 1.2;

    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

    host.appendChild(ripple);
    // animationend rather than a timeout, so a slow frame can't leave the
    // node behind — with a fallback removal in case the event is missed.
    const remove = () => ripple.remove();
    ripple.addEventListener("animationend", remove, { once: true });
    window.setTimeout(remove, 600);
  }, []);
}
