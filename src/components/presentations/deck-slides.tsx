"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { UNSPLASH_HOME_URL, withUnsplashUtm } from "@/lib/website-image-placeholders";
import type { Deck, Slide, SlideLayout } from "@/lib/presentations/deck";

/**
 * A DECK'S SLIDES, AS CARDS: number and layout, title, the photograph with
 * its Unsplash credit, the bullets and the speaker notes. One drawing for
 * the page (components/presentations/presentations-workspace.tsx) and for
 * Slides in the shell (components/presentations/presentations-shell.tsx).
 *
 * With `onSelect`, each slide is a BOX (package 4): its number and title
 * are pressed to choose it, and the next change touches only that slide.
 */
export function DeckSlides({
  deck,
  imageUrlFor,
  className = "",
  selected = null,
  onSelect,
}: {
  deck: Deck;
  imageUrlFor: (slide: Slide) => string | null;
  className?: string;
  selected?: number | null;
  onSelect?: (index: number) => void;
}) {
  const t = useTranslations("presentations");
  // Literal keys, so the message slicer can bound what this needs
  // (lib/i18n/message-slices.ts): a template-literal key is unbounded.
  const layouts: Record<SlideLayout, string> = {
    title: t("result.layout.title"),
    bullets: t("result.layout.bullets"),
    section: t("result.layout.section"),
    quote: t("result.layout.quote"),
    image: t("result.layout.image"),
  };
  return (
    <ol className={`grid gap-3 sm:grid-cols-2 ${className}`}>
      {deck.slides.map((slide, index) => {
        const url = imageUrlFor(slide);
        return (
          <li
            key={index}
            data-testid="slide-card"
            className={`rounded-card border bg-background p-4 ${selected === index ? "border-foreground" : "border-border"}`}
          >
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-pressed={selected === index}
                data-testid="slide-box"
                className="block min-h-[44px] w-full text-start"
              >
                <span className="block text-[11px] uppercase tracking-wide text-muted">
                  {index + 1} · {layouts[slide.layout]}
                </span>
                <span className="mt-1 block text-sm font-semibold text-foreground">{slide.title}</span>
              </button>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  {index + 1} · {layouts[slide.layout]}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-foreground">{slide.title}</h3>
              </>
            )}
            {url && (
              <figure className="mt-2">
                <Image
                  src={url}
                  alt={slide.imageQuery ?? slide.title}
                  width={640}
                  height={360}
                  unoptimized
                  className="h-36 w-full rounded-item object-cover"
                />
                {slide.image?.kind === "unsplash" && (
                  <figcaption className="mt-1 text-[10px] text-muted">
                    {t.rich("result.photoBy", {
                      name: slide.image.photographerName,
                      author: (chunks) => (
                        <a href={withUnsplashUtm((slide.image as { photographerUrl: string }).photographerUrl)} target="_blank" rel="noreferrer" className="underline">
                          {chunks}
                        </a>
                      ),
                      unsplash: (chunks) => (
                        <a href={UNSPLASH_HOME_URL} target="_blank" rel="noreferrer" className="underline">
                          {chunks}
                        </a>
                      ),
                    })}
                  </figcaption>
                )}
              </figure>
            )}
            {slide.bullets.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 ps-4 text-xs text-foreground">
                {slide.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
            {slide.notes && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] font-medium text-muted">{t("result.notes")}</summary>
                <p className="mt-1 text-xs text-muted">{slide.notes}</p>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
