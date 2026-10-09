import "server-only";
import PptxGenJS from "pptxgenjs";
import { isRtlLocale } from "@/lib/pdf/rtl";
import { UNSPLASH_HOME_URL, withUnsplashUtm } from "@/lib/website-image-placeholders";
import type { Deck, Slide, SlideChart } from "@/lib/presentations/deck";
import type { LoadedImage } from "@/lib/presentations/images";

/**
 * A DECK AS A .PPTX — editable text boxes, not pictures of slides.
 *
 * pptxgenjs writes real OOXML: every title and bullet below is a text
 * box the person can edit in PowerPoint, Keynote or LibreOffice, every
 * note is a real speaker note, every photo is a real picture object.
 * That is the whole reason the export exists — a deck this feature writes
 * is a first draft, and the finishing happens in the tool people already
 * own.
 *
 * NO FONT IS NAMED. PowerPoint substitutes per script from its own
 * tables and does it better than a name chosen here would — a deck in
 * Arabic opened on a machine without the named face would fall back
 * anyway, and to something worse than the default. (The PDF is the
 * opposite case: @react-pdf substitutes nothing, which is why
 * lib/pdf/font-stack.ts exists.)
 *
 * SIZES ARE INCHES on a 10 x 5.625 canvas (LAYOUT_16x9), and the PDF
 * exporter uses the same canvas in points (720 x 405) so the two
 * downloads lay out the same deck the same way.
 */
const W = 10;
const H = 5.625;
const MARGIN = 0.5;
const BG = "FFFFFF";
const INK = "1A1A1A";
const MUTED = "6B7280";
const ACCENT = "F97316";
const CREDIT = "9CA3AF";

function align(rtl: boolean): "left" | "right" {
  return rtl ? "right" : "left";
}

function imageData(image: LoadedImage): string {
  return `${image.mediaType};base64,${image.base64}`;
}

function credit(slide: Slide): string | null {
  if (!slide.image || slide.image.kind !== "unsplash") return null;
  return `Photo by ${slide.image.photographerName} on Unsplash`;
}

function addCredit(target: PptxGenJS.Slide, slide: Slide, rtl: boolean) {
  const text = credit(slide);
  if (!text || !slide.image || slide.image.kind !== "unsplash") return;
  target.addText(text, {
    x: MARGIN,
    y: H - 0.32,
    w: W - MARGIN * 2,
    h: 0.25,
    fontSize: 8,
    color: CREDIT,
    align: align(rtl),
    hyperlink: { url: withUnsplashUtm(slide.image.photographerUrl) },
  });
}

function addTitleSlide(target: PptxGenJS.Slide, slide: Slide, rtl: boolean, image: LoadedImage | undefined) {
  if (image) {
    target.addImage({ data: imageData(image), x: 0, y: 0, w: W, h: H, sizing: { type: "cover", w: W, h: H } });
    // A translucent band so the title reads over any photo.
    target.addShape("rect", { x: 0, y: H * 0.55, w: W, h: H * 0.45, fill: { color: "000000", transparency: 35 } });
  }
  target.addText(slide.title, {
    x: MARGIN,
    y: image ? H * 0.58 : H * 0.3,
    w: W - MARGIN * 2,
    h: 1.1,
    fontSize: 34,
    bold: true,
    color: image ? "FFFFFF" : INK,
    align: align(rtl),
    valign: "middle",
    fit: "shrink",
  });
  if (slide.bullets[0]) {
    target.addText(slide.bullets[0], {
      x: MARGIN,
      y: image ? H * 0.58 + 1.1 : H * 0.3 + 1.15,
      w: W - MARGIN * 2,
      h: 0.6,
      fontSize: 16,
      color: image ? "E5E7EB" : MUTED,
      align: align(rtl),
      fit: "shrink",
    });
  }
}

