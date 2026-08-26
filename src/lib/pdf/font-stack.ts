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

export type PdfFace = { family: string; file: string; weight: 400 | 700 };

/**
 * NO SUBSETTING STEP. @react-pdf subsets through fontkit at render time, so
 * the 10.05 MB Chinese face costs 3.4 KB in a four-character document and
 * 17.8 KB in an eighty-eight-character one. The fonttools pipeline planned
 * for this is unnecessary and is not here.
 */
export const PDF_FACES: PdfFace[] = [
  { family: "Inter", file: "Inter.ttf", weight: 400 },
  { family: "Inter", file: "Inter-Bold.ttf", weight: 700 },
  { family: "NotoSansSC", file: "NotoSansSC.ttf", weight: 400 },
  { family: "NotoSansArabic", file: "NotoSansArabic.ttf", weight: 400 },
];

/** Where the faces live, relative to the repository (and to the function). */
export const PDF_FONT_DIR = "src/lib/pdf/fonts";
