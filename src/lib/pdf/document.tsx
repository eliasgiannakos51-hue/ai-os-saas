import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Link,
  StyleSheet,
} from "@react-pdf/renderer";
import { pdfFontFamily } from "@/lib/pdf/font-stack";
import { breakCjkRuns, cjkCharsPerLine } from "@/lib/pdf/cjk-wrap";
import type { PdfBlock, PdfRun } from "@/lib/pdf/blocks";

/**
 * THE ONLY PLACE A PDF PAGE IS DESCRIBED.
 *
 * Every downloadable document in this app — a written document, a research
 * report, a mission plan — is the same page with different blocks in it. One
 * renderer rather than three means one set of typographic decisions, and,
 * more importantly, ONE place where `fontFamily` is written.
 *
 * WHY THAT MATTERS MORE THAN TIDINESS. @react-pdf resolves a font per <Text>
 * and does not fall back per character. Given a single family that lacks the
 * character, it does not draw a blank box; it draws whatever glyph that id
 * happens to be in the font it does have. Measured: "华为" set in Inter comes
 * out as "N:". A route that spelled its own `fontFamily: "Inter"` would
 * produce Greek and Latin documents that look perfect and Chinese ones that
 * are quietly wrong — and nobody downloading a document they cannot read
 * would file that as a bug. So no route sets a font.
 *
 * AND THE ORDER OF THE LIST IS PART OF THE ANSWER, not a detail. The space
 * character is in every font, so whichever family comes FIRST sets every
 * space in the document — and with Inter first, an Arabic paragraph is cut
 * into a separate shaping run at every word boundary, so the letters stop
 * joining correctly and the spacing between words is wrong. Measured against
 * Chromium on "معدل التسرب ثابت": 0.666 agreement with Inter first, 0.983
 * with the Arabic face first. A coverage check cannot see this — every
 * character is present in both. Only the shapes are wrong.
 *
 * So the family is derived from the document's own language, once, here.
 * scripts/tests/pdf-font-stack.test.mjs fails the build if any other file
 * under src/ names a font family at all.
 */

/**
 * The sheet, built for one document's language.
 *
 * Not a module-level StyleSheet.create: the family depends on the document,
 * and a static sheet would either hard-code one script's order for every
 * language or push the decision out to the routes, which is the thing this
 * file exists to prevent.
 */
// A4 in points, and the padding, as constants — because the column width is
// derived from them and a hard-coded column would drift the day the margins
// change. Chinese and Japanese are broken onto lines against this width (see
// cjk-wrap.ts); nothing else needs it.
const PAGE_WIDTH = 595.28;
const PAGE_PADDING_X = 56;
const COLUMN_WIDTH = PAGE_WIDTH - PAGE_PADDING_X * 2;
/** The marker column in front of a list item, from `listMarker.width`. */
const LIST_MARKER_WIDTH = 18;
/** `page.fontSize`, which every block inherits unless it sets its own. */
const BODY_SIZE = 11;
const TITLE_SIZE = 22;

function sheetFor(fontFamily: string[]) {
  return StyleSheet.create({
    page: {
      paddingTop: 56,
      paddingBottom: 64,
      paddingHorizontal: PAGE_PADDING_X,
      fontFamily,
      fontSize: BODY_SIZE,
      color: "#1a1a1a",
    },
    // NO `lineHeight` ANYWHERE IN THIS SHEET, AND THAT IS THE POINT.
    //
    // One number cannot fit three scripts. What each face needs for its own
    // line box, measured from its metrics and confirmed against Chromium at
    // `line-height: normal`:
    //
    //     Inter            1.210   (Chromium: 1.182)
    //     Noto Sans SC     1.448   (Chromium: 1.455)
    //     Noto Sans Arabic 2.112   (Chromium: 2.091)
    //
    // Arabic wants nearly twice the box Latin does, because its marks sit far
    // above and below. A title at lineHeight 1.25 overflowed and the subtitle
    // was drawn across it; raising it to 1.6 hid the collision without fixing
    // it — 1.6 is still well under 2.112. And a single tall value would make
    // every English document airy for the sake of a script it does not use.
    //
    // With no lineHeight set, @react-pdf sizes each line from the font
    // actually used on it, which is what a browser does and what mixed-script
    // content needs. Measured, ink-band gaps at 14px over four lines:
    //
    //     no lineHeight    latin 7px   CJK 15px   arabic 26px
    //     lineHeight 1.55  latin 17px  CJK 18px   arabic 10px  <- squeezed
    //
    // Vertical rhythm comes from margins instead, which do not touch the
    // line box.
    title: {
      fontFamily,
      fontSize: TITLE_SIZE,
      fontWeight: 700,
      marginBottom: 10,
    },
    subtitle: { fontFamily, fontSize: 9, color: "#6b7280", marginBottom: 22 },
    h1: {
      fontFamily,
      fontSize: 16,
      fontWeight: 700,
      marginTop: 18,
      marginBottom: 6,
    },
    h2: {
      fontFamily,
      fontSize: 13,
      fontWeight: 700,
      marginTop: 14,
      marginBottom: 5,
    },
    h3: {
      fontFamily,
      fontSize: 11,
      fontWeight: 700,
      marginTop: 12,
      marginBottom: 4,
    },
    // The leading inside a paragraph is now the font's own, which is tighter
    // for Latin than a styled 1.55 would be. The rhythm comes back between
    // blocks instead, where a margin cannot squeeze anything.
    paragraph: { fontFamily, marginBottom: 11 },
    listRow: { flexDirection: "row", marginBottom: 7 },
    listMarker: { fontFamily, width: 18, color: "#6b7280" },
    listBody: { fontFamily, flex: 1 },
    rule: {
      borderBottomWidth: 1,
      borderBottomColor: "#e5e7eb",
      marginVertical: 14,
    },
    link: { fontFamily, color: "#2563eb", textDecoration: "underline" },
    footer: {
      position: "absolute",
      bottom: 30,
      left: 56,
      right: 56,
      fontFamily,
      fontSize: 8,
      color: "#9ca3af",
    },
  });
}

