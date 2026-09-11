import React from "react";
import { Document, Page, Text, View, Image as PdfImage, Link, StyleSheet } from "@react-pdf/renderer";
import { pdfFontFamily } from "@/lib/pdf/font-stack";
import { isRtlLocale } from "@/lib/pdf/rtl";
import { breakCjkRuns, cjkCharsPerLine } from "@/lib/pdf/cjk-wrap";
import { UNSPLASH_HOME_URL, withUnsplashUtm } from "@/lib/website-image-placeholders";
import type { Deck, Slide } from "@/lib/presentations/deck";
import type { LoadedImage } from "@/lib/presentations/images";

/**
 * THE SECOND PAGE SHAPE THIS APP DRAWS, AND WHY IT IS NOT THE FIRST.
 *
 * lib/pdf/document.tsx is an A4 portrait page of prose: headings,
 * paragraphs, lists. A slide is a 16:9 landscape canvas with one title
 * and a handful of lines on it, and forcing it through the document
 * renderer would give a person a PDF that reads like a memo about their
 * presentation rather than the presentation.
 *
 * WHAT IS THE SAME, because it is the part that goes wrong quietly. The
 * font family is derived from the deck's own language through
 * pdfFontFamily(locale) — never named here — so an Arabic deck leads
 * with the Arabic face and its spaces shape correctly, and Chinese is
 * broken onto lines by cjk-wrap.ts because the engine's breaker cannot.
 * scripts/tests/pdf-font-stack.test.mjs checks this file for both, in
 * the same clause it checks document.tsx.
 *
 * THE CANVAS IS THE .PPTX CANVAS: 10 x 5.625 inches, here in points
 * (720 x 405), so the two exports of one deck lay out alike.
 */
const PAGE_W = 720;
const PAGE_H = 405;
const PAD = 36;
const COLUMN_W = PAGE_W - PAD * 2;

function sheetFor(fontFamily: string[]) {
  return StyleSheet.create({
    page: { fontFamily, backgroundColor: "#ffffff", color: "#1a1a1a", padding: PAD },
    title: { fontFamily, fontSize: 26, fontWeight: 700 },
    subtitle: { fontFamily, fontSize: 13, color: "#6b7280", marginTop: 8 },
    sectionTitle: { fontFamily, fontSize: 24, fontWeight: 700 },
    heading: { fontFamily, fontSize: 18, fontWeight: 700, marginBottom: 10 },
    bulletRow: { flexDirection: "row", marginBottom: 5 },
    bulletMarker: { fontFamily, width: 14, color: "#6b7280", fontSize: 11 },
    bulletText: { fontFamily, flex: 1, fontSize: 11 },
    quote: { fontFamily, fontSize: 17, fontStyle: "italic" },
    quoteBy: { fontFamily, fontSize: 11, color: "#6b7280", marginTop: 10 },
    caption: { fontFamily, fontSize: 11, fontWeight: 700, marginTop: 6 },
    notes: { fontFamily, fontSize: 7.5, color: "#6b7280" },
    credit: { fontFamily, fontSize: 7, color: "#9ca3af" },
    footer: { position: "absolute", bottom: 12, left: PAD, right: PAD, fontFamily, fontSize: 7, color: "#9ca3af" },
    accentBar: { width: 6, backgroundColor: "#f97316", marginRight: 12 },
  });
}
type Sheet = ReturnType<typeof sheetFor>;

function imageSrc(image: LoadedImage) {
  return { data: Buffer.from(image.base64, "base64"), format: image.mediaType === "image/png" ? ("png" as const) : ("jpg" as const) };
}

function wrap(text: string, width: number, fontSize: number): string {
  return breakCjkRuns(text, cjkCharsPerLine(width, fontSize));
}

function Bullets({ slide, styles, width, align }: { slide: Slide; styles: Sheet; width: number; align: "left" | "right" }) {
  return (
    <View>
      {slide.bullets.map((b, i) => (
        <View key={i} style={[styles.bulletRow, align === "right" ? { flexDirection: "row-reverse" } : {}]}>
          <Text style={[styles.bulletMarker, { textAlign: align }]}>•</Text>
          <Text style={[styles.bulletText, { textAlign: align }]}>{wrap(b, width - 14, 11)}</Text>
        </View>
      ))}
    </View>
  );
}

function Credit({ slide, styles, align }: { slide: Slide; styles: Sheet; align: "left" | "right" }) {
  if (!slide.image || slide.image.kind !== "unsplash") return null;
  return (
    <Text style={[styles.credit, { textAlign: align, marginTop: 4 }]}>
      Photo by <Link src={withUnsplashUtm(slide.image.photographerUrl)}>{slide.image.photographerName}</Link> on{" "}
      <Link src={UNSPLASH_HOME_URL}>Unsplash</Link>
    </Text>
  );
}

