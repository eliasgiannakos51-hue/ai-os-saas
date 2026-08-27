import path from "node:path";
import { existsSync } from "node:fs";
import { Font } from "@react-pdf/renderer";
import { PDF_FACES, PDF_FONT_DIR } from "@/lib/pdf/font-stack";

export {
  FONT_STACK,
  PDF_FONT_FAMILY,
  PDF_FACES,
  PDF_FONT_DIR,
  PDF_WEIGHTS,
  PDF_STYLES,
  pdfFontFamily,
} from "@/lib/pdf/font-stack";

/**
 * Registering the faces — the side effect that font-stack.ts deliberately
 * does not have, so that the data can be loaded by a gate without pulling in
 * the PDF engine.
 */

const FONT_DIR = path.join(process.cwd(), PDF_FONT_DIR);

let registered = false;

/**
 * Registers the faces once per process.
 *
 * It THROWS rather than degrading if a face is missing from the deployment.
 * A PDF with the wrong glyphs in it is indistinguishable from a correct one
 * to whoever downloads it, so a font that failed to ship has to stop the
 * request, not quietly change what the document says.
 *
 * The fonts reach the serverless function through
 * `experimental.outputFileTracingIncludes` in next.config.mjs — nothing
 * imports them, so without that entry Next traces none of them and every PDF
 * route works in development and throws in production.
 */
export function registerPdfFonts(): void {
  if (registered) return;
  const missing = PDF_FACES.filter(
    (f) => !existsSync(path.join(FONT_DIR, f.file)),
  ).map((f) => f.file);
  if (missing.length > 0) {
    throw new Error(
      `PDF fonts missing from the deployment: ${missing.join(", ")} (looked in ${FONT_DIR}). ` +
        "Check experimental.outputFileTracingIncludes in next.config.mjs.",
    );
  }
  for (const face of PDF_FACES) {
    Font.register({
      family: face.family,
      src: path.join(FONT_DIR, face.file),
      fontWeight: face.weight,
      fontStyle: face.style,
    });
  }
  // Hyphenation off. @react-pdf hyphenates English by default and the same
  // callback runs over Arabic and Chinese, where breaking inside a word is
  // not a typographic choice but a mistake.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