type Sheet = ReturnType<typeof sheetFor>;

/** Locales written right to left. Only Arabic, of the ten this app ships. */
const RTL_LOCALES = new Set(["ar", "fa", "he", "ur"]);

export function isRtlLocale(locale: string | null | undefined): boolean {
  return RTL_LOCALES.has(
    String(locale ?? "")
      .slice(0, 2)
      .toLowerCase(),
  );
}

function runElements(
  runs: PdfRun[],
  keyPrefix: string,
  fontFamily: string[],
  styles: Sheet,
  /** The column this text will be laid out in, for the CJK line breaker. */
  column: { width: number; fontSize: number },
): React.ReactNode[] {
  return runs.map((run, i) => {
    const key = `${keyPrefix}-${i}`;
    const style = {
      fontFamily,
      fontWeight: run.bold ? (700 as const) : (400 as const),
      fontStyle: run.italic ? ("italic" as const) : ("normal" as const),
    };
    // CHINESE AND JAPANESE ARE BROKEN ONTO LINES HERE, because the engine's
    // breaker splits on spaces and they have none — one paragraph came out
    // as one line running off the page. See cjk-wrap.ts for why a
    // hyphenation callback and a zero-width space both fail.
    const text = breakCjkRuns(
      run.text,
      cjkCharsPerLine(column.width, column.fontSize),
    );
    if (run.href) {
      return (
        <Link key={key} src={run.href} style={[styles.link, style]}>
          {text}
        </Link>
      );
    }
    return (
      <Text key={key} style={style}>
        {text}
      </Text>
    );
  });
}

/**
 * EMPHASIS IS SAFE BECAUSE EVERY COMBINATION IS REGISTERED, NOT BECAUSE THE
 * ENGINE FORGIVES A MISSING ONE.
 *
 * An earlier version of this comment said @react-pdf "resolves back to the
 * regular one" for a family with no italic face. It does not — it throws
 * `Could not resolve font for Inter, fontWeight 400, fontStyle italic` and
 * the whole render dies, so a single <i> in a document turned the download
 * into a 500. Found by rendering a document that had emphasis in it, which
 * nothing had done.
 *
 * font-stack.ts now registers all four weight/style combinations for all
 * three families, pointing at the same file where no such cut exists.
 */

function blockElements(
  blocks: PdfBlock[],
  rtl: boolean,
  fontFamily: string[],
  styles: Sheet,
): React.ReactNode[] {
  const align = rtl ? ("right" as const) : ("left" as const);
  return blocks.map((block, i) => {
    const key = `b${i}`;
    switch (block.kind) {
      case "rule":
        return <View key={key} style={styles.rule} />;
      case "heading": {
        const style =
          block.level === 1
            ? styles.h1
            : block.level === 2
              ? styles.h2
              : styles.h3;
        const fontSize =
          block.level === 1 ? 16 : block.level === 2 ? 13 : BODY_SIZE;
        return (
          <Text key={key} style={[style, { textAlign: align }]}>
            {runElements(block.runs, key, fontFamily, styles, {
              width: COLUMN_WIDTH,
              fontSize,
            })}
          </Text>
        );
      }
      case "listItem":
        return (
          <View
            key={key}
            style={[
              styles.listRow,
              rtl ? { flexDirection: "row-reverse" } : {},
            ]}
          >
            <Text style={[styles.listMarker, { textAlign: align }]}>
              {block.marker}
            </Text>
            <Text style={[styles.listBody, { textAlign: align }]}>
              {runElements(block.runs, key, fontFamily, styles, {
                width: COLUMN_WIDTH - LIST_MARKER_WIDTH,
                fontSize: BODY_SIZE,
              })}
            </Text>
          </View>
        );
      default:
        return (
          <Text key={key} style={[styles.paragraph, { textAlign: align }]}>
            {runElements(block.runs, key, fontFamily, styles, {
              width: COLUMN_WIDTH,
              fontSize: BODY_SIZE,
            })}
          </Text>
        );
    }
  });
}

export type PdfDocumentProps = {
  title: string;
  /** One line under the title: what this is and when it was made. */
  subtitle?: string;
  blocks: PdfBlock[];
  /**
   * The DOCUMENT'S language, not the interface's. It decides both the
   * reading direction and which font sets the spaces — a reader whose app is
   * in Greek can be holding an Arabic report, and it is the report that has
   * to be laid out for Arabic.
   */
  locale?: string | null;
  /** Shown at the foot of every page beside the page number. */
  footerNote?: string;
};

export function PdfDocument({
  title,
  subtitle,
  blocks,
  locale,
  footerNote,
}: PdfDocumentProps) {
  const rtl = isRtlLocale(locale);
  const align = rtl ? ("right" as const) : ("left" as const);
  const fontFamily = pdfFontFamily(locale);
  const styles = sheetFor(fontFamily);
  return (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <Text style={[styles.title, { textAlign: align }]}>
          {breakCjkRuns(title, cjkCharsPerLine(COLUMN_WIDTH, TITLE_SIZE))}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { textAlign: align }]}>
            {subtitle}
          </Text>
        ) : null}
        {blockElements(blocks, rtl, fontFamily, styles)}
        <Text
          fixed
          style={[styles.footer, { textAlign: align }]}
          render={({ pageNumber, totalPages }) =>
            `${footerNote ? `${footerNote}  ·  ` : ""}${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
