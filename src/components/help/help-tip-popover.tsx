"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { HelpCircle, ArrowRight, Languages } from "lucide-react";

// The contextual "?" — the panel half.
//
// It renders ONE paragraph, not the article. A popover that reproduces a
// four-paragraph answer is a page in a box: it covers what the reader was
// looking at, and they have to dismiss it to use the thing it was
// explaining. One paragraph plus a way to the full answer is the shape.
//
// The button only exists when there is something to show — that decision
// is made on the server, in help-tip.tsx, before this renders. There is no
// state here where the "?" is visible and the panel is empty.

export function HelpTipPopover({
  slug,
  title,
  paragraph,
  href,
  label,
  readMore,
  fallbackNotice,
  contentLocale,
}: {
  slug: string;
  title: string;
  paragraph: string;
  href: string | null;
  label: string;
  readMore: string;
  /** Set only when the paragraph is the English stand-in. */
  fallbackNotice: string | null;
  /** The language the paragraph is actually in, for lang=. */
  contentLocale: string | null;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        // Focus goes back to the button rather than to the top of the
        // document — a keyboard user who opened this is still reading the
        // field it belongs to.
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex align-middle">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // 24px of hit area around a 12px glyph: the minimum that is
        // reliably tappable on a phone without the icon looking heavy.
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted/70 transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60"
      >
        <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>

      {open && (
        <span
          id={panelId}
          role="dialog"
          aria-label={title}
          // max-w-[min(20rem,calc(100vw-2rem))]: at 375px the panel stops
          // at the viewport edge instead of forcing the page to scroll
          // sideways, which is what a fixed 20rem does inside a form field
          // near the right margin.
          className="absolute left-1/2 top-full z-50 mt-1.5 w-[min(20rem,calc(100vw-2rem))] max-w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-border bg-panel p-3 text-left shadow-xl"
        >
          <span className="block text-xs font-semibold text-foreground">{title}</span>

          {fallbackNotice && (
            <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-muted/70">
              <Languages className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              {fallbackNotice}
            </span>
          )}

          <span
            lang={contentLocale ?? undefined}
            className="mt-1.5 block text-xs leading-relaxed text-muted"
          >
            {paragraph}
          </span>

          <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href={`/help#${slug}`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-400 transition-colors duration-150 hover:text-orange-300"
            >
              {readMore}
              <ArrowRight className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            </Link>
            {href && (
              <Link
                href={href}
                className="text-[11px] font-medium text-muted transition-colors duration-150 hover:text-foreground"
              >
                {href}
              </Link>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