function addSectionSlide(target: PptxGenJS.Slide, slide: Slide, rtl: boolean) {
  target.addShape("rect", { x: rtl ? W - MARGIN - 0.12 : MARGIN, y: H * 0.36, w: 0.12, h: 1.2, fill: { color: ACCENT } });
  target.addText(slide.title, {
    x: rtl ? MARGIN : MARGIN + 0.3,
    y: H * 0.3,
    w: W - MARGIN * 2 - 0.3,
    h: 1.3,
    fontSize: 30,
    bold: true,
    color: INK,
    align: align(rtl),
    valign: "middle",
    fit: "shrink",
  });
  if (slide.bullets.length > 0) {
    target.addText(slide.bullets.join("  ·  "), {
      x: rtl ? MARGIN : MARGIN + 0.3,
      y: H * 0.3 + 1.35,
      w: W - MARGIN * 2 - 0.3,
      h: 0.6,
      fontSize: 14,
      color: MUTED,
      align: align(rtl),
      fit: "shrink",
    });
  }
}

function addQuoteSlide(target: PptxGenJS.Slide, slide: Slide, rtl: boolean) {
  const quote = slide.bullets[0] ?? slide.title;
  target.addText(`“${quote}”`, {
    x: MARGIN + 0.4,
    y: H * 0.22,
    w: W - MARGIN * 2 - 0.8,
    h: 2.2,
    fontSize: 24,
    italic: true,
    color: INK,
    align: rtl ? "right" : "left",
    valign: "middle",
    fit: "shrink",
  });
  target.addText(slide.bullets[0] ? slide.title : "", {
    x: MARGIN + 0.4,
    y: H * 0.22 + 2.3,
    w: W - MARGIN * 2 - 0.8,
    h: 0.5,
    fontSize: 14,
    color: MUTED,
    align: align(rtl),
  });
}

function addBulletsSlide(target: PptxGenJS.Slide, slide: Slide, rtl: boolean, image: LoadedImage | undefined) {
  const textW = image ? (W - MARGIN * 2) * 0.55 : W - MARGIN * 2;
  const textX = image && rtl ? W - MARGIN - textW : MARGIN;
  target.addText(slide.title, {
    x: textX,
    y: MARGIN,
    w: textW,
    h: 0.9,
    fontSize: 24,
    bold: true,
    color: INK,
    align: align(rtl),
    valign: "middle",
    fit: "shrink",
  });
  if (slide.bullets.length > 0) {
    target.addText(
      slide.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } })),
      {
        x: textX,
        y: MARGIN + 1.0,
        w: textW,
        h: H - MARGIN * 2 - 1.3,
        fontSize: 15,
        color: INK,
        align: align(rtl),
        valign: "top",
        fit: "shrink",
      }
    );
  }
  if (image) {
    const imgW = (W - MARGIN * 2) * 0.4;
    const imgX = rtl ? MARGIN : W - MARGIN - imgW;
    target.addImage({
      data: imageData(image),
      x: imgX,
      y: MARGIN,
      w: imgW,
      h: H - MARGIN * 2 - 0.3,
      sizing: { type: "cover", w: imgW, h: H - MARGIN * 2 - 0.3 },
    });
  }
}

function addImageSlide(target: PptxGenJS.Slide, slide: Slide, rtl: boolean, image: LoadedImage | undefined) {
  if (!image) {
    // The photo did not arrive; the slide is still its caption and its
    // points, laid out as a bullets slide rather than as a hole.
    addBulletsSlide(target, slide, rtl, undefined);
    return;
  }
  const imgH = H - MARGIN * 2 - 0.9;
  target.addImage({ data: imageData(image), x: MARGIN, y: MARGIN, w: W - MARGIN * 2, h: imgH, sizing: { type: "cover", w: W - MARGIN * 2, h: imgH } });
  target.addText(slide.title, {
    x: MARGIN,
    y: MARGIN + imgH + 0.05,
    w: W - MARGIN * 2,
    h: 0.55,
    fontSize: 14,
    bold: true,
    color: INK,
    align: align(rtl),
    valign: "middle",
    fit: "shrink",
  });
}

/**
 * A CHART SLIDE: the title, a NATIVE chart — PowerPoint opens it as a
 * chart it can edit, with the file's numbers in its own data sheet — the
 * slide's few points beside it, and under it where the numbers came from.
 * The values are the stored ones, never re-derived here.
 */
