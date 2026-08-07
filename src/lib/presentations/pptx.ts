import "server-only";
import { createZip, type ZipInput } from "@/lib/presentations/zip-write";
import { getTheme, type PresentationTheme } from "@/lib/presentations/themes";
import type { Slide } from "@/lib/presentations/slides";

/**
 * PPTX export, written by hand.
 *
 * A .pptx is a ZIP of OOXML parts. Writing them directly rather than
 * taking a dependency is the same call this repo made for reading PDFs
 * and ZIPs in Task 4, and for the same reason: the alternative is a large
 * third-party document library running in a process that holds a
 * service-role key, to produce one fixed shape of file.
 *
 * WHAT MAKES THIS DIFFERENT FROM A "GOOD ENOUGH" EXPORT. Every shape is
 * positioned absolutely and carries its own colours and fonts. Nothing
 * inherits from a placeholder. That is more XML per slide, and it is the
 * reason the exported file looks like what was on screen: placeholder
 * inheritance is resolved by PowerPoint against ITS defaults, so a deck
 * built on inherited styling renders in Calibri black-on-white on the
 * reviewer's machine no matter what theme the user picked.
 *
 * Anything that cannot be honoured is DROPPED, never approximated — a
 * photo that would not download is left out and the slide keeps its
 * layout, rather than the export failing or a broken-image box shipping
 * to someone's board meeting.
 */

// 16:9 at 13.333in x 7.5in, in EMU (914,400 per inch). This is the size
// PowerPoint itself defaults to; a deck authored at 4:3 opens letterboxed
// on every modern screen.
const SLIDE_W = 12192000;
const SLIDE_H = 6858000;

const MARGIN = 685800; // 0.75in
const CONTENT_W = SLIDE_W - MARGIN * 2;

const TITLE_Y = 685800;
const TITLE_H = 1300000;
const BODY_Y = 2160000;
const BODY_H = SLIDE_H - BODY_Y - MARGIN;

/** Hundredths of a point, which is how DrawingML sizes text. */
const SZ_DECK_TITLE = 4400;
const SZ_SECTION = 4000;
const SZ_TITLE = 3200;
const SZ_BODY = 2000;
const SZ_QUOTE = 2800;
const SZ_SMALL = 1400;

export function escapeXml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// ---------------------------------------------------------------------
// Image dimensions.
// ---------------------------------------------------------------------

/**
 * Read the pixel dimensions out of a PNG or JPEG header.
 *
 * Needed for one reason: a picture stretched to a box of a different
 * aspect ratio is visibly squashed, and "visibly squashed" in a deck
 * someone presents is worse than no picture. Knowing the real dimensions
 * lets the writer emit a centre crop (srcRect) so the image COVERS its
 * box the way `object-fit: cover` does on screen — which is what the
 * on-screen renderer is doing, so the two agree.
 *
 * Returns null for anything it does not positively recognise, and the
 * caller then skips that image entirely. Guessing dimensions would
 * produce exactly the distortion this exists to avoid.
 */
export function imageSize(buf: Buffer): { width: number; height: number; type: "png" | "jpeg" } | null {
  if (buf.length < 24) return null;

  // PNG: 8-byte signature, then IHDR whose width/height are at fixed
  // offsets 16 and 20.
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf.toString("ascii", 12, 16) === "IHDR"
  ) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width > 0 && height > 0) return { width, height, type: "png" };
    return null;
  }

  // JPEG: walk the marker chain to the frame header (SOF0..SOF15, minus
  // the four that are not frame headers), which carries the dimensions.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      // Standalone markers with no length field.
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      const length = buf.readUInt16BE(offset + 2);
      if (length < 2) return null;
      const isFrameHeader =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrameHeader) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        if (width > 0 && height > 0) return { width, height, type: "jpeg" };
        return null;
      }
      offset += 2 + length;
    }
  }

  return null;
}

/**
 * Centre-crop rectangle, as the percentages-in-thousandths DrawingML
 * wants, so an image of `natural` proportions fills a box of `box`
 * proportions without distortion.
 */
