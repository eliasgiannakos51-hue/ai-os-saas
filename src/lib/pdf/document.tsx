import React from "react";
import { Document, Page, Text, View, Link, StyleSheet } from "@react-pdf/renderer";
import { PDF_FONT_FAMILY } from "@/lib/pdf/font-stack";
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
 * would file that as a bug. So no route sets a font. This file does, from
 * PDF_FONT_FAMILY, and scripts/tests/pdf-font-stack.test.mjs fails the build
 * if any other file under src/ names a font family at all.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 11,
    lineHeight: 1.55,
    color: "#1a1a1a",
  },
  title: { fontFamily: PDF_FONT_FAMILY, fontSize: 22, fontWeight: 700, marginBottom: 6, lineHeight: 1.25 },
  subtitle: { fontFamily: PDF_FONT_FAMILY, fontSize: 9, color: "#6b7280", marginBottom: 22 },
  h1: { fontFamily: PDF_FONT_FAMILY, fontSize: 16, fontWeight: 700, marginTop: 18, marginBottom: 6 },
  h2: { fontFamily: PDF_FONT_FAMILY, fontSize: 13, fontWeight: 700, marginTop: 14, marginBottom: 5 },
  h3: { fontFamily: PDF_FONT_FAMILY, fontSize: 11, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  paragraph: { fontFamily: PDF_FONT_FAMILY, marginBottom: 8 },
  listRow: { flexDirection: "row", marginBottom: 5 },
  listMarker: { fontFamily: PDF_FONT_FAMILY, width: 18, color: "#6b7280" },
  listBody: { fontFamily: PDF_FONT_FAMILY, flex: 1 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 14 },
  link: { fontFamily: PDF_FONT_FAMILY, color: "#2563eb", textDecoration: "underline" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 56,
    right: 56,
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 8,
    color: "#9ca3af",
  },
});

/** Locales written right to left. Only Arabic, of the ten this app ships. */
const RTL_LOCALES = new Set(["ar", "fa", "he", "ur"]);

export function isRtlLocale(locale: string | null | undefined): boolean {
  return RTL_LOCALES.has(String(locale ?? "").slice(0, 2).toLowerCase());
}

function runElements(runs: PdfRun[], keyPrefix: string): React.ReactNode[] {
  return runs.map((run, i) => {
    const key = `${keyPrefix}-${i}`;
    const style = {
      fontFamily: PDF_FONT_FAMILY,
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
 * ITALIC IS NOT SYNTHESISED.
 *
 * Only Inter is registered in a bold face; nothing here ships an italic one,
 * and @react-pdf does not slant a font it was not given. `fontStyle:
 * "italic"` on a family with no italic face resolves back to the regular
 * one, so emphasis in a document renders as plain text rather than as a
 * missing glyph or a crash. That is the right failure: the words are all
 * there, which is what a downloaded document is for.
 */

function blockElements(blocks: PdfBlock[], rtl: boolean): React.ReactNode[] {
  const align = rtl ? ("right" as const) : ("left" as const);
  return blocks.map((block, i) => {
    const key = `b${i}`;
    switch (block.kind) {
      case "rule":
        return <View key={key} style={styles.rule} />;
      case "heading": {
        const style = block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3;
        return (
          <Text key={key} style={[style, { textAlign: align }]}>
            {runElements(block.runs, key)}
          </Text>
        );
      }
      case "listItem":
        return (
          <View key={key} style={[styles.listRow, rtl ? { flexDirection: "row-reverse" } : {}]}>
            <Text style={[styles.listMarker, { textAlign: align }]}>{block.marker}</Text>
            <Text style={[styles.listBody, { textAlign: align }]}>{runElements(block.runs, key)}</Text>
          </View>
        );
      default:
        return (
          <Text key={key} style={[styles.paragraph, { textAlign: align }]}>
            {runElements(block.runs, key)}
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
  /** The reader's locale, so an Arabic document is laid out right to left. */
  locale?: string | null;
  /** Shown at the foot of every page beside the page number. */
  footerNote?: string;
};

export function PdfDocument({ title, subtitle, blocks, locale, footerNote }: PdfDocumentProps) {
  const rtl = isRtlLocale(locale);
  const align = rtl ? ("right" as const) : ("left" as const);
  return (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <Text style={[styles.title, { textAlign: align }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { textAlign: align }]}>{subtitle}</Text> : null}
        {blockElements(blocks, rtl)}
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