function addChartSlide(pres: PptxGenJS, target: PptxGenJS.Slide, slide: Slide, chart: SlideChart, rtl: boolean, source: string) {
  target.addText(slide.title, {
    x: MARGIN,
    y: MARGIN * 0.6,
    w: W - MARGIN * 2,
    h: 0.75,
    fontSize: 22,
    bold: true,
    color: INK,
    align: align(rtl),
    valign: "middle",
    fit: "shrink",
  });
  const top = MARGIN * 0.6 + 0.85;
  const chartH = H - top - 0.55;
  const chartW = slide.bullets.length > 0 ? (W - MARGIN * 2) * 0.64 : W - MARGIN * 2;
  const chartX = slide.bullets.length > 0 && rtl ? W - MARGIN - chartW : MARGIN;
  const type = chart.kind === "line" ? pres.ChartType.line : chart.kind === "pie" ? pres.ChartType.pie : pres.ChartType.bar;
  const series = chart.source.y ?? chart.source.x;
  target.addChart(type, [{ name: series, labels: chart.points.map((p) => p.label), values: chart.points.map((p) => p.value) }], {
    x: chartX,
    y: top,
    w: chartW,
    h: chartH,
    barDir: "col",
    chartColors: chart.kind === "pie" ? ["F97316", "1A1A1A", "6B7280", "FDBA74", "9CA3AF", "C2410C", "D1D5DB", "FED7AA"] : [ACCENT],
    showValue: true,
    dataLabelFontSize: 9,
    dataLabelColor: chart.kind === "pie" ? "FFFFFF" : INK,
    showLegend: chart.kind === "pie",
    legendPos: "r",
    legendFontSize: 9,
    catAxisLabelFontSize: 9,
    valAxisLabelFontSize: 9,
    catAxisLabelColor: MUTED,
    valAxisLabelColor: MUTED,
    lineDataSymbol: "circle",
    showTitle: false,
  });
  if (slide.bullets.length > 0) {
    const textW = W - MARGIN * 2 - chartW - 0.25;
    target.addText(
      slide.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } })),
      {
        x: rtl ? MARGIN : W - MARGIN - textW,
        y: top,
        w: textW,
        h: chartH,
        fontSize: 13,
        color: INK,
        align: align(rtl),
        valign: "top",
        fit: "shrink",
      }
    );
  }
  target.addText(source, {
    x: MARGIN,
    y: H - 0.45,
    w: W - MARGIN * 2,
    h: 0.3,
    fontSize: 8,
    color: CREDIT,
    align: align(rtl),
    fit: "shrink",
  });
}

/** Where a chart's numbers came from, in English when the caller has no
 *  translator for the deck's language. The routes pass one. */
function englishSource(chart: SlideChart): string {
  const { file, rows, aggregation, x, y } = chart.source;
  const how = aggregation === "count" ? `rows counted for each ${x}` : `the ${aggregation} of ${y} for each ${x}`;
  return `From ${file} (${rows} rows): ${how}`;
}

export async function renderDeckPptx(
  deck: Deck,
  images: Map<number, LoadedImage>,
  sourceText: (chart: SlideChart) => string = englishSource
): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.title = deck.title;
  const rtl = isRtlLocale(deck.locale);

  deck.slides.forEach((slide, index) => {
    const target = pres.addSlide();
    target.background = { color: BG };
    const image = images.get(index);
    switch (slide.layout) {
      case "title":
        addTitleSlide(target, slide, rtl, image);
        break;
      case "section":
        addSectionSlide(target, slide, rtl);
        break;
      case "quote":
        addQuoteSlide(target, slide, rtl);
        break;
      case "image":
        addImageSlide(target, slide, rtl, image);
        break;
      case "chart":
        if (slide.chart) addChartSlide(pres, target, slide, slide.chart, rtl, sourceText(slide.chart));
        else addBulletsSlide(target, slide, rtl, undefined);
        break;
      default:
        addBulletsSlide(target, slide, rtl, image);
    }
    if (image) addCredit(target, slide, rtl);
    if (slide.notes) target.addNotes(slide.notes);
  });

  // The attribution Unsplash asks for, once more where somebody reading
  // the file's properties looks. The per-slide credit above is the one
  // that is visible.
  const credited = deck.slides.filter((s) => s.image?.kind === "unsplash").length;
  if (credited > 0) pres.subject = `${credited} photo(s) from Unsplash — ${UNSPLASH_HOME_URL}`;

  const out = await pres.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