export function coverSrcRect(
  natural: { width: number; height: number },
  box: { width: number; height: number }
): { l: number; t: number; r: number; b: number } {
  const naturalRatio = natural.width / natural.height;
  const boxRatio = box.width / box.height;
  if (!Number.isFinite(naturalRatio) || !Number.isFinite(boxRatio) || naturalRatio <= 0 || boxRatio <= 0) {
    return { l: 0, t: 0, r: 0, b: 0 };
  }

  if (naturalRatio > boxRatio) {
    // Too wide: trim the sides.
    const keep = boxRatio / naturalRatio;
    const trim = Math.round(((1 - keep) / 2) * 100000);
    return { l: trim, t: 0, r: trim, b: 0 };
  }
  // Too tall: trim top and bottom.
  const keep = naturalRatio / boxRatio;
  const trim = Math.round(((1 - keep) / 2) * 100000);
  return { l: 0, t: trim, r: 0, b: trim };
}

// ---------------------------------------------------------------------
// Shape builders.
// ---------------------------------------------------------------------

type Box = { x: number; y: number; cx: number; cy: number };

type ParagraphOptions = {
  size: number;
  color: string;
  font: string;
  bold?: boolean;
  italic?: boolean;
  bullet?: boolean;
  align?: "l" | "ctr" | "r";
  spaceAfter?: number;
};

function paragraph(text: string, o: ParagraphOptions): string {
  const props: string[] = [];
  if (o.bullet) {
    props.push('marL="285750" indent="-285750"');
  }
  if (o.align && o.align !== "l") props.push(`algn="${o.align}"`);

  const inner: string[] = [];
  if (o.spaceAfter) inner.push(`<a:spcAft><a:spcPts val="${o.spaceAfter}"/></a:spcAft>`);
  inner.push(
    o.bullet
      ? `<a:buClr><a:srgbClr val="${o.color}"/></a:buClr><a:buChar char="•"/>`
      : "<a:buNone/>"
  );

  const rPr = `<a:rPr lang="en-US" sz="${o.size}" b="${o.bold ? 1 : 0}" i="${o.italic ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${o.color}"/></a:solidFill><a:latin typeface="${escapeXml(o.font)}"/><a:cs typeface="${escapeXml(o.font)}"/></a:rPr>`;

  return `<a:p><a:pPr ${props.join(" ")}>${inner.join("")}</a:pPr><a:r>${rPr}<a:t>${escapeXml(text)}</a:t></a:r></a:p>`;
}

function textBox(id: number, name: string, box: Box, paragraphs: string[], anchor = "t"): string {
  // normAutofit lets PowerPoint shrink text that overruns its box rather
  // than letting it spill off the slide. The generator already caps
  // lengths (lib/presentations/slides.ts), so this is the second line of
  // defence for the case where a long word in a narrow column wraps
  // worse than the character count predicted.
  return [
    "<p:sp>",
    `<p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`,
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`,
    `<p:txBody><a:bodyPr wrap="square" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs.join("")}</p:txBody>`,
    "</p:sp>",
  ].join("");
}

function rect(id: number, name: string, box: Box, fill: string): string {
  return [
    "<p:sp>",
    `<p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`,
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>`,
    "<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>",
    "</p:sp>",
  ].join("");
}