function SlidePage({
  slide,
  image,
  index,
  total,
  styles,
  rtl,
}: {
  slide: Slide;
  image: LoadedImage | undefined;
  index: number;
  total: number;
  styles: Sheet;
  rtl: boolean;
}) {
  const align = rtl ? ("right" as const) : ("left" as const);
  let body: React.ReactNode;
  switch (slide.layout) {
    case "title":
      body = (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={[styles.title, { textAlign: align }]}>{wrap(slide.title, COLUMN_W, 26)}</Text>
          {slide.bullets[0] ? <Text style={[styles.subtitle, { textAlign: align }]}>{wrap(slide.bullets[0], COLUMN_W, 13)}</Text> : null}
        </View>
      );
      break;
    case "section":
      body = (
        <View style={{ flex: 1, justifyContent: "center", flexDirection: rtl ? "row-reverse" : "row" }}>
          <View style={styles.accentBar} />
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={[styles.sectionTitle, { textAlign: align }]}>{wrap(slide.title, COLUMN_W - 18, 24)}</Text>
            {slide.bullets.length > 0 ? (
              <Text style={[styles.subtitle, { textAlign: align }]}>{wrap(slide.bullets.join("  ·  "), COLUMN_W - 18, 13)}</Text>
            ) : null}
          </View>
        </View>
      );
      break;
    case "quote":
      body = (
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 30 }}>
          <Text style={[styles.quote, { textAlign: align }]}>“{wrap(slide.bullets[0] ?? slide.title, COLUMN_W - 60, 17)}”</Text>
          {slide.bullets[0] ? <Text style={[styles.quoteBy, { textAlign: align }]}>{slide.title}</Text> : null}
        </View>
      );
      break;
    case "image":
      body = image ? (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, overflow: "hidden" }}>
            <PdfImage src={imageSrc(image)} style={{ width: COLUMN_W, height: PAGE_H - PAD * 2 - 40, objectFit: "cover" }} />
          </View>
          <Text style={[styles.caption, { textAlign: align }]}>{wrap(slide.title, COLUMN_W, 11)}</Text>
          <Credit slide={slide} styles={styles} align={align} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { textAlign: align }]}>{wrap(slide.title, COLUMN_W, 18)}</Text>
          <Bullets slide={slide} styles={styles} width={COLUMN_W} align={align} />
        </View>
      );
      break;
    default: {
      const textW = image ? COLUMN_W * 0.56 : COLUMN_W;
      body = (
        <View style={{ flex: 1, flexDirection: rtl ? "row-reverse" : "row" }}>
          <View style={{ width: textW }}>
            <Text style={[styles.heading, { textAlign: align }]}>{wrap(slide.title, textW, 18)}</Text>
            <Bullets slide={slide} styles={styles} width={textW} align={align} />
          </View>
          {image ? (
            <View style={{ width: COLUMN_W * 0.4, marginLeft: rtl ? 0 : COLUMN_W * 0.04, marginRight: rtl ? COLUMN_W * 0.04 : 0 }}>
              <PdfImage src={imageSrc(image)} style={{ width: COLUMN_W * 0.4, height: PAGE_H - PAD * 2 - 30, objectFit: "cover" }} />
              <Credit slide={slide} styles={styles} align={align} />
            </View>
          ) : null}
        </View>
      );
    }
  }
  return (
    <Page size={[PAGE_W, PAGE_H]} style={styles.page}>
      {body}
      {slide.notes ? (
        <Text style={[styles.notes, { textAlign: align, marginTop: 6 }]}>{wrap(slide.notes, COLUMN_W, 7.5)}</Text>
      ) : null}
      <Text style={[styles.footer, { textAlign: rtl ? "left" : "right" }]}>
        {index + 1} / {total}
      </Text>
    </Page>
  );
}

export function PdfDeck({ deck, images }: { deck: Deck; images: Map<number, LoadedImage> }) {
  const rtl = isRtlLocale(deck.locale);
  const fontFamily = pdfFontFamily(deck.locale);
  const styles = sheetFor(fontFamily);
  return (
    <Document title={deck.title}>
      {deck.slides.map((slide, index) => (
        <SlidePage
          key={index}
          slide={slide}
          image={images.get(index)}
          index={index}
          total={deck.slides.length}
          styles={styles}
          rtl={rtl}
        />
      ))}
    </Document>
  );
}
