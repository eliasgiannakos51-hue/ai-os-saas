/**
 * Locales written right to left. Only Arabic, of the ten this app ships.
 *
 * Its own file, with no imports, because three renderers need the answer
 * — the A4 document (document.tsx), the slide PDF (deck.tsx) and the
 * .pptx exporter (lib/presentations/pptx.ts) — and the last two must not
 * pull the whole document renderer in to ask it: scripts/tests/load-ts.mjs
 * concatenates modules into one scope, so two renderers that each define
 * a `sheetFor` cannot be loaded together, and a gate that renders a deck
 * would fail on a name clash in a file it never called.
 */
const RTL_LOCALES = new Set(["ar", "fa", "he", "ur"]);

export function isRtlLocale(locale: string | null | undefined): boolean {
  return RTL_LOCALES.has(
    String(locale ?? "")
      .slice(0, 2)
      .toLowerCase(),
  );
}
