"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fades content in as it scrolls into view.
 *
 * The hidden state is applied by the observer, not by the server-rendered
 * markup. That ordering is the whole safety property: if JS never runs,
 * `data-reveal` is never set, the CSS rule never matches, and the content
 * is simply visible. A CSS-first "start invisible, JS reveals it" would
 * leave the page blank on any JS failure.
 *
 * Elements already on screen at mount are revealed on the observer's very
 * first callback, so above-the-fold content does not visibly fade in on
 * every page load — it is just there.
 */
export function Reveal({
  children,
  className = "",
  /** Extra delay in ms, for staggering sibling blocks. */
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No IntersectionObserver (or reduced motion) — show it and stop.
    const reduced =
      document.documentElement.getAttribute("data-motion") === "reduce" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") return;

    node.setAttribute("data-reveal", "pending");
    if (delay) node.style.transitionDelay = `${delay}ms`;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-reveal", "shown");
          // One-shot: re-animating on every scroll-by is motion for its
          // own sake, and it makes long pages feel unstable.
          observer.unobserve(entry.target);
        }
      },
      // A small negative bottom margin means the reveal fires just after
      // the element's top edge is genuinely on screen, not the instant a
      // single pixel of it appears.
      { rootMargin: "0px 0px -40px 0px", threshold: 0.01 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [delay]);

  return (
    // @ts-expect-error -- ref type varies with the chosen tag; all three
    // are HTMLElement, which is what the effect above needs.
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
