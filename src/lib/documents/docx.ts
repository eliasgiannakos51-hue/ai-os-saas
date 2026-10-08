import type { PdfBlock, PdfRun } from "@/lib/pdf/blocks";
import { zipStore } from "@/lib/websites/zip-store";

/**
 * A DOCUMENT AS A WORD FILE (.docx) — real paragraphs, headings and lists
 * Word can edit, from the same blocks the PDF is drawn from
 * (lib/pdf/blocks.ts htmlToBlocks), so the two downloads of one document
 * say the same thing (MASTER 16, package 14).
 *
 * WRITTEN HERE, NOT WITH A LIBRARY. A .docx is a zip of a handful of XML
 * parts; lib/websites/zip-store.ts already writes the zip, and the parts
 * below are the minimum Word, LibreOffice and Google Docs all open:
 * the content types, the package relationship, the document, its styles
 * (Title, Heading 1–3) and its numbering (bullets, and a fresh 1, 2, 3
 * for each numbered list). A dependency for this would be one more thing
 * in the path of a file built from text a model wrote.
 *
 * NO FONT IS NAMED, for the reason lib/presentations/pptx.ts gives: the
 * program that opens it substitutes per script better than a name chosen
 * here. The language is set on every run, so Word's spelling and
 * hyphenation are Greek for a Greek document; an Arabic or Hebrew
 * document is laid out right to left.
 *
 * Held by scripts/tests/document-writer.test.mjs (the parts, read back) and
 * scripts/tests/document-writer.prodtest.mjs (LibreOffice Writer opens it).
 */

const RTL = new Set(["ar", "he", "fa", "ur"]);
const LANG: Record<string, string> = { el: "el-GR", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", it: "it-IT", pt: "pt-PT", zh: "zh-CN", ja: "ja-JP", ar: "ar-SA" };

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function runXml(run: PdfRun, lang: string, rtl: boolean): string {
  const props = [run.bold ? "<w:b/><w:bCs/>" : "", run.italic ? "<w:i/><w:iCs/>" : "", rtl ? "<w:rtl/>" : "", `<w:lang w:val="${lang}" w:bidi="${lang}" w:eastAsia="${lang}"/>`].join("");
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xml(run.text)}</w:t></w:r>`;
}

export function renderDocx(title: string, blocks: readonly PdfBlock[], locale: string): Uint8Array {
  const lang = LANG[locale] ?? "en-US";
  const rtl = RTL.has(locale);
  const links: string[] = [];
  const ordered: number[] = [];
  let lastWasOrdered = false;
  const bidi = rtl ? "<w:bidi/>" : "";

  const runsXml = (runs: readonly PdfRun[]) =>
    runs
      .map((run) => {
        if (run.href && /^https?:\/\//i.test(run.href)) {
          links.push(run.href);
          return `<w:hyperlink r:id="rLink${links.length}">${runXml({ ...run, href: undefined }, lang, rtl)}</w:hyperlink>`;
        }
        return runXml(run, lang, rtl);
      })
      .join("");

  const body: string[] = [`<w:p><w:pPr><w:pStyle w:val="Title"/>${bidi}</w:pPr>${runXml({ text: title }, lang, rtl)}</w:p>`];
  for (const block of blocks) {
    if (block.kind === "listItem") {
      const isOrdered = /^\d+\.$/.test(block.marker);
      // A NEW NUMBERED LIST STARTS AT 1: each one gets its own numbering
      // instance (numId 3, 4, …) over the decimal definition.
      if (isOrdered && !lastWasOrdered) ordered.push(3 + ordered.length);
      const numId = isOrdered ? ordered[ordered.length - 1] : 1;
      lastWasOrdered = isOrdered;
      body.push(`<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>${bidi}</w:pPr>${runsXml(block.runs)}</w:p>`);
      continue;
    }
    lastWasOrdered = false;
    if (block.kind === "heading") body.push(`<w:p><w:pPr><w:pStyle w:val="Heading${block.level}"/>${bidi}</w:pPr>${runsXml(block.runs)}</w:p>`);
    else if (block.kind === "paragraph") body.push(`<w:p><w:pPr>${bidi}</w:pPr>${runsXml(block.runs)}</w:p>`);
    else body.push(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr></w:pPr></w:p>`);
  }

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const heading = (level: number, size: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="${lang}" w:bidi="${lang}" w:eastAsia="${lang}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>${heading(1, 32)}${heading(2, 28)}${heading(3, 24)}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/><w:spacing w:after="60"/></w:pPr></w:style></w:styles>`;

  const level = (fmt: string, text: string) =>
    `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>${level("bullet", "•")}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/>${level("decimal", "%1.")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>${ordered
    .map((id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`)
    .join("")}</w:numbering>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${links
    .map((href, i) => `<Relationship Id="rLink${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(href)}" TargetMode="External"/>`)
    .join("")}</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rDoc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:language>${lang}</dc:language></cp:coreProperties>`;

  const enc = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "docProps/core.xml", data: enc.encode(core) },
    { name: "word/document.xml", data: enc.encode(document) },
    { name: "word/styles.xml", data: enc.encode(styles) },
    { name: "word/numbering.xml", data: enc.encode(numbering) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(docRels) },
  ]);
}