function picture(id: number, relId: string, box: Box, crop: { l: number; t: number; r: number; b: number }): string {
  return [
    "<p:pic>",
    `<p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`,
    `<p:blipFill><a:blip r:embed="${relId}"/><a:srcRect l="${crop.l}" t="${crop.t}" r="${crop.r}" b="${crop.b}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`,
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>`,
    "</p:pic>",
  ].join("");
}

// ---------------------------------------------------------------------
// One slide.
// ---------------------------------------------------------------------

export type SlideImage = { relId: string; width: number; height: number };

/**
 * The body of one slide's spTree.
 *
 * `image` is the already-embedded picture for this slide, or null — the
 * caller resolves that, because whether a download succeeded is not
 * something a pure XML builder should be deciding. Every image layout
 * degrades to its text-only equivalent when it is null, which is why
 * this function never needs to fail.
 */
export function slideShapes(slide: Slide, theme: PresentationTheme, image: SlideImage | null): string {
  const c = theme.colors;
  const headFont = theme.fonts.headingOffice;
  const bodyFont = theme.fonts.bodyOffice;
  const shapes: string[] = [];
  let id = 2; // 1 is the spTree's own group shape.

  const bullets = (box: Box, items: string[], size = SZ_BODY) =>
    textBox(
      id++,
      "Bullets",
      box,
      items.map((b) =>
        paragraph(b, { size, color: c.body, font: bodyFont, bullet: true, spaceAfter: 800 })
      )
    );

  switch (slide.layout) {
    case "title": {
      shapes.push(
        rect(id++, "Accent bar", { x: MARGIN, y: 2400000, cx: 1600000, cy: 60000 }, c.accent)
      );
      shapes.push(
        textBox(
          id++,
          "Deck title",
          { x: MARGIN, y: 2700000, cx: CONTENT_W, cy: 2000000 },
          [
            paragraph(slide.title, {
              size: SZ_DECK_TITLE,
              color: c.heading,
              font: headFont,
              bold: true,
            }),
            ...slide.bullets
              .slice(0, 1)
              .map((b) => paragraph(b, { size: SZ_BODY, color: c.muted, font: bodyFont })),
          ]
        )
      );
      break;
    }

    case "section": {
      // The one layout that repaints the whole slide. `boldSections` is
      // false for Minimal, whose restraint is the entire theme — a
      // full-bleed colour band would make it a different one.
      if (theme.boldSections) {
        shapes.push(rect(id++, "Section band", { x: 0, y: 0, cx: SLIDE_W, cy: SLIDE_H }, c.accent));
        shapes.push(
          textBox(
            id++,
            "Section title",
            { x: MARGIN, y: 2700000, cx: CONTENT_W, cy: 1600000 },
            [paragraph(slide.title, { size: SZ_SECTION, color: c.accentText, font: headFont, bold: true })]
          )
        );
      } else {
        shapes.push(rect(id++, "Rule", { x: MARGIN, y: 3300000, cx: 1200000, cy: 30000 }, c.accent));
        shapes.push(
          textBox(
            id++,
            "Section title",
            { x: MARGIN, y: 3500000, cx: CONTENT_W, cy: 1600000 },
            [paragraph(slide.title, { size: SZ_SECTION, color: c.heading, font: headFont, bold: true })]
          )
        );
      }
      break;
    }

    case "quote": {
      shapes.push(
        rect(id++, "Quote panel", { x: MARGIN, y: 1800000, cx: CONTENT_W, cy: 3200000 }, c.surface)
      );
      shapes.push(
        rect(id++, "Quote rule", { x: MARGIN, y: 1800000, cx: 90000, cy: 3200000 }, c.accent)
      );
      shapes.push(
        textBox(
          id++,
          "Quote",
          { x: MARGIN + 600000, y: 2100000, cx: CONTENT_W - 1200000, cy: 2600000 },
          [
            paragraph(slide.bullets[0] ?? slide.title, {
              size: SZ_QUOTE,
              color: c.heading,
              font: headFont,
              italic: true,
            }),
            ...(slide.bullets[1]
              ? [
                  paragraph(`— ${slide.bullets[1]}`, {
                    size: SZ_SMALL,
                    color: c.muted,
                    font: bodyFont,
                  }),
                ]
              : []),
          ],
          "ctr"
        )
      );
      break;
    }

    case "image": {
      if (image) {
        const box = { x: 0, y: 0, cx: SLIDE_W, cy: 4400000 };
        shapes.push(
          picture(id++, image.relId, box, coverSrcRect(image, { width: box.cx, height: box.cy }))
        );
        shapes.push(
          textBox(
            id++,
            "Caption",
            { x: MARGIN, y: 4700000, cx: CONTENT_W, cy: 1600000 },
            [
              paragraph(slide.title, { size: SZ_TITLE, color: c.heading, font: headFont, bold: true }),
              ...slide.bullets
                .slice(0, 2)
                .map((b) => paragraph(b, { size: SZ_SMALL, color: c.muted, font: bodyFont })),
            ]
          )
        );
      } else {
        // No photo: this becomes a plain bullets slide rather than a
        // slide with a hole in it.
        shapes.push(
          textBox(id++, "Title", { x: MARGIN, y: TITLE_Y, cx: CONTENT_W, cy: TITLE_H }, [
            paragraph(slide.title, { size: SZ_TITLE, color: c.heading, font: headFont, bold: true }),
          ])
        );
        if (slide.bullets.length) {
          shapes.push(bullets({ x: MARGIN, y: BODY_Y, cx: CONTENT_W, cy: BODY_H }, slide.bullets));
        }
      }
      break;
    }

    case "image_bullets": {
      const textW = image ? CONTENT_W / 2 - 200000 : CONTENT_W;
      shapes.push(
        textBox(id++, "Title", { x: MARGIN, y: TITLE_Y, cx: CONTENT_W, cy: TITLE_H }, [
          paragraph(slide.title, { size: SZ_TITLE, color: c.heading, font: headFont, bold: true }),
        ])
      );
      if (slide.bullets.length) {
        shapes.push(bullets({ x: MARGIN, y: BODY_Y, cx: textW, cy: BODY_H }, slide.bullets));
      }
      if (image) {
        const box = {
          x: MARGIN + CONTENT_W / 2 + 200000,
          y: BODY_Y,
          cx: CONTENT_W / 2 - 200000,
          cy: BODY_H,
        };
        shapes.push(
          picture(id++, image.relId, box, coverSrcRect(image, { width: box.cx, height: box.cy }))
        );
      }
      break;
    }

    case "two_column": {
      shapes.push(
        textBox(id++, "Title", { x: MARGIN, y: TITLE_Y, cx: CONTENT_W, cy: TITLE_H }, [
          paragraph(slide.title, { size: SZ_TITLE, color: c.heading, font: headFont, bold: true }),
        ])
      );
      const half = Math.ceil(slide.bullets.length / 2);
      const colW = CONTENT_W / 2 - 200000;
      shapes.push(bullets({ x: MARGIN, y: BODY_Y, cx: colW, cy: BODY_H }, slide.bullets.slice(0, half)));
      if (slide.bullets.length > half) {
        shapes.push(
          bullets(
            { x: MARGIN + CONTENT_W / 2 + 200000, y: BODY_Y, cx: colW, cy: BODY_H },
            slide.bullets.slice(half)
          )
        );
      }
      break;
    }

    case "closing": {
      shapes.push(rect(id++, "Accent bar", { x: MARGIN, y: 2400000, cx: 1600000, cy: 60000 }, c.accent));
      shapes.push(
        textBox(
          id++,
          "Closing",
          { x: MARGIN, y: 2700000, cx: CONTENT_W, cy: 2600000 },
          [
            paragraph(slide.title, { size: SZ_SECTION, color: c.heading, font: headFont, bold: true }),
            ...slide.bullets.map((b) =>
              paragraph(b, { size: SZ_BODY, color: c.body, font: bodyFont, spaceAfter: 600 })
            ),
          ]
        )
      );
      break;
    }

    case "bullets":
    default: {
      shapes.push(rect(id++, "Title rule", { x: MARGIN, y: TITLE_Y + TITLE_H - 120000, cx: 900000, cy: 40000 }, c.accent));
      shapes.push(
        textBox(id++, "Title", { x: MARGIN, y: TITLE_Y, cx: CONTENT_W, cy: TITLE_H }, [
          paragraph(slide.title, { size: SZ_TITLE, color: c.heading, font: headFont, bold: true }),
        ])
      );
      if (slide.bullets.length) {
        shapes.push(bullets({ x: MARGIN, y: BODY_Y, cx: CONTENT_W, cy: BODY_H }, slide.bullets));
      }
      break;
    }
  }

  return shapes.join("");
}

function slideXml(slide: Slide, theme: PresentationTheme, image: SlideImage | null): string {
  return (
    XML_DECL +
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    "<p:cSld>" +
    // The background is painted per slide rather than inherited from the
    // master, because a section slide overrides it and an inherited
    // background cannot be overridden per slide without a bgPr anyway.
    `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${theme.colors.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` +
    '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    slideShapes(slide, theme, image) +
    "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"
  );
}

function notesSlideXml(notes: string): string {
  return (
    XML_DECL +
    '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
    '<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>' +
    `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXml(notes)}</a:t></a:r></a:p>` +
    "</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>"
  );
}

// ---------------------------------------------------------------------
// The fixed parts.
// ---------------------------------------------------------------------

function themeXml(theme: PresentationTheme): string {
  const c = theme.colors;
  // Three fills, three lines, three effects and three background fills
  // are not padding — the schema requires exactly three of each, and
  // PowerPoint rejects a theme part with fewer.
  const fillStyles =
    "<a:fillStyleLst>" +
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) +
    "</a:fillStyleLst>";
  const lineStyles =
    "<a:lnStyleLst>" +
    '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>'.repeat(
      3
    ) +
    "</a:lnStyleLst>";
  const effectStyles = "<a:effectStyleLst>" + "<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3) + "</a:effectStyleLst>";
  const bgStyles =
    "<a:bgFillStyleLst>" + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) + "</a:bgFillStyleLst>";

  return (
    XML_DECL +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Ionexa">' +
    "<a:themeElements>" +
    "<a:clrScheme name=\"Ionexa\">" +
    `<a:dk1><a:srgbClr val="${c.heading}"/></a:dk1><a:lt1><a:srgbClr val="${c.background}"/></a:lt1>` +
    `<a:dk2><a:srgbClr val="${c.body}"/></a:dk2><a:lt2><a:srgbClr val="${c.surface}"/></a:lt2>` +
    `<a:accent1><a:srgbClr val="${c.accent}"/></a:accent1><a:accent2><a:srgbClr val="${c.accent}"/></a:accent2>` +
    `<a:accent3><a:srgbClr val="${c.muted}"/></a:accent3><a:accent4><a:srgbClr val="${c.accent}"/></a:accent4>` +
    `<a:accent5><a:srgbClr val="${c.muted}"/></a:accent5><a:accent6><a:srgbClr val="${c.accent}"/></a:accent6>` +
    `<a:hlink><a:srgbClr val="${c.accent}"/></a:hlink><a:folHlink><a:srgbClr val="${c.muted}"/></a:folHlink>` +
    "</a:clrScheme>" +
    `<a:fontScheme name="Ionexa"><a:majorFont><a:latin typeface="${escapeXml(theme.fonts.headingOffice)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${escapeXml(theme.fonts.bodyOffice)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="Ionexa">${fillStyles}${lineStyles}${effectStyles}${bgStyles}</a:fmtScheme>` +
    "</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>"
  );
}

