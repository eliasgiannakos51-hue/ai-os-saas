// REAL PDFs, FROM A REAL PRINTER - the third time "some PDFs are still
// rejected" was reported.
//
// The first fix made the extractor read a real Chromium-printed PDF at
// all. The second gave every refusal a sentence a person can act on.
// This is the THIRD cause, and it was only findable by feeding the real
// extractor real files that nobody here wrote the bytes of:
//
//   1. An UNMAPPED FONT CODE was emitted as a raw byte. Right for a font
//      with no CMap (the byte IS the character), wrong for a subset font
//      that shipped one - every second character of an Arabic heading was
//      a glyph id printed as if it were text.
//   2. RIGHT-TO-LEFT TEXT was stored as it was DRAWN: presentation forms
//      in visual order. Every word present, no word findable, and the
//      model asked questions about it.
//
// Run: node scripts/tests/pdf-real-files.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const { loadTs } = await import("./load-ts.mjs");
const extract = await loadTs("src/lib/files/extract.ts");
const types = await loadTs("src/lib/files/file-types.ts");
const pdf = await loadTs("src/lib/files/pdf.ts");

const read = (name) => readFileSync(`scripts/tests/fixtures/${name}`);
function textOf(name) {
  const out = extract.extractText(read(name), "pdf");
  return { out, text: out.pages.map((p) => p.text).join("\n") };
}

console.log("== 1. every real PDF is sniffed as a PDF ==");
for (const name of ["browser-print.pdf", "multilingual.pdf", "arabic-only.pdf", "scanned-no-text-layer.pdf"]) {
  check(`${name}`, types.sniffFileType(new Uint8Array(read(name)), name) === "pdf");
}

console.log("\n== 2. the English document still reads exactly as it did ==");
{
  const { out, text } = textOf("browser-print.pdf");
  check("two pages", out.pageCount === 2);
  check("the heading is one word, not split", text.includes("Trading Strategy"));
  check("the body is there", text.includes("moving average crossover"));
  check("and page two", text.includes("Page Two"));
}

console.log("\n== 3. Greek, Chinese and Arabic survive the same document ==");
{
  const { text } = textOf("multilingual.pdf");
  check("Greek", text.includes("\u039B\u03B1\u03B4\u03AC\u03B4\u03B9\u03BA\u03B1"));
  check("Chinese", text.includes("\u96C5\u5178\u7684\u5496\u5561\u9986"));
  check("the euro sign", text.includes("\u20AC"));
  check("combining accents", text.includes("\u00FCn\u00EFc\u00F6d\u00E9"));
  check("no UTF-16 BOM was stored", !text.includes("\uFEFF"));
  check("no presentation forms were stored", !/[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text));
  check("Arabic reads as real words", text.includes("\u0627\u0644\u0645\u0642\u0647\u0649") && text.includes("\u0623\u062B\u064A\u0646\u0627"));
}

console.log("\n== 4. an Arabic-only document, headings included ==");
{
  const { text } = textOf("arabic-only.pdf");
  // The heading is a DIFFERENT subset font from the body - the one that
  // exposed the raw-byte defect.
  check("the heading decodes", text.includes("\u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A"));
  check("and the second heading", text.includes("\u062A\u0642\u0631\u064A\u0631"));
  check("the body decodes", text.includes("\u0625\u064A\u0631\u0627\u062F\u0627\u062A") && text.includes("\u0627\u0644\u0639\u0642\u062F"));
  check("no mojibake run of high-latin1 bytes", !/[\u00A0-\u00FF]{2,}/.test(text));
  check("no glyph ids left as text", !/[\u00FE\u00FF]/.test(text));
}

console.log("\n== 5. a scan is REFUSED, by name ==");
{
  let message = "";
  try {
    extract.extractText(read("scanned-no-text-layer.pdf"), "pdf");
  } catch (err) {
    message = err.message;
  }
  check("it is refused", message.length > 0);
  check("it says there is no text layer", /no text layer/.test(message));
  check("and names OCR as the remedy", /OCR/.test(message));
  check("without blaming the user's file", !/invalid|corrupt|bad file/i.test(message));
}

console.log("\n== 6. nothing unstorable reaches the database ==");
for (const name of ["browser-print.pdf", "multilingual.pdf", "arabic-only.pdf"]) {
  const { text } = textOf(name);
  check(`${name}: no NUL`, !text.includes("\u0000"));
  check(`${name}: no lone surrogate`, text.isWellFormed ? text.isWellFormed() : true);
}

console.log("\n== 7. a ToUnicode byte-order mark is not text ==");
// NOT the cause of anything observed here — checked against the
// decompressed CMaps of all four fixtures, none of which uses a BOM. It
// is what the format permits, so it is handled and it is tested rather
// than left as an untested branch.
{
  const { parseHexString } = pdf;
  check("a plain UTF-16BE value decodes", parseHexString("0645") === "\u0645");
  check("a BOM-prefixed value decodes to the same letter", parseHexString("FEFF0645") === "\u0645");
  check("a BOM in the middle is dropped too", parseHexString("0645FEFF0642") === "\u0645\u0642");
  check("an empty value is empty", parseHexString("") === "");
}

console.log("\n== 8. the RTL repair only touches RTL ==");
{
  const repair = extract.repairRightToLeftText;
  check("a Latin line is returned untouched", repair("Revenue was 40k in March") === "Revenue was 40k in March");
  check("a Greek line is untouched", repair("\u0397 \u03BA\u03B1\u03C6\u03B5\u03C4\u03AD\u03C1\u03B9\u03B1 \u03C3\u03C4\u03B1 \u039B\u03B1\u03B4\u03AC\u03B4\u03B9\u03BA\u03B1") === "\u0397 \u03BA\u03B1\u03C6\u03B5\u03C4\u03AD\u03C1\u03B9\u03B1 \u03C3\u03C4\u03B1 \u039B\u03B1\u03B4\u03AC\u03B4\u03B9\u03BA\u03B1");
  check("Arabic already in logical order is untouched", repair("\u0645\u0631\u062D\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645") === "\u0645\u0631\u062D\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645");
  const mixed = "The word \uFECE\uFEE7\uFEF4\uFE9B\uFE83 appears here";
  check("a mostly-Latin line keeps its order", repair(mixed).startsWith("The word"));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
