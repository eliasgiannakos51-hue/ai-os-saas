// EVERY PDF THIS APP PRODUCES CAN BE READ IN EVERY LANGUAGE IT SUPPORTS.
//
// THE DEFECT THIS EXISTS FOR, measured before it was written:
//
//   @react-pdf resolves a font per <Text>, not per character, and does not
//   fall back on its own. Given a family that lacks the character it does
//   NOT draw a blank box — it draws whatever glyph that id happens to be in
//   the font it was given. Set in Inter, "华为" comes out as "N:".
//
// Blank boxes get reported. Wrong letters do not: somebody downloads a
// document, cannot read it, and concludes the app does not really support
// their language. So this file checks two separate things, because either
// alone would pass while the feature was broken:
//
//   1. STATICALLY — no file in the app decides a font except the one that
//      owns the stack. A route that spelled `fontFamily: "Inter"` would
//      produce perfect Latin PDFs and quietly wrong Chinese ones.
//
//   2. BEHAVIOURALLY — a real PDF is rendered through the real engine with
//      the real face files, containing Greek, Chinese, Arabic and Latin in
//      ONE text run, and then read back with THIS APP'S OWN PDF extractor
//      (src/lib/files/pdf.ts). Every character that went in has to come out.
//
// The extractor returns Arabic in VISUAL order, because it reads the glyph
// sequence rather than running the bidi algorithm backwards. That is not a
// defect in either side, so the comparison is by CHARACTER SET: what matters
// here is that the glyphs came from a font that has them, which is exactly
// what the wrong-font failure destroys.
//
// Run: node scripts/tests/pdf-font-stack.test.mjs
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

const FONTS_TS = "src/lib/pdf/fonts.ts";
const FONT_STACK_TS = "src/lib/pdf/font-stack.ts";
const SELF = "scripts/tests/pdf-font-stack.test.mjs";
const DOCUMENT_TSX = "src/lib/pdf/document.tsx";
const RENDER_TS = "src/lib/pdf/render.ts";
const PDF_EXTRACTOR = "src/lib/files/pdf.ts";
const FONT_DIR = "src/lib/pdf/fonts";
const SRC = "src";

let pass = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const stripTs = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? "" : l))
    .join("\n");

console.log("pdf-font-stack");

// ---------------------------------------------------------------------
console.log("\n== 1. exactly one file decides the font ==");
// ---------------------------------------------------------------------
{
  const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  };
  const files = walk(SRC);
  ok(`the app's sources were scanned (${files.length})`, files.length >= 300, `found ${files.length}`);

  // `fontFamily` in a Tailwind class or a CSS file is the WEB font and has
  // nothing to do with this; only the PDF styles matter, and those live in
  // .ts/.tsx passed to @react-pdf's StyleSheet.
  // A DIFFERENT RENDERER IS NOT AN EXCEPTION TO THIS RULE — it is outside
  // it. src/app/opengraph-image.tsx sets a font for Next's ImageResponse,
  // which is satori drawing an SVG, not @react-pdf laying out a page; it
  // shares nothing with this except the property name. The file is
  // recognised by WHAT IT USES rather than by its path, so the day it stops
  // being an OG image and starts being something else, it comes back into
  // scope on its own.
  const usesOtherRenderer = (code) => /\bImageResponse\b/.test(code) || /from "next\/og"/.test(code);

  const offenders = [];
  const otherRenderers = [];
  let occurrences = 0;
  for (const file of files) {
    const code = stripTs(readFileSync(file, "utf8"));
    if (!/fontFamily\s*:/.test(code)) continue;
    if (usesOtherRenderer(code)) {
      otherRenderers.push(file.replace(/\\/g, "/"));
      continue;
    }
    for (const m of code.matchAll(/fontFamily\s*:\s*([^,\n}]+)/g)) {
      occurrences++;
      const value = m[1].trim();
      const rel = file.replace(/\\/g, "/");
      if (rel.endsWith(DOCUMENT_TSX) || rel.endsWith(FONTS_TS)) {
        // Inside the two files that are allowed to, the value still has to
        // be the shared constant — "Inter" written here is the same bug,
        // one file further in.
        if (!/PDF_FONT_FAMILY/.test(value)) offenders.push(`${rel}: fontFamily: ${value}`);
        continue;
      }
      offenders.push(`${rel}: fontFamily: ${value}`);
    }
  }
  ok(
    `the scan found font declarations to check (${occurrences})`,
    occurrences >= 8,
    `only ${occurrences} — a green verdict over this few is a fact about the regex`
  );
  ok(
    `no file sets a font family of its own (${offenders.length})`,
    offenders.length === 0,
    offenders.join("\n        ")
  );
  // AND THE EXEMPTION EARNS ITSELF. An empty list here would mean the
  // recogniser stopped matching, and every file it used to skip would be
  // silently back in scope — passing, because nothing was checked.
  ok(
    `the files skipped as another renderer really are one (${otherRenderers.length})`,
    otherRenderers.length >= 1 && otherRenderers.every((f) => /opengraph|icon|og/i.test(f)),
    otherRenderers.join(", ") || "none skipped — the ImageResponse recogniser matches nothing any more"
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. every PDF route goes through the shared renderer ==");
// ---------------------------------------------------------------------
{
  const routes = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") routes.push(full);
    }
  };
  walk("src/app/api");
  const pdfRoutes = routes.filter((r) => r.replace(/\\/g, "/").includes("/pdf/"));
  ok(`the PDF routes were found (${pdfRoutes.length})`, pdfRoutes.length >= 3, pdfRoutes.join(", "));

  const notShared = pdfRoutes.filter((r) => {
    const code = stripTs(readFileSync(r, "utf8"));
    return !/pdfResponse\s*\(/.test(code) || !code.includes("@/lib/pdf/render");
  });
  ok(
    `every PDF route renders through pdfResponse (${notShared.length} do not)`,
    notShared.length === 0,
    `${notShared.join(", ")} — registerPdfFonts runs there, and only there`
  );
  // And pdfResponse is what registers them, so a refactor that moved the
  // call out would leave every route shipping without fonts.
  const renderSrc = stripTs(readFileSync(RENDER_TS, "utf8"));
  ok("pdfResponse registers the fonts", /registerPdfFonts\s*\(\s*\)/.test(renderSrc));
}

