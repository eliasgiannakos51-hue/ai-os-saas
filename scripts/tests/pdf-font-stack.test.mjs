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
const DOWNLOAD_BUTTON = "src/components/ui/download-pdf-button.tsx";
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
    // A LITERAL VALUE IS THE DEFECT, not the property name.
    //
    // The first version of this matched `fontFamily\s*:\s*(anything)`, which
    // was two things at once: it reported the TYPE ANNOTATION
    // `fontFamily: string[]` as a violation, and it stopped seeing the real
    // usage entirely once the styles were written as the shorthand
    // `fontFamily,`. Both directions wrong from one regex — noisy about
    // types, blind to values.
    //
    // What must never appear is a font NAME: a quoted string, alone or in an
    // array. `fontFamily,` (the shorthand) and `fontFamily: someVariable`
    // both take their value from pdfFontFamily(), which is the point.
    const rel = file.replace(/\\/g, "/");
    for (const m of code.matchAll(/\bfontFamily\b\s*[:,]/g)) {
      void m;
      occurrences++;
    }
    for (const m of code.matchAll(/\bfontFamily\s*:\s*(\[[^\]]*\]|"[^"]*"|'[^']*')/g)) {
      offenders.push(`${rel}: fontFamily: ${m[1].trim()}`);
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
  // AND THE ONE FILE THAT MAY DECIDE IT DERIVES IT FROM THE DOCUMENT.
  const documentSrc = stripTs(readFileSync(DOCUMENT_TSX, "utf8"));
  ok(
    "the shared document derives the family from the document's own language",
    /pdfFontFamily\s*\(\s*locale\s*\)/.test(documentSrc),
    "a constant stack here sets every space in the wrong font for one script or another"
  );
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
console.log("\n== 2b. every PDF route is reachable from the interface ==");
// ---------------------------------------------------------------------
// THE COMPLAINT THIS WHOLE FEATURE ANSWERS was "things the user can see and
// cannot take". A route with no button is exactly that, still — it just
// fails in a way that looks like success from the server side. So each PDF
// route has to be named by a component, and the name has to be the route's
// real path rather than something near it.
{
  const components = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) components.push(full);
    }
  };
  walk("src/components");
  walk("src/app");
  const ui = components.map((f) => stripTs(readFileSync(f, "utf8"))).join("\n");

  const routes = [];
  const walkApi = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkApi(full);
      else if (entry.name === "route.ts") routes.push(full);
    }
  };
  walkApi("src/app/api");
  const pdfRoutes = routes.map((r) => r.replace(/\\/g, "/")).filter((r) => r.includes("/pdf/"));

  // src/app/api/documents/[id]/pdf/route.ts must be called as
  // `/api/documents/${something}/pdf`. Matched as ONE pattern rather than
  // as a prefix and a suffix looked up separately: "/api/documents/" and
  // "/pdf" both appear all over the interface on their own, so checking for
  // them apart would report every route as reachable whatever was there.
  const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const unreachable = pdfRoutes.filter((route) => {
    const urlPath = route.replace("src/app", "").replace("/route.ts", "");
    const pattern = new RegExp(
      urlPath
        .split(/\/\[[^\]]+\]/)
        .map(escape)
        .join("/\\$\\{[^}]+\\}")
    );
    return !pattern.test(ui);
  });
  ok(
    `every PDF route has a button that calls it (${unreachable.length} do not)`,
    unreachable.length === 0,
    `${unreachable.join(", ")} — a route nothing calls is the same to the user as no route`
  );
  const buttons = [...ui.matchAll(/<DownloadPdfButton\b/g)].length;
  ok(
    `the download button is used (${buttons})`,
    buttons >= pdfRoutes.length,
    `${buttons} uses for ${pdfRoutes.length} routes`
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2c. the download actually downloads ==");
// ---------------------------------------------------------------------
// A PDF is the worst case for this. `res.blob()` inherits application/pdf
// from the response, Content-Disposition does not travel with a blob: URL,
// and every browser has a PDF viewer — so a blob left at its own type opens
// in the viewer instead of saving, on every browser, every time. That is
// "Export All Data opens in a text editor instead of downloading" again,
// and components/settings/export-data-button.tsx already paid for it once.
{
  const button = stripTs(readFileSync(DOWNLOAD_BUTTON, "utf8"));
  ok(
    "the blob is re-typed as application/octet-stream",
    /new Blob\(\s*\[[^\]]*\]\s*,\s*\{\s*type:\s*"application\/octet-stream"\s*\}\s*\)/.test(button),
    "a blob left at application/pdf opens in the browser's viewer instead of saving"
  );
  ok(
    "...and the object URL is revoked on a timer, not on the next line",
    /setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]{0,200}?revokeObjectURL/.test(button),
    "revoking synchronously after click() loses a race in Safari and Firefox"
  );
  // MATCHED ACROSS LINE BREAKS. `res.headers.get("Content-Disposition")` is
  // one expression, and the formatter is free to put the call on its own
  // line — which it did, and this check went red about a defect that was a
  // line break. The comments are stripped above, so the phrase found here is
  // the code's, not the documentation's.
  ok(
    "...and the filename comes from the route's own header",
    /headers\s*\.?\s*[\s\S]{0,40}?get\(\s*[\s\S]{0,20}?"Content-Disposition"/.test(button),
    "rebuilding it here would use the unsanitised title"
  );
  // And the routes send the header the filename is read from.
  const routes = [];
  const walkApi = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkApi(full);
      else if (entry.name === "route.ts") routes.push(full);
    }
  };
  walkApi("src/app/api");
  const renderSrc = stripTs(readFileSync(RENDER_TS, "utf8"));
  ok(
    "the shared renderer sends Content-Disposition: attachment",
    /"Content-Disposition":\s*`attachment;/.test(renderSrc),
    "without it a direct navigation to the route renders the PDF instead of saving it"
  );
  ok(
    "...and does not let a download be cached across users",
    /"Cache-Control":\s*"private, no-store"/.test(renderSrc),
    "one user's document served to the next one"
  );
  void routes;
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
const { PDF_FONT_FAMILY, PDF_FACES, pdfFontFamily } = await loadTs(FONT_STACK_TS);
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
console.log("\n== 3b. the family that comes FIRST matches the document's script ==");
// ---------------------------------------------------------------------
// THE SPACE IS IN EVERY FONT, and @react-pdf takes the first family in the
// list that has a glyph. So whichever family leads sets every space in the
// document — and a space set in the wrong font cuts an Arabic line into a
// separate shaping run at every word boundary. Measured against Chromium on
// four Arabic lines, with the metric that survives a two-pixel offset:
//
//     Inter first     0.833  0.897  0.909  0.902
//     Arabic first    0.973  0.948  0.986  0.983
//
// No coverage check can see this. Every character is present either way;
// only the shapes and the spacing are wrong, which is precisely what the
// person reading the document notices.
{
  const fk = await import("fontkit");
  const fontkit = fk.default ?? fk;
  const loaded = new Map();
  const faceFor = (family) => {
    if (!loaded.has(family)) {
      const face = FACES.find((f) => f.family === family && f.weight === 400 && f.style === "normal");
      loaded.set(family, face ? fontkit.create(readFileSync(path.join(FONT_DIR, face.file))) : null);
    }
    return loaded.get(family);
  };

  // One sample per locale this app ships, taken from its own message file so
  // the check cannot drift from what the app actually renders.
  const LOCALES = readdirSync("messages")
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort();
  ok(`the locales were found (${LOCALES.length})`, LOCALES.length >= 10, LOCALES.join(", "));

  const wrongLead = [];
  for (const locale of LOCALES) {
    const text = JSON.stringify(JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")));
    const letters = [...new Set([...text])].filter((c) => /\p{L}/u.test(c));
    const stack = pdfFontFamily(locale);
    const lead = faceFor(stack[0]);
    if (!lead) {
      wrongLead.push(`${locale}: leading family ${stack[0]} has no regular face`);
      continue;
    }
    // The leading family must carry the SPACE (it will set every one of
    // them) and the great majority of the locale's own letters.
    const covered = letters.filter((c) => lead.hasGlyphForCodePoint(c.codePointAt(0))).length;
    const share = letters.length === 0 ? 1 : covered / letters.length;
    if (!lead.hasGlyphForCodePoint(32)) wrongLead.push(`${locale}: ${stack[0]} has no space glyph`);
    if (share < 0.9) {
      wrongLead.push(
        `${locale}: ${stack[0]} leads but covers only ${(share * 100).toFixed(0)}% of its letters — ` +
          "every space in the document would be set in a font that is not this script's"
      );
    }
    // And the stack still has to be complete, whatever leads.
    const uncovered = letters.filter(
      (c) => !stack.some((family) => faceFor(family)?.hasGlyphForCodePoint(c.codePointAt(0)))
    );
    if (uncovered.length > 0) wrongLead.push(`${locale}: ${uncovered.length} letters covered by no family in the stack`);
  }
  ok(
    `each locale leads with its own script's font (${wrongLead.length} do not)`,
    wrongLead.length === 0,
    wrongLead.join("\n        ")
  );
  // And the orders really are different, or the function is a constant
  // wearing a parameter.
  const orders = new Set(LOCALES.map((l) => pdfFontFamily(l).join(",")));
  ok(
    `the stack actually varies by locale (${orders.size} distinct orders)`,
    orders.size >= 3,
    [...orders].join(" | ")
  );
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
