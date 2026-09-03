// GREEK, CHINESE AND ARABIC IN ONE PARAGRAPH, THROUGH THE REAL PDF PIPELINE.
//
// V4.6: "A document with Greek + 中文 + عربي in one paragraph. Download it.
// Are all three right?" The three scripts break three different things —
// Greek is Latin-adjacent, Han has no spaces to break at, Arabic joins and
// runs right to left — and each is served by a different face in
// lib/pdf/font-stack.ts. A document that mixes them on one line is where
// a font fallback that works per-document fails per-run.
//
// THE REAL PIPELINE, NOT A COPY OF IT. htmlToBlocks (what the route parses
// the stored HTML with), PdfDocument (the component the route renders),
// renderToBuffer with the app's own registered faces. pdf-overflow.test.mjs
// hand-builds its document because *.test.mjs may not write into
// node_modules; this is an .itest.mjs so it can load the real component.
//
// WHAT IS ASSERTED, and how:
//   1. it renders — no throw, a real PDF;
//   2. every word of all three scripts comes back out through the app's
//      own extractor (lib/files/pdf.ts) — a glyph the font did not have is
//      a notdef in the content stream and does not extract as the letter;
//   3. the three faces are all EMBEDDED in the file — a document that
//      reads correctly through one face is not this document;
//   4. the mixed paragraph wrapped onto more than one line and no run was
//      placed off the page.
//
// A rasterised PNG of page one is written to /tmp/pdf-mixed-scripts.png
// when PyMuPDF is installed (python3 -c "import fitz"), for a person to
// look at; its absence is noted, never a failure — the checks above do not
// depend on it.
//
// Run: node scripts/tests/pdf-mixed-scripts.itest.mjs
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loadTs, loadTsWithDeps } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const GREEK = "Η ομάδα παρέδωσε το έργο εγκαίρως";
const CHINESE = "团队按时交付了项目并收到了客户的确认";
const ARABIC = "وسلّم الفريق المشروع في موعده";
const TITLE = "Σύνοψη 项目 ملخص";
// ONE paragraph, all three, plus a heading and a list so the block kinds
// the editor produces are all exercised.
const HTML =
  `<h2>Τριμηνιαία ενημέρωση — 季度更新 — تحديث ربع سنوي</h2>` +
  `<p>${GREEK}, ${CHINESE}, ${ARABIC}. ` +
  `${GREEK} ${CHINESE} ${ARABIC} ${GREEK} ${CHINESE} ${ARABIC}.</p>` +
  `<ul><li>Ελληνικά: ${GREEK}</li><li>中文：${CHINESE}</li><li>العربية: ${ARABIC}</li></ul>`;

const { htmlToBlocks } = await loadTs("src/lib/pdf/blocks.ts");
const { resolveLanguage } = await loadTs("src/lib/text/resolve-language.ts");
const { PDF_FACES } = await loadTs("src/lib/pdf/font-stack.ts");
const doc = await loadTsWithDeps("src/lib/pdf/document.tsx");
const fonts = await loadTsWithDeps("src/lib/pdf/fonts.ts");
const { renderToBuffer } = await import("@react-pdf/renderer");
const React = (await import("react")).default;

console.log("== 1. the document renders ==");
const blocks = htmlToBlocks(HTML);
ok(`the HTML parsed into blocks (${blocks.length})`, blocks.length >= 5, String(blocks.length));
const text = blocks.map((b) => ("runs" in b ? b.runs.map((r) => r.text).join(" ") : "")).join(" ");
const locale = resolveLanguage(`${TITLE} ${text}`, "en");
console.log(`        detected document language: ${locale}`);

fonts.registerPdfFonts();
let buffer = null;
let renderError = null;
try {
  buffer = await renderToBuffer(React.createElement(doc.PdfDocument, { title: TITLE, subtitle: "2026-09-03", blocks, locale }));
} catch (err) {
  renderError = err;
}
ok("renderToBuffer produced a PDF", buffer !== null && buffer.subarray(0, 5).toString("latin1") === "%PDF-", renderError ? String(renderError.message) : "");
if (!buffer) {
  console.log(`\nFAILURES: ${pass} passed, ${failures.length} failed`);
  process.exit(1);
}
writeFileSync("/tmp/pdf-mixed-scripts.pdf", buffer);

console.log("\n== 2. every word of every script comes back out ==");
const { extractPdfText } = await loadTs("src/lib/files/pdf.ts");
const extracted = extractPdfText(buffer);
const flat = extracted.pages.map((p) => p.text).join("\n");
ok(`the extractor read text back (${flat.length} chars, ${extracted.pageCount} page)`, flat.length > 100);
const strip = (s) => s.replace(/\s+/g, "");
for (const [label, sample] of [["Greek", GREEK], ["Chinese", CHINESE]]) {
  const words = sample.split(/\s+/).filter((w) => w.length > 1);
  const missing = words.filter((w) => !strip(flat).includes(strip(w)));
  ok(`${label}: all ${words.length} words extract as themselves`, missing.length === 0, `missing: ${missing.join(" ")}`);
}
ok("the title's Greek and Chinese survive extraction", ["Σύνοψη", "项目"].every((w) => flat.includes(w)));
// ARABIC IS NOT CHECKED THROUGH THE EXTRACTOR, AND THAT IS A FINDING, NOT
// A PASS. lib/files/pdf.ts reads Arabic out of @react-pdf's own output as
// reversed, re-mapped letters ("ملخص" came back as "صخلمي") — the subset
// font's glyph order, not the text. The PNG shows the Arabic shaped and
// right-to-left; the extractor cannot. So Arabic is proven from the
// content stream instead: the glyphs drawn under the Arabic face are
// counted against the Arabic letters in the input. A run that fell back
// to another face, or to notdef boxes, draws nothing under that face.
const arabicLetters = [...(TITLE + " " + HTML)].filter((c) => /\p{Script=Arabic}/u.test(c) && !/[\u064B-\u0652\u0670]/.test(c)).length;
console.log(`        the extractor's Arabic read-back: ${JSON.stringify([...flat].filter((c) => /\p{Script=Arabic}/u.test(c)).join("").slice(0, 24))}… (known limitation, see comment)`);

