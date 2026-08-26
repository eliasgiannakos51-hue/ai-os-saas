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
function sheetFor(fontFamily: string[]) {
  return StyleSheet.create({
    page: {
      paddingTop: 56,
      paddingBottom: 64,
      paddingHorizontal: 56,
      fontFamily,
      fontSize: 11,
      lineHeight: 1.55,
      color: "#1a1a1a",
    },
    // THE TITLE'S LINE BOX IS SIZED FOR THE TALLEST SCRIPT IT MIGHT HOLD. At
    // lineHeight 1.25 an Arabic title overflowed its box and the subtitle was
    // drawn across it — legible in Latin, unreadable in Arabic, and invisible
    // to every check that reads characters rather than looking at the page.
    title: {
      fontFamily,
      fontSize: 22,
      fontWeight: 700,
      marginBottom: 8,
      lineHeight: 1.6,
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
    paragraph: { fontFamily, marginBottom: 8 },
    listRow: { flexDirection: "row", marginBottom: 5 },
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
): React.ReactNode[] {
  return runs.map((run, i) => {
    const key = `${keyPrefix}-${i}`;
    const style = {
      fontFamily,
      fontWeight: run.bold ? (700 as const) : (400 as const),
      fontStyle: run.italic ? ("italic" as const) : ("normal" as const),
    };
    if (run.href) {
      return (
        <Link key={key} src={run.href} style={[styles.link, style]}>
          {run.text}
        </Link>
      );
    }
    return (
      <Text key={key} style={style}>
        {run.text}
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
        return (
          <Text key={key} style={[style, { textAlign: align }]}>
            {runElements(block.runs, key, fontFamily, styles)}
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
              {runElements(block.runs, key, fontFamily, styles)}
            </Text>
          </View>
        );
      default:
        return (
          <Text key={key} style={[styles.paragraph, { textAlign: align }]}>
            {runElements(block.runs, key, fontFamily, styles)}
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
        <Text style={[styles.title, { textAlign: align }]}>{title}</Text>
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