function slideMasterXml(theme: PresentationTheme): string {
  return (
    XML_DECL +
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    "<p:cSld>" +
    `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${theme.colors.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` +
    '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    "</p:spTree></p:cSld>" +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    "</p:sldMaster>"
  );
}

const SLIDE_LAYOUT_XML =
  XML_DECL +
  '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">' +
  '<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
  "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>";

const NOTES_MASTER_XML =
  XML_DECL +
  '<p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
  '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
  '<p:spPr><a:xfrm><a:off x="685800" y="4114800"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
  "<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>" +
  "</p:spTree></p:cSld>" +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  "</p:notesMaster>";

function rels(entries: { id: string; type: string; target: string }[]): string {
  return (
    XML_DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    entries
      .map(
        (e) =>
          `<Relationship Id="${e.id}" Type="http://schemas.openxmlformats.org/${e.type}" Target="${escapeXml(e.target)}"/>`
      )
      .join("") +
    "</Relationships>"
  );
}

const REL_TYPES = {
  officeDocument: "officeDocument/2006/relationships/officeDocument",
  slideMaster: "officeDocument/2006/relationships/slideMaster",
  slideLayout: "officeDocument/2006/relationships/slideLayout",
  slide: "officeDocument/2006/relationships/slide",
  notesMaster: "officeDocument/2006/relationships/notesMaster",
  notesSlide: "officeDocument/2006/relationships/notesSlide",
  theme: "officeDocument/2006/relationships/theme",
  image: "officeDocument/2006/relationships/image",
} as const;

