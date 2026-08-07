"use client";

import { SlideView } from "@/components/presentations/slide-view";
import type { Slide } from "@/lib/presentations/slides";

/**
 * The printable sheet: every slide, one per page, and nothing else.
 *
 * The visibility trick below is doing real work. This route sits under
 * /dashboard, so it inherits the dashboard layout — sidebar, header, the
 * lot — and none of that belongs in a PDF. `display: none` on the chrome
 * is not available (this component cannot reach its own ancestors), so
 * everything is hidden and only the print root is made visible again.
 * That is the one technique that works from INSIDE a layout it does not
 * control.
 *
 * `print-color-adjust: exact` is not cosmetic either: browsers strip
 * background colours when printing to save ink, which would render the
 * Dark theme as black text on white and the section slides — whose text
 * is the accent's paired colour — as invisible.
 */
export function PrintDeck({
  title,
  themeId,
  slides,
  printLabel,
  hint,
}: {
  title: string;
  themeId: string;
  slides: Slide[];
  printLabel: string;
  hint: string;
}) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@page { size: landscape; margin: 0; }

#print-root .print-slide {
  width: 100%;
  break-inside: avoid;
  page-break-inside: avoid;
}

@media screen {
  #print-root { max-width: 60rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  #print-root .print-slide { margin-bottom: 1rem; border: 1px solid rgb(255 255 255 / 0.1); border-radius: 0.5rem; overflow: hidden; }
}

@media print {
  body * { visibility: hidden; }
  #print-root, #print-root * { visibility: visible; }
  #print-root {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0;
    width: 100%;
  }
  .print-hide { display: none !important; }
  #print-root .print-slide {
    break-after: page;
    page-break-after: always;
    margin: 0;
    border: 0;
    border-radius: 0;
  }
  #print-root .print-slide:last-child { break-after: auto; page-break-after: auto; }
  .slide-surface {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`,
        }}
      />

      <div id="print-root">
        <div className="print-hide mb-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            {printLabel}
          </button>
          <p className="text-[11px] text-muted">{hint}</p>
        </div>

        {slides.map((slide) => (
          <div key={slide.id} className="print-slide">
            <SlideView slide={slide} themeId={themeId} />
          </div>
        ))}

        <h1 className="sr-only">{title}</h1>
      </div>
    </>
  );
}
