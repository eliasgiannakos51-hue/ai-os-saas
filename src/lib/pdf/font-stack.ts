/**
 * THE FONT STACK AS DATA, with nothing imported.
 *
 * Split out of fonts.ts so that the gate which checks it can load the REAL
 * constant instead of parsing the file with a regex. That is not tidiness:
 * a gate that re-derives a value from source text keeps passing after the
 * value changes underneath it, and this particular value changing silently
 * is the whole defect being guarded against. Measured — with the gate
 * parsing the text and the text then losing its Chinese face, every check
 * still passed.
 *
 * fonts.ts imports this and performs the registration. Nothing here has a
 * side effect, so scripts/tests/load-ts.mjs can import it as itself.
 */

/** The families, in the order @react-pdf must try them per character. */
export const FONT_STACK = ["Inter", "NotoSansSC", "NotoSansArabic"] as const;

/**
 * The value for every `fontFamily` in every PDF this app produces.
 *
 * A LIST, NOT A FAMILY. @react-pdf resolves a font per <Text> and does not
 * fall back on its own; given a family that lacks the character it draws
 * whatever glyph that id happens to be in the font it has. Measured: "华为"
 * set in Inter comes out as "N:" — not a blank box, not an error, just a
 * different word. In a file somebody downloads and sends on.
 *
 * WHY THESE THREE. Coverage was measured against every character of every
 * one of the ten locale files in messages/, not against a sample:
 *
 *   Inter alone         complete for de, el, en, es, fr, it, pt (7 of 10)
 *   + Noto Sans Arabic  adds ar
 *   + Noto Sans SC      adds ja and zh
 *   ------------------------------------------------------------------
 *   the three together  complete for all ten
 *
 * Noto Sans JP is NOT here: it covers Japanese but misses 266 of the
 * characters the Chinese locale uses, while Noto Sans SC covers both.
 */
export const PDF_FONT_FAMILY: string[] = [...FONT_STACK];

/**
 * THE STACK, ORDERED BY THE DOCUMENT'S OWN SCRIPT.
 *
 * THE SPACE IS IN EVERY FONT. @react-pdf resolves per character and takes
 * the FIRST family in the list that has a glyph, so with Inter at the front
 * every space in an Arabic paragraph is set in Inter — which cuts the line
 * into a separate shaping run at every word boundary. Arabic joins across
 * letters and the joining decisions are made per run, so the words come out
 * mis-shaped and the spacing between them is wrong.
 *
 * Measured against Chromium (HarfBuzz + the Unicode bidi algorithm) on
 * "معدل التسرب ثابت", comparing the ink in every column of pixels:
 *
 *     Inter first            0.666
 *     NotoSansArabic first   0.983
 *
 * A character-coverage check cannot see this: every character is present in
 * both renderings. Only the shapes and the spacing are wrong, which is
 * exactly what somebody reading the document would notice and no set
 * comparison would.
 *
 * Every stack still contains all three families, so coverage is unchanged
 * whatever the document turns out to contain — only which one is asked
 * first changes.
 */
export function pdfFontFamily(locale: string | null | undefined): string[] {
  const lang = String(locale ?? "")
    .slice(0, 2)
    .toLowerCase();
  if (lang === "ar" || lang === "fa" || lang === "ur" || lang === "he") {
    return ["NotoSansArabic", "NotoSansSC", "Inter"];
  }
  if (lang === "zh" || lang === "ja" || lang === "ko") {
    return ["NotoSansSC", "Inter", "NotoSansArabic"];
  }
  return [...FONT_STACK];
}

export type PdfFace = {
  family: string;
  file: string;
  weight: 400 | 700;
  style: "normal" | "italic";
};

/**
 * EVERY FAMILY IS REGISTERED AT EVERY WEIGHT AND STYLE THE DOCUMENT CAN ASK
 * FOR, even where that means pointing four entries at the same file.
 *
 * @react-pdf does not degrade a combination it was not given — it THROWS:
 *
 *     Error: Could not resolve font for Inter, fontWeight 400,
 *     fontStyle italic
 *
 * and the whole render dies, so one <i> in one paragraph turns the download
 * into a 500. It was found by rendering a document with emphasis in it,
 * which no check had done: an earlier comment in document.tsx claimed the
 * engine "resolves back to the regular one". It does not. That comment was
 * wrong and is corrected.
 *
 * Noto Sans SC and Noto Sans Arabic have no bold or italic cut at all, and
 * PDF has no synthetic slanting or emboldening the way a browser does. So
 * their four entries are the same file: emphasis in Chinese or Arabic is not
 * shown as a different shape, which is what those scripts do anyway — and
 * the alternative is not "no emphasis", it is no document.
 *
 * NO SUBSETTING STEP. @react-pdf subsets through fontkit at render time, so
 * the 10.05 MB Chinese face costs 3.4 KB in a four-character document and
 * 17.8 KB in an eighty-eight-character one. The fonttools pipeline planned
 * for this is unnecessary and is not here.
 */
export const PDF_FACES: PdfFace[] = [
  { family: "Inter", file: "Inter.ttf", weight: 400, style: "normal" },
  { family: "Inter", file: "Inter-Bold.ttf", weight: 700, style: "normal" },
  { family: "Inter", file: "Inter-Italic.ttf", weight: 400, style: "italic" },
  {
    family: "Inter",
    file: "Inter-BoldItalic.ttf",
    weight: 700,
    style: "italic",
  },
  {
    family: "NotoSansSC",
    file: "NotoSansSC.ttf",
    weight: 400,
    style: "normal",
  },
  {
    family: "NotoSansSC",
    file: "NotoSansSC.ttf",
    weight: 700,
    style: "normal",
  },
  {
    family: "NotoSansSC",
    file: "NotoSansSC.ttf",
    weight: 400,
    style: "italic",
  },
  {
    family: "NotoSansSC",
    file: "NotoSansSC.ttf",
    weight: 700,
    style: "italic",
  },
  {
    family: "NotoSansArabic",
    file: "NotoSansArabic.ttf",
    weight: 400,
    style: "normal",
  },
  {
    family: "NotoSansArabic",
    file: "NotoSansArabic.ttf",
    weight: 700,
    style: "normal",
  },
  {
    family: "NotoSansArabic",
    file: "NotoSansArabic.ttf",
    weight: 400,
    style: "italic",
  },
  {
    family: "NotoSansArabic",
    file: "NotoSansArabic.ttf",
    weight: 700,
    style: "italic",
  },
];

/** Every weight/style pair a document is allowed to ask for. */
export const PDF_WEIGHTS = [400, 700] as const;
export const PDF_STYLES = ["normal", "italic"] as const;

/** Where the faces live, relative to the repository (and to the function). */
export const PDF_FONT_DIR = "src/lib/pdf/fonts";