// ---------------------------------------------------------------------
console.log("\n== 3. the stack and its faces, read from the source of truth ==");
// ---------------------------------------------------------------------
// IMPORTED, NOT PARSED. An earlier version of this file read FONT_STACK out
// of the source with a regex, and a mutation proved what that is worth: with
// the values restated here and the real stack then losing its Chinese face,
// every check below still passed. A gate that re-derives the value it is
// checking is checking its own copy.
//
// src/lib/pdf/font-stack.ts exists so this import is possible — it holds the
// data with no imports of its own, and fonts.ts does the registration.
const { PDF_FONT_FAMILY, PDF_FACES } = await loadTs(FONT_STACK_TS);
const STACK = PDF_FONT_FAMILY ?? [];
const FACES = PDF_FACES ?? [];
{
  ok("the stack was imported from the module, not re-read from its text", Array.isArray(STACK) && STACK.length > 0);
  // AND THIS FILE KEEPS NO COPY OF IT.
  //
  // The import above is the only thing tying this gate to what the app
  // actually uses, and a single edit can sever it: replace it with the same
  // three names written out, and every check below passes for ever, whatever
  // the app does. Measured — with the list restated here and the real stack
  // then losing its Chinese face, all twenty-two checks stayed green.
  //
  // So the families must not appear as literals in this file at all. Written
  // against the IMPORTED names rather than against a list of its own, for
  // exactly the reason it exists.
  const ownSource = stripTs(readFileSync(SELF, "utf8"));
  const restated = STACK.filter((family) => new RegExp(`["'\`]${family}["'\`]`).test(ownSource));
  ok(
    `this gate names none of the families itself (${restated.length})`,
    restated.length === 0,
    `${restated.join(", ")} written out in ${SELF} — a gate that restates what it checks is checking its own copy`
  );
  ok(`PDF_FONT_FAMILY is the whole stack (${STACK.join(", ")})`, STACK.length >= 3, `got ${STACK.length}`);
  ok(`every face is declared (${FACES.length})`, FACES.length >= 4, `got ${FACES.length}`);
  const missing = FACES.filter((f) => !existsSync(path.join(FONT_DIR, f.file)));
  ok(`every face file is in the repository (${missing.length} missing)`, missing.length === 0, missing.map((f) => f.file).join(", "));
  const unbacked = STACK.filter((family) => !FACES.some((f) => f.family === family));
  ok(`every family in the stack has a face (${unbacked.length} do not)`, unbacked.length === 0, unbacked.join(", "));
  const bytes = FACES.reduce((a, f) => a + statSync(path.join(FONT_DIR, f.file)).size, 0);
  console.log(`        ${FACES.length} faces, ${(bytes / 1024 / 1024).toFixed(2)} MB shipped with the function`);
}

