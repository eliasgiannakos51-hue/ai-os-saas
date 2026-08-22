/**
 * The globe, written out as an SVG document.
 *
 * SEPARATE FROM globe.ts ON PURPOSE. Only scripts/generate-icons.mjs,
 * scripts/generate-email-logo.mjs and the test that compares their output
 * call this; no browser does. Keeping it beside the geometry meant every
 * page that renders a loading state imported a string serialiser it never
 * runs, and relied on the bundler noticing. The geometry is the part the
 * client needs, and it is the only part it now gets.
 */
import { globeShapes, GLOBE_VIEW, type GlobeDetail } from "@/lib/brand/globe";

function fmt(value: number): string {
  // Trailing zeros make the generated SVG differ from a hand-written one
  // for no visual reason, and this file's output is byte-compared in a
  // test.
  return String(Math.round(value * 100) / 100);
}

export type GlobeSvgOptions = {
  /** Rendered pixel size; also the width/height attributes. */
  size: number;
  /** Stroke width for a `stroke: 1` shape, in viewBox units. Given per
   *  target rather than scaled from one source: a hairline that is right
   *  at 180px vanishes at 16px. */
  baseStroke: number;
  /** Brand ink. */
  ink: string;
  /** Painted behind the mark. `null` leaves it transparent. */
  background?: string | null;
  /** Corner radius on the background plate, in viewBox units. */
  radius?: number;
  detail?: GlobeDetail;
  /** Multiplier on the node's radius.
   *
   *  THE NODE DOES NOT SCALE LINEARLY WITH THE CANVAS, and leaving this
   *  out was a measured regression: rendered at 16px the mark went from
   *  a legible ringed planet to a dim smudge, because a 4.29-unit dot in
   *  a 100-unit box is 0.7 of a pixel there. The generator this replaced
   *  already knew — it grew the dot with the stroke scale — and dropping
   *  that was the one thing lost in unifying the four copies. Compared
   *  side by side at 16px before this existed; see prod-audit/. */
  nodeScale?: number;
  /** Emitted on the root <svg>; the .ico/.png generators do not want it. */
  xmlns?: boolean;
};

/**
 * One complete SVG document for the mark.
 *
 * Used by the icon and email-logo generators AND by the test that
 * compares them, so "the favicon is the same shape as the component" is
 * a checkable statement rather than a claim in a comment.
 */
export function globeSvg(options: GlobeSvgOptions): string {
  const { size, baseStroke, ink, background = null, radius = 0, detail = "mark", nodeScale = 1, xmlns = true } = options;
  const parts: string[] = [];
  if (background) {
    parts.push(
      `<rect x="0" y="0" width="${GLOBE_VIEW}" height="${GLOBE_VIEW}"${radius ? ` rx="${fmt(radius)}"` : ""} fill="${background}"/>`
    );
  }
  for (const shape of globeShapes(detail)) {
    const opacity = shape.opacity === 1 ? "" : ` opacity="${fmt(shape.opacity)}"`;
    if (shape.kind === "circle") {
      const r = shape.role === "node" ? shape.r * nodeScale : shape.r;
      parts.push(
        shape.stroke === null
          ? `<circle cx="${fmt(shape.cx)}" cy="${fmt(shape.cy)}" r="${fmt(r)}" fill="${ink}"${opacity}/>`
          : `<circle cx="${fmt(shape.cx)}" cy="${fmt(shape.cy)}" r="${fmt(r)}" fill="none" stroke="${ink}" stroke-width="${fmt(shape.stroke * baseStroke)}"${opacity}/>`
      );
    } else {
      const rotate = shape.rotate ? ` transform="rotate(${fmt(shape.rotate)} ${fmt(shape.cx)} ${fmt(shape.cy)})"` : "";
      parts.push(
        `<ellipse cx="${fmt(shape.cx)}" cy="${fmt(shape.cy)}" rx="${fmt(shape.rx)}" ry="${fmt(shape.ry)}" fill="none" stroke="${ink}" stroke-width="${fmt(shape.stroke * baseStroke)}"${rotate}${opacity}/>`
      );
    }
  }
  const ns = xmlns ? ` xmlns="http://www.w3.org/2000/svg"` : "";
  return (
    `<svg${ns} width="${size}" height="${size}" viewBox="0 0 ${GLOBE_VIEW} ${GLOBE_VIEW}">\n` +
    parts.map((p) => `  ${p}`).join("\n") +
    `\n</svg>\n`
  );
}
