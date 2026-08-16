"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { HelpCircle, X, Check, Ban } from "lucide-react";

/**
 * The "?" beside a page title.
 *
 * A POPOVER, NOT A TOOLTIP, and the distinction is the whole design.
 * components/ui/tooltip.tsx already exists and is the right thing for a
 * sidebar hint: a few words, on hover, gone when you move away. This
 * holds three paragraphs, one of which is the thing the user most needs
 * to read, so it has to survive the pointer moving, be reachable on a
 * phone where there is no hover at all, and be dismissible on purpose
 * rather than by accident. That is a popover: opened by a press, closed
 * by Escape, by a press outside, or by its own close button.
 *
 * WHAT IT SAYS, IN THIS ORDER: what the page is, what it does, and what
 * it does NOT do. The third is why the component exists — see
 * lib/help-tips.ts, where every entry records the specific wrong
 * assumption its `doesNot` is there to correct.
 */
export function HelpTip({ helpKey }: { helpKey: string }) {
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  // Escape and outside-press both close. Bound only while open, so the
  // page carries no listeners for a panel nobody has opened.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Focus goes back to the control that opened it, or a keyboard user
      // is left at the top of the document with no idea where they were.
      buttonRef.current?.focus();
    }
    function onPointer(event: PointerEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // An icon button's only text for a screen reader. Translated, like
        // every other one in this app (i18n-coverage.test.mjs holds
        // aria-label literals at zero).
        aria-label={tCommon("whatIsThisPage")}
        data-testid={`help-tip-${helpKey.split(".").pop()}`}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 focus-visible:border-orange-500 focus-visible:text-orange-400"
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <>
          {/* Phone only. The panel below is a centred sheet at that size,
              and a floating card over live content with nothing behind it
              reads as a glitch. Closes on press, like everything else. */}
          <span
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
          />
          <div
            id={panelId}
            role="dialog"
            aria-label={tCommon("whatIsThisPage")}
            // TWO POSITIONS, and the small one is not a nicety.
            //
            // Anchoring a 320px panel to an icon that sits beside a page
            // title does not fit on a 375px screen: centre it on the
            // button and it runs off one edge, and the whole page starts
            // scrolling sideways. Measured, not reasoned about — the first
            // version of this line clamped the width with
            // `calc(100vw-2rem)`, which is not valid CSS (calc needs
            // spaces around the minus, written `_-_` in a Tailwind
            // arbitrary value), so the declaration was dropped silently
            // and the panel took its natural width. A screenshot run
            // reported document.scrollWidth > clientWidth at 375 and that
            // is how it was caught.
            //
            // So below `sm` it is a centred sheet pinned to both edges,
            // which cannot overflow by construction; from `sm` up it goes
            // back to hanging under the button, where there is room.
            className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-2xl border border-border bg-panel p-4 text-left shadow-[0_12px_40px_rgba(0,0,0,0.45)] sm:absolute sm:inset-x-auto sm:left-1/2 sm:top-9 sm:z-40 sm:w-80 sm:-translate-x-1/2 sm:translate-y-0"
          >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
            aria-label={tCommon("close")}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <p className="pr-7 text-sm font-semibold leading-snug text-foreground">
            {t(`${helpKey}.is`)}
          </p>

          <p className="mt-3 flex gap-2 text-xs leading-relaxed text-muted">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>{t(`${helpKey}.does`)}</span>
          </p>

          {/* The line the page is here for. Marked differently from the
              one above it on purpose: a limit that reads like a feature
              gets skimmed past, which is how somebody ends up expecting a
              domain they were never going to get. */}
          <p className="mt-2 flex gap-2 text-xs leading-relaxed text-muted">
            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400/80" aria-hidden="true" />
            <span>{t(`${helpKey}.doesNot`)}</span>
            </p>
          </div>
        </>
      )}
    </span>
  );
}