// ---------------------------------------------------------------------
// Assembly.
// ---------------------------------------------------------------------

export type PptxImage = { slideIndex: number; data: Buffer; width: number; height: number; ext: "jpeg" | "png" };

/**
 * Build the .pptx.
 *
 * `images` are already downloaded and already measured — this function
 * performs no I/O, which is what makes it testable without a network and
 * what keeps "the photo did not download" a decision the caller made
 * rather than an exception thrown from inside XML generation.
 */
export function buildPptx(params: {
  title: string;
  slides: Slide[];
  themeId: string;
  images: PptxImage[];
}): Buffer {
  const theme = getTheme(params.themeId);
  const slides = params.slides;

  const imageBySlide = new Map<number, PptxImage>();
  for (const image of params.images) imageBySlide.set(image.slideIndex, image);

  const parts: ZipInput[] = [];
  const add = (name: string, content: string | Buffer) =>
    parts.push({ name, data: typeof content === "string" ? Buffer.from(content, "utf8") : content });

  // ---- package-level -------------------------------------------------
  const overrides: string[] = [
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>',
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
  ];

  // ---- slides --------------------------------------------------------
  const presentationRels: { id: string; type: string; target: string }[] = [
    { id: "rId1", type: REL_TYPES.slideMaster, target: "slideMasters/slideMaster1.xml" },
  ];
  const slideIds: string[] = [];

  slides.forEach((slide, i) => {
    const n = i + 1;
    const relId = `rId${n + 1}`;
    presentationRels.push({ id: relId, type: REL_TYPES.slide, target: `slides/slide${n}.xml` });
    // p:sldId ids must be >= 256 and unique.
    slideIds.push(`<p:sldId id="${255 + n}" r:id="${relId}"/>`);

    const image = imageBySlide.get(i) ?? null;
    const slideRels: { id: string; type: string; target: string }[] = [
      { id: "rId1", type: REL_TYPES.slideLayout, target: "../slideLayouts/slideLayout1.xml" },
    ];

    let embedded: SlideImage | null = null;
    if (image) {
      const mediaName = `image${n}.${image.ext === "jpeg" ? "jpg" : "png"}`;
      add(`ppt/media/${mediaName}`, image.data);
      slideRels.push({ id: "rId3", type: REL_TYPES.image, target: `../media/${mediaName}` });
      embedded = { relId: "rId3", width: image.width, height: image.height };
    }

    const hasNotes = slide.speakerNotes.trim().length > 0;
    if (hasNotes) {
      slideRels.push({ id: "rId2", type: REL_TYPES.notesSlide, target: `../notesSlides/notesSlide${n}.xml` });
      add(`ppt/notesSlides/notesSlide${n}.xml`, notesSlideXml(slide.speakerNotes));
      add(
        `ppt/notesSlides/_rels/notesSlide${n}.xml.rels`,
        rels([
          { id: "rId1", type: REL_TYPES.notesMaster, target: "../notesMasters/notesMaster1.xml" },
          { id: "rId2", type: REL_TYPES.slide, target: `../slides/slide${n}.xml` },
        ])
      );
      overrides.push(
        `<Override PartName="/ppt/notesSlides/notesSlide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
      );
    }

    add(`ppt/slides/slide${n}.xml`, slideXml(slide, theme, embedded));
    add(`ppt/slides/_rels/slide${n}.xml.rels`, rels(slideRels));
    overrides.push(
      `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    );
  });

  const notesMasterRelId = `rId${slides.length + 2}`;
  presentationRels.push({
    id: notesMasterRelId,
    type: REL_TYPES.notesMaster,
    target: "notesMasters/notesMaster1.xml",
  });
  presentationRels.push({
    id: `rId${slides.length + 3}`,
    type: REL_TYPES.theme,
    target: "theme/theme1.xml",
  });

  // ---- presentation --------------------------------------------------
  add(
    "ppt/presentation.xml",
    XML_DECL +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRelId}"/></p:notesMasterIdLst>` +
      `<p:sldIdLst>${slideIds.join("")}</p:sldIdLst>` +
      `<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="6858000" cy="9144000"/>` +
      "</p:presentation>"
  );
  add("ppt/_rels/presentation.xml.rels", rels(presentationRels));

  add("ppt/slideMasters/slideMaster1.xml", slideMasterXml(theme));
  add(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    rels([
      { id: "rId1", type: REL_TYPES.slideLayout, target: "../slideLayouts/slideLayout1.xml" },
      { id: "rId2", type: REL_TYPES.theme, target: "../theme/theme1.xml" },
    ])
  );

  add("ppt/slideLayouts/slideLayout1.xml", SLIDE_LAYOUT_XML);
  add(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    rels([{ id: "rId1", type: REL_TYPES.slideMaster, target: "../slideMasters/slideMaster1.xml" }])
  );

  add("ppt/notesMasters/notesMaster1.xml", NOTES_MASTER_XML);
  add(
    "ppt/notesMasters/_rels/notesMaster1.xml.rels",
    rels([{ id: "rId1", type: REL_TYPES.theme, target: "../theme/theme1.xml" }])
  );

  add("ppt/theme/theme1.xml", themeXml(theme));

  add(
    "_rels/.rels",
    rels([{ id: "rId1", type: REL_TYPES.officeDocument, target: "ppt/presentation.xml" }])
  );

  // Content types last in construction, first in the archive: the OPC
  // spec requires [Content_Types].xml to be the first part, and some
  // readers enforce it.
  const contentTypes =
    XML_DECL +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="jpg" ContentType="image/jpeg"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    overrides.join("") +
    "</Types>";

  return createZip([{ name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") }, ...parts]);
}

/** A filesystem-safe name for the download, derived from the deck title.
 *  Falls back rather than producing an empty or dot-leading filename,
 *  either of which some browsers save as "download" with no extension. */
export function pptxFilename(title: string): string {
  const base = String(title ?? "")
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "presentation"}.pptx`;
}
