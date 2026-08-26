import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { safeFilename } from "@/lib/pdf/blocks";

/**
 * One place that turns a PdfDocument into an HTTP response.
 *
 * The fonts are registered here rather than in each route, so a route cannot
 * ship without them — `registerPdfFonts` throws if a face is missing from
 * the deployment rather than rendering a document with the wrong glyphs in
 * it. See src/lib/pdf/fonts.ts for why a wrong glyph is worse than an error.
 */
export async function pdfResponse(
  element: ReactElement,
  options: { filename: string; fallbackName: string }
): Promise<NextResponse> {
  registerPdfFonts();
  const buffer = await renderToBuffer(element);
  const name = `${safeFilename(options.filename, options.fallbackName)}.pdf`;
  // `new Uint8Array(...)` rather than the Buffer: a Node Buffer is not a
  // BodyInit under this TypeScript lib, and passing it compiles only because
  // of a cast that would hide a real change in the runtime's contract.
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      // A downloaded document is per-user and freshly rendered. Anything
      // cached here is one user's document served to the next one.
      "Cache-Control": "private, no-store",
      "Content-Length": String(buffer.length),
    },
  });
}