// ---------------------------------------------------------------------
console.log("\n== 4. a real PDF, read back in every script ==");
// ---------------------------------------------------------------------
const SCRIPTS = {
  latin: "The quarterly report",
  greek: "Καλημέρα κόσμε",
  chinese: "本季度报告",
  arabic: "مرحبا بالعالم",
};
const SAMPLE = Object.values(SCRIPTS).join(" ");

/** Renders SAMPLE with the given families and returns the extracted text. */
async function roundTrip(families) {
  const { Document, Page, Text, Font, renderToBuffer } = await import("@react-pdf/renderer");
  const React = (await import("react")).default;
  const el = React.createElement;
  for (const face of FACES) {
    Font.register({ family: face.family, src: path.resolve(FONT_DIR, face.file) });
  }
  const doc = el(
    Document,
    null,
    el(Page, { size: "A4", style: { padding: 40 } }, el(Text, { style: { fontSize: 14, fontFamily: families } }, SAMPLE))
  );
  const buf = await renderToBuffer(doc);
  const { extractPdfText } = await loadTs(PDF_EXTRACTOR);
  const out = extractPdfText(Buffer.from(buf));
  return { text: out.pages.map((p) => p.text).join("\n"), bytes: buf.length };
}

/** Characters of `wanted` that never appear in `haystack`. */
const missingChars = (wanted, haystack) => {
  const have = new Set([...haystack]);
  return [...new Set([...wanted].filter((c) => c.trim()))].filter((c) => !have.has(c));
};

// THE COMPARATOR PROVES ITSELF, on literals, before it is trusted with a
// PDF. Section 5 below used to be the only thing standing behind it, and a
// mutation showed what that was worth: break this function and excuse
// section 5 in the same change, and every check passed over nothing.
ok("the comparator reports a character that is absent", missingChars("你", "abc").length === 1);
ok("...and reports none when it is present", missingChars("你", "a你c").length === 0);
ok("...and ignores whitespace", missingChars("a b", "ab").length === 0);

{
  const { text: extracted, bytes } = await roundTrip(STACK);
  console.log(`        rendered ${(bytes / 1024).toFixed(1)} KB from a ${(FACES.reduce((a, f) => a + statSync(path.join(FONT_DIR, f.file)).size, 0) / 1024 / 1024).toFixed(2)} MB font set`);
  for (const [name, sample] of Object.entries(SCRIPTS)) {
    const missing = missingChars(sample, extracted);
    ok(
      `${name} survives the round trip (${[...new Set([...sample].filter((c) => c.trim()))].length} characters)`,
      missing.length === 0,
      `never came back: ${missing.join(" ")}\n        extracted: ${JSON.stringify(extracted.slice(0, 160))}`
    );
  }
}

// ---------------------------------------------------------------------
console.log("\n== 5. the check can go red ==");
// ---------------------------------------------------------------------
// Everything above is "nothing is wrong", which is the shape a gate lies in.
// So the same document is rendered with ONLY the first family — the state a
// route that forgot the list would be in — and the non-Latin scripts must be
// reported as lost. If they are not, section 4 proves nothing.
{
  const { text: crippled } = await roundTrip([STACK[0]]);
  const lostChinese = missingChars(SCRIPTS.chinese, crippled);
  const lostArabic = missingChars(SCRIPTS.arabic, crippled);
  ok(
    "with a single family, Chinese does not survive",
    lostChinese.length > 0,
    `it came back anyway — section 4 would pass whatever the stack was: ${JSON.stringify(crippled.slice(0, 120))}`
  );
  ok("...and neither does Arabic", lostArabic.length > 0, JSON.stringify(crippled.slice(0, 120)));
  // And the Latin still does, so the failure above is about coverage rather
  // than about the render having collapsed.
  ok("...while Latin still does", missingChars(SCRIPTS.latin, crippled).length === 0, JSON.stringify(crippled.slice(0, 120)));
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
