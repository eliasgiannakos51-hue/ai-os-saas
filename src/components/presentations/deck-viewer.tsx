"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SlideView } from "@/components/presentations/slide-view";
import type { Slide } from "@/lib/presentations/slides";

/**
 * Read-only deck viewer — what someone sent a share link actually sees.
 *
 * Keyboard navigation is the feature, not a nicety: this is the surface
 * a person uses while standing in front of a room, and reaching for a
 * mouse between slides is the thing that makes a deck viewer unusable
 * for the one job a deck has.
 */
export function DeckViewer({
  slides,
  themeId,
  labels,
}: {
  slides: Slide[];
  themeId: string;
  labels: { previous: string; next: string; position: string };
}) {
  const [index, setIndex] = useState(0);

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => Math.min(slides.length - 1, Math.max(0, current + delta)));
    },
    [slides.length]
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Space and Enter are deliberately not bound: they activate
      // whatever control has focus, and stealing them means the
      // navigation buttons below stop working from the keyboard.
      if (event.key === "ArrowRight" || event.key === "PageDown") go(1);
      else if (event.key === "ArrowLeft" || event.key === "PageUp") go(-1);
      else if (event.key === "Home") setIndex(0);
      else if (event.key === "End") setIndex(slides.length - 1);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, slides.length]);

  const slide = slides[index];
  if (!slide) return null;

  return (
    <div className="space-y-3">
      <SlideView slide={slide} themeId={themeId} className="rounded-xl border border-border" />

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label={labels.previous}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <span className="text-xs text-muted" aria-live="polite">
          {labels.position.replace("{n}", String(index + 1)).replace("{total}", String(slides.length))}
        </span>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => go(1)}
          disabled={index === slides.length - 1}
          aria-label={labels.next}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
