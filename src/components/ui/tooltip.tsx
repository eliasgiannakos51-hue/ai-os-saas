"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A real tooltip, because the browser's is not one.
//
// DEFECT this replaces: every sidebar hint was a plain `title` attribute.
// The reasoning at the time — no JS, no portal, screen readers already
// announce it — is all true, and it still failed the only test that
// matters: the user reported never seeing them.
//
// A native `title` tooltip:
//   - waits roughly 1-2s before appearing, with no way to change that
//   - is styled by the OS, so it looks nothing like the app
//   - never appears on touch at all
//   - never appears on keyboard focus
//   - vanishes after a few seconds whether or not you are still reading
//
// This shows in SHOW_DELAY_MS, follows the app's own styling, appears on
// focus as well as hover, and stays while the pointer stays.
//
// The `title` attribute is deliberately NOT kept alongside: two tooltips
// for one element means the OS one appears a second later, on top.

/** Fast enough to feel like part of the hover, slow enough not to flicker
 *  while the pointer is merely passing across a list. */
const SHOW_DELAY_MS = 120;
/** A short grace period so moving between adjacent rows doesn't strobe. */
const HIDE_DELAY_MS = 60;
const GAP_PX = 10;

export function Tooltip({
  content,
  children,
  side = "right",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "right" | "top";
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Portals need a DOM that exists; on the server it does not.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const clearTimers = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  }, []);

  const place = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Measure the CHILD, not the wrapper.
    //
    // The wrapper is `display: contents` so it adds nothing to layout —
    // which also means it generates no box at all, and its own
    // getBoundingClientRect() is all zeros. Measuring it put every tooltip
    // at (10, -15): off the top-left of the viewport, invisible. Caught by
    // asserting the rendered position rather than only that it appeared.
    const anchor = wrap.firstElementChild ?? wrap;
    const r = anchor.getBoundingClientRect();
    // A collapsed rect means the anchor is not laid out (hidden group,
    // not yet mounted). Showing a tooltip pinned to the corner is worse
    // than showing none.
    if (r.width === 0 && r.height === 0) return;
    const raw =
      side === "right"
        ? { top: r.top + r.height / 2, left: r.right + GAP_PX }
        : { top: r.top - GAP_PX, left: r.left + r.width / 2 };
    // Clamp into the viewport. A sidebar row near the bottom of a tall
    // list would otherwise anchor its tooltip past the fold.
    setPos({
      top: Math.min(Math.max(raw.top, GAP_PX), window.innerHeight - GAP_PX),
      left: Math.min(Math.max(raw.left, GAP_PX), window.innerWidth - GAP_PX),
    });
  }, [side]);

  const show = useCallback(() => {
    clearTimers();
    showTimer.current = setTimeout(() => {
      place();
      setOpen(true);
    }, SHOW_DELAY_MS);
  }, [clearTimers, place]);

  const hide = useCallback(() => {
    clearTimers();
    hideTimer.current = setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  }, [clearTimers]);

  // Escape closes it, matching every other transient surface in this app.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        clearTimers();
        setOpen(false);
      }
    }
    // A tooltip anchored to a scrolled-away element is worse than none.
    function onScrollOrResize() {
      clearTimers();
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!content) return <>{children}</>;

  return (
    <>
      <span
        ref={wrapRef}
        className="contents"
        onMouseEnter={show}
        onMouseLeave={hide}
        // Keyboard users get the same affordance — `title` never did.
        onFocusCapture={() => {
          place();
          setOpen(true);
        }}
        onBlurCapture={hide}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </span>
      {mounted &&
        open &&
        pos &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            data-tooltip
            style={{
              top: pos.top,
              left: pos.left,
              transform: side === "right" ? "translateY(-50%)" : "translate(-50%, -100%)",
            }}
            // pointer-events-none: the tooltip must never sit between the
            // pointer and the thing it describes.
            className="pointer-events-none fixed z-[100] max-w-[220px] rounded-lg border border-border bg-panel px-2.5 py-1.5 text-xs leading-snug text-foreground shadow-lg"
          >
            {content}
          </span>,
          document.body
        )}
    </>
  );
}