console.log("\n== 3. all three faces are embedded, not one face standing in for three ==");
const raw = buffer.toString("latin1");
const baseFonts = [...raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-_,]+)/g)].map((m) => m[1].replace(/^[A-Z]{6}\+/, ""));
const distinct = [...new Set(baseFonts)];
console.log(`        embedded: ${distinct.join(", ")}`);
const families = [...new Set(PDF_FACES.map((f) => f.family))];
ok(`the stack declares three families (${families.join(", ")})`, families.length >= 3);
const present = families.filter((fam) => distinct.some((name) => name.toLowerCase().replace(/[^a-z]/g, "").includes(fam.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8))));
ok(`every family is embedded in this one document (${present.length}/${families.length})`, present.length === families.length,
  `present: ${present.join(", ")} — a family missing here means its script was drawn with the wrong glyphs or none`);

console.log("\n== 4. the Arabic was drawn with the Arabic face, the paragraph wrapped, nothing left the page ==");
{
  const { inflateSync } = await import("node:zlib");
  // Which content-stream font resource (/F3 …) is the Arabic face: the
  // page's /Font dictionary maps resource names to font objects, and the
  // font object carries the BaseFont.
  const objs = new Map();
  for (const m of raw.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) objs.set(m[1], m[2]);
  const arabicResources = new Set();
  for (const [, body] of objs) {
    for (const f of body.matchAll(/\/(F\d+)\s+(\d+) 0 R/g)) {
      const font = objs.get(f[2]) ?? "";
      if (/BaseFont\s*\/[A-Z]{6}\+NotoSansArabic|BaseFont\s*\/NotoSansArabic/.test(font)) arabicResources.add(f[1]);
    }
  }
  ok(`the Arabic face has a resource name on the page (${[...arabicResources].join(", ") || "none"})`, arabicResources.size > 0);
  const xs = [];
  let lines = 0;
  let arabicGlyphs = 0;
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let t = m[1];
    try { t = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"); } catch { /* plain */ }
    for (const p of t.matchAll(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/g)) { xs.push(Number(p[5])); lines++; }
    // Walk the operators: Tf selects a font, Tj/TJ draw hex glyph strings
    // (two bytes a glyph) under whichever font is current.
    let current = null;
    for (const op of t.matchAll(/\/(F\d+)\s+[-\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj|\[((?:<[0-9A-Fa-f]+>|[-\d.]+|\s)+)\]\s*TJ/g)) {
      if (op[1]) { current = op[1]; continue; }
      if (!arabicResources.has(current)) continue;
      const hex = op[2] ?? [...(op[3] ?? "").matchAll(/<([0-9A-Fa-f]+)>/g)].map((h) => h[1]).join("");
      arabicGlyphs += Math.floor(hex.length / 4);
    }
  }
  // The spaces, commas and diacritics INSIDE an Arabic run are drawn
  // with the Arabic face too, so the glyph count runs above the letter
  // count (measured: 157 glyphs for 119 letters). The floor is the
  // letters themselves — every one needs a glyph under this face — and
  // the ceiling is there so a parser that started double-counting would
  // be noticed. A run that fell back to another face draws nothing here.
  ok(`the Arabic letters were drawn with the Arabic face (${arabicGlyphs} glyphs for ${arabicLetters} letters)`,
    arabicGlyphs >= arabicLetters && arabicGlyphs <= arabicLetters * 1.6,
    "Arabic drawn with another face, or as notdef boxes");
  ok(`the paragraph and list wrapped onto several lines (${lines} text matrices)`, lines >= 8, String(lines));
  ok(`text runs were actually placed (${xs.length}, floor 10)`, xs.length >= 10);
  const beyond = xs.filter((x) => x > 595 || x < -595);
  ok(`no run is placed beyond the A4 width (${beyond.length})`, beyond.length === 0);
}

// The picture, for eyes — optional.
const raster = spawnSync("python3", ["-c",
  "import fitz,sys\nd=fitz.open('/tmp/pdf-mixed-scripts.pdf')\np=d[0].get_pixmap(dpi=110)\np.save('/tmp/pdf-mixed-scripts.png')\nprint('ok')"], { encoding: "utf8" });
console.log(raster.status === 0 ? "  ....  rasterised page one to /tmp/pdf-mixed-scripts.png" : "  ....  no PyMuPDF here — no PNG written (the checks above do not need it)");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
