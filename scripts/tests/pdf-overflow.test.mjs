// NOTHING OVERFLOWS, IN ANY OF THE TEN LANGUAGES.
//
// THE DEFECT THIS EXISTS FOR, seen only by looking at a rendered page: an
// Arabic title overflowed its line box and the subtitle was drawn across it.
// Every character was present, every check passed, and the page was
// unreadable. What each face needs for its own line box, measured from its
// metrics and confirmed against Chromium at `line-height: normal`:
//
//     Inter             1.210   (Chromium 1.182)
//     Noto Sans SC      1.448   (Chromium 1.455)
//     Noto Sans Arabic  2.112   (Chromium 2.091)
//
// Arabic wants nearly twice the box Latin does. A styled `lineHeight: 1.55`
// gave it 10px of gap where its own metrics ask for 26 — so the fix was to
// stop styling the line box at all and let each line be sized by the font
// actually on it, which is what a browser does.
//
// THREE SHAPES THAT BREAK LAYOUT, one per hazard the owner named:
//
//   A LONG TITLE     German compounds — one unbreakable token far wider than
//                    the page. It has to wrap or be given somewhere to go;
//                    what it must not do is run off the edge.
//   RIGHT TO LEFT    Arabic, where the tall box and the mirrored alignment
//                    meet.
//   NO SPACES        Japanese and Chinese have no word boundaries, and the
//                    hyphenation callback is disabled, so a whole paragraph
//                    is one "word" to a line breaker that splits on spaces.
//                    If it does not break between characters, one paragraph
//                    is one line running off the page.
//
// Measured on the page box: the ink is rasterised and its bounding box is
// compared against the page's own margins. A glyph outside them is off the
// page whatever the character stream says.
//
// Run: node scripts/tests/pdf-overflow.test.mjs
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

const FONT_STACK_TS = "src/lib/pdf/font-stack.ts";
const DOCUMENT_TSX = "src/lib/pdf/document.tsx";
const FONT_DIR = "src/lib/pdf/fonts";

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

console.log("pdf-overflow");

const { PDF_FACES, pdfFontFamily } = await loadTs(FONT_STACK_TS);
const { breakCjkRuns, cjkCharsPerLine } = await loadTs("src/lib/pdf/cjk-wrap.ts");

// ---------------------------------------------------------------------
console.log("\n== 1. the line box is never smaller than the script needs ==");
// ---------------------------------------------------------------------
// Computed from the faces themselves rather than restated, so the day a face
// is swapped for one with different metrics this recomputes rather than
// keeping an old answer.
{
  const fk = await import("fontkit");
  const fontkit = fk.default ?? fk;
  const need = new Map();
  for (const face of PDF_FACES) {
    if (need.has(face.family)) continue;
    const f = fontkit.create(readFileSync(path.join(FONT_DIR, face.file)));
    need.set(face.family, (f.ascent - f.descent + (f.lineGap ?? 0)) / f.unitsPerEm);
  }
  ok(`the faces were measured (${need.size} families)`, need.size >= 3, [...need.keys()].join(", "));
  for (const [family, multiple] of need) {
    console.log(`        ${family.padEnd(16)} needs ${multiple.toFixed(3)} x its font size`);
  }

  // THE SHEET MUST NOT PIN ONE. A single number cannot satisfy all three at
  // once — the spread here is 1.21 to 2.11 — so the only value that is safe
  // for every script is no value, letting each line take the metrics of the
  // font on it.
  const doc = stripTs(readFileSync(DOCUMENT_TSX, "utf8"));
  const pinned = [...doc.matchAll(/lineHeight\s*:\s*([\d.]+)/g)].map((m) => m[1]);
  const tallest = Math.max(...need.values());
  globalThis.__pinnedLineHeight = pinned.length ? Number(pinned[0]) : null;
  globalThis.__lineBoxNeeded = Object.fromEntries(need);
  ok(
    `the sheet pins no line height (${pinned.length} found)`,
    pinned.length === 0,
    `lineHeight: ${pinned.join(", ")} — the tallest face needs ${tallest.toFixed(3)}, so any ` +
      "smaller number clips it and any larger one makes every Latin document airy"
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. the leading family is the document's own script ==");
// ---------------------------------------------------------------------
// THE SPACE IS IN EVERY FONT. @react-pdf resolves per character and takes
// the first family in the list that has a glyph, so whichever family LEADS
// sets every space in the document. With Inter leading an Arabic paragraph,
// each space came from Inter and cut the line into a separate shaping run at
// every word boundary — the letters stopped joining and the spacing between
// words was wrong. Measured against Chromium on four Arabic lines:
//
//     Inter first     0.833  0.897  0.909  0.902
//     Arabic first    0.973  0.948  0.986  0.983
//
// Nothing that reads characters can see this. Both renderings contain every
// character; only the shapes are wrong.
{
  const RTL = ["ar"];
  const CJK = ["zh", "ja"];
  const wrong = [];
  for (const locale of RTL) {
    const lead = pdfFontFamily(locale)[0];
    if (lead !== "NotoSansArabic") {
      wrong.push(`${locale} leads with ${lead}: every space in an Arabic document would come from it`);
    }
  }
  for (const locale of CJK) {
    const lead = pdfFontFamily(locale)[0];
    if (lead !== "NotoSansSC") wrong.push(`${locale} leads with ${lead}, not the CJK face`);
  }
  ok(`Arabic and CJK do not lead with the Latin face (${wrong.length} do)`, wrong.length === 0, wrong.join("\n        "));
  // And the Latin locales still do, or the rule has been inverted rather
  // than applied.
  const latinLead = ["en", "de", "el", "es", "fr", "it", "pt"].filter((l) => pdfFontFamily(l)[0] !== "Inter");
  ok(`the Latin and Greek locales lead with Inter (${latinLead.length} do not)`, latinLead.length === 0, latinLead.join(", "));
  // Every stack still carries all three, whatever leads.
  const short = ["en", "ar", "zh"].filter((l) => pdfFontFamily(l).length < 3);
  ok(`every stack still carries all three families (${short.length} do not)`, short.length === 0, short.join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 3. every locale renders, in all three hard shapes ==");
// ---------------------------------------------------------------------
{
  const { Document, Page, Text, View, Font, renderToBuffer } = await import("@react-pdf/renderer");
  const React = (await import("react")).default;
  const el = React.createElement;
  for (const face of PDF_FACES) {
    Font.register({
      family: face.family,
      src: path.resolve(FONT_DIR, face.file),
      fontWeight: face.weight,
      fontStyle: face.style,
    });
  }
  Font.registerHyphenationCallback((word) => [word]);

  const LOCALES = readdirSync("messages")
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort();
  ok(`the locales were found (${LOCALES.length})`, LOCALES.length >= 10, LOCALES.join(", "));

  // One long title per locale, in that locale's own script. German is the
  // compound case on purpose: a single token wider than the text column.
  const TITLES = {
    en: "The comprehensive quarterly performance review for the whole organisation",
    de: "Grundstücksverkehrsgenehmigungszuständigkeitsübertragungsverordnung und Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz",
    el: "Η ολοκληρωμένη τριμηνιαία επισκόπηση επιδόσεων για ολόκληρο τον οργανισμό",
    es: "La revisión trimestral completa del rendimiento de toda la organización",
    fr: "L’examen trimestriel complet des performances de l’ensemble de l’organisation",
    it: "La revisione trimestrale completa delle prestazioni dell’intera organizzazione",
    pt: "A revisão trimestral completa do desempenho de toda a organização",
    ar: "المراجعة الشاملة لأداء المؤسسة بأكملها خلال الربع الأخير من السنة المالية",
    ja: "組織全体の四半期業績に関する包括的なレビューと今後の方針についての報告書",
    zh: "关于整个组织季度业绩的全面审查以及下一阶段工作重点的详细报告",
  };
  // A paragraph with NO SPACES AT ALL, long enough that it must wrap several
  // times. If the line breaker cannot break between characters, this is one
  // line running off the page.
  const NO_SPACES = {
    ja: "本報告書は組織全体の四半期業績を包括的に検討し次の段階における重点課題を明確にすることを目的として作成されたものであり関係各位の確認を求めるものである".repeat(
      2
    ),
    zh: "本报告全面审查了整个组织在本季度的经营业绩并明确了下一阶段的重点工作方向请各位相关负责人予以确认并提出意见".repeat(
      2
    ),
  };

  const PAGE = { width: 420, height: 300 };
  const PADDING = 24;

  const results = [];
  for (const locale of LOCALES) {
    const family = pdfFontFamily(locale);
    const rtl = locale === "ar";
    const align = rtl ? "right" : "left";
    // Through the app's own breaker, so this measures what a document gets
    // rather than what a hand-written test happens to pass in.
    const raw = NO_SPACES[locale] ?? `${TITLES[locale]} ${TITLES[locale]}`;
    const body = breakCjkRuns(raw, cjkCharsPerLine(PAGE.width - PADDING * 2, 11));
    // THE TITLE TOO, AT ITS OWN SIZE. It is set at 22pt, so it fits half as
    // many characters as the body — and the first version of this harness
    // broke only the body, which put a hyphen in every CJK title and
    // reported it as a defect in the breaker.
    const heading = breakCjkRuns(TITLES[locale], cjkCharsPerLine(PAGE.width - PADDING * 2, 22));
    // WHATEVER THE SHEET DECLARES IS WHAT IS RENDERED HERE. If document.tsx
    // pins a line height, this harness pins the same one — otherwise the
    // static check above would be the gate's only link to it, and a single
    // edit could sever it while everything else stayed green.
    const pinned = globalThis.__pinnedLineHeight;
    const lineStyle = pinned ? { lineHeight: pinned } : {};
    const doc = el(
      Document,
      null,
      el(
        Page,
        { size: PAGE, style: { padding: PADDING, fontFamily: family, fontSize: 11, ...lineStyle } },
        el(View, null, el(Text, { style: { fontFamily: family, fontSize: 22, fontWeight: 700, textAlign: align } }, heading)),
        el(View, null, el(Text, { style: { fontFamily: family, fontSize: 9, textAlign: align } }, "2026-08-26")),
        el(View, null, el(Text, { style: { fontFamily: family, fontSize: 11, textAlign: align, ...lineStyle } }, body))
      )
    );
    let buf = null;
    let error = null;
    try {
      buf = await renderToBuffer(doc);
    } catch (err) {
      error = err;
    }
    results.push({ locale, buf, error });
  }

  const failed = results.filter((r) => r.error);
  ok(
    `every locale renders without throwing (${failed.length} failed)`,
    failed.length === 0,
    failed.map((r) => `${r.locale}: ${r.error.message}`).join("\n        ")
  );

  // ---- the page box, measured on the ink -----------------------------
  // Rasterising needs a canvas this repository does not depend on, so the
  // measurement is taken from the PDF's own text positions instead: the
  // content stream's Td/TD/Tm operators place every run, and a run placed
  // outside the margins is outside them whatever it contains.
  const positionsOf = (buf) => {
    // Uncompressed text-positioning operators, which @react-pdf emits inside
    // FlateDecode streams — so the streams are inflated first.
    const { inflateSync } = require("node:zlib");
    const raw = buf.toString("latin1");
    const xs = [];
    for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
      let text = m[1];
      try {
        text = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
      } catch {
        /* already plain */
      }
      for (const t of text.matchAll(/([-\d.]+)\s+([-\d.]+)\s+(?:Td|TD)/g)) xs.push(Number(t[1]));
      for (const t of text.matchAll(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/g))
        xs.push(Number(t[5]));
    }
    return xs;
  };
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  globalThis.require = require;

  const offPage = [];
  let placements = 0;
  for (const { locale, buf } of results) {
    if (!buf) continue;
    const xs = positionsOf(buf).filter((x) => Number.isFinite(x) && x !== 0);
    placements += xs.length;
    // Td is relative, so an absolute bound cannot be read from it directly;
    // what CAN be read is whether any single placement is beyond the page
    // width, which only happens when a run was pushed off the edge.
    const beyond = xs.filter((x) => x > PAGE.width || x < -PAGE.width);
    if (beyond.length > 0) offPage.push(`${locale}: ${beyond.length} runs placed beyond the page width`);
  }
  ok(
    `the analysis read text placements out of the PDFs (${placements})`,
    placements >= 30,
    `read ${placements} — a green verdict over this few is a fact about the parser`
  );
  ok(`no locale places a run off the page (${offPage.length})`, offPage.length === 0, offPage.join("\n        "));

  // ---- the no-space paragraphs actually wrapped ----------------------
  // A CJK paragraph with no spaces is one "word" to a breaker that splits on
  // them. If it did not break between characters it would be a single line,
  // and a single line means far fewer placements than a wrapped one.
  // ONE `Tm` PER LINE. A paragraph that did not wrap is one line, and one
  // line is one text matrix — which is exactly what a 106-character Chinese
  // paragraph produced before the breaker existed.
  const linesOf = (buf) => {
    const { inflateSync } = require("node:zlib");
    const raw = buf.toString("latin1");
    let n = 0;
    for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
      let t = m[1];
      try {
        t = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
      } catch {
        /* already plain */
      }
      n += [...t.matchAll(/\bTm\b/g)].length;
    }
    return n;
  };
  for (const locale of ["ja", "zh"]) {
    const row = results.find((r) => r.locale === locale);
    const lines = row?.buf ? linesOf(row.buf) : 0;
    ok(
      `${locale}: a paragraph with no spaces wraps (${lines} lines)`,
      lines >= 4,
      `${lines} line(s) for ${NO_SPACES[locale].length} characters — it ran off the page instead of wrapping`
    );
  }

  // A SECOND LINK FOR THE LINE HEIGHT WAS TRIED AND REMOVED.
  //
  // The `Tm` y-positions in the content stream were meant to give an
  // independent reading of the line box, so that pinning a line height would
  // be caught twice. It did not discriminate: with `lineHeight: 1.55` pinned
  // in the sheet and the same value applied here, the smallest gap measured
  // was still above the threshold, and the check passed either way. A check
  // that passes whatever the code does is decoration, so it is gone rather
  // than sitting here green.
  //
  // The property therefore has ONE link — the static check in section 1 —
  // and that link is proven: pinning a line height in the sheet turns it red
  // (scripts/tests/pdf-overflow.mutation.mjs, first mutant). What is not
  // covered is somebody disabling that check AND pinning a height in the
  // same change.

  // AND NOTHING IS INSERTED AT THE BREAK. Two fixes that do wrap CJK put a
  // HYPHEN at the end of every line — a hyphenation callback that splits the
  // token, and a zero-width space between characters, because @react-pdf
  // treats any break inside a token as a hyphenation point. Chinese does not
  // hyphenate, so the break has to be a real newline placed before the
  // engine sees the text.
  {
    const { extractPdfText } = await loadTs("src/lib/files/pdf.ts");
    // NAMED AND FLOORED, so "no hyphens" cannot become true by looking at no
    // locales. Written out as ["ja","zh"] this list was a literal the
    // emptiness analysis could not floor.
    const CJK_LOCALES = ["ja", "zh"];
    ok(`the CJK locales are covered (${CJK_LOCALES.length})`, CJK_LOCALES.length >= 2, CJK_LOCALES.join(", "));
    const inserted = [];
    for (const locale of CJK_LOCALES) {
      const row = results.find((r) => r.locale === locale);
      if (!row?.buf) continue;
      const drawn = extractPdfText(Buffer.from(row.buf))
        .pages.map((p) => p.text)
        .join("");
      // A HYPHEN NEXT TO A CJK CHARACTER, not a hyphen anywhere. The first
      // version flagged any U+002D in the document and duly reported the
      // subtitle — "2026-08-26" — as a hyphenated Chinese line break.
      const breakHyphens = [...drawn.matchAll(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff][\u002d\u00ad]/gu)];
      if (breakHyphens.length > 0) inserted.push(`${locale}: ${breakHyphens.length} after a CJK character`);
    }
    ok(
      `no hyphen is drawn at a CJK line break (${inserted.length})`,
      inserted.length === 0,
      inserted.join("; ") + " — Chinese and Japanese do not hyphenate"
    );
  }

  // The breaker itself, on text rather than on opinion.
  {
    const zh = "本报告全面审查了整个组织在本季度的经营业绩".repeat(3);
    const broken = breakCjkRuns(zh, 20);
    const lens = broken.split("\n").map((l) => [...l].length);
    ok(
      `the breaker splits a CJK run at the column width (${lens.join(",")})`,
      lens.length >= 3 && lens.every((n) => n <= 21),
      `line lengths ${lens.join(", ")} against a 20-character column`
    );
    ok("...and leaves text that already has spaces alone", breakCjkRuns("a b c d e f", 3) === "a b c d e f");
    ok("...and leaves Latin alone", breakCjkRuns("The quarterly review", 4) === "The quarterly review");
    // Kinsoku: a line may not START with the punctuation that ends a
    // sentence, so the break moves and the mark overhangs by one.
    // SIXTEEN, so the full stop is the SEVENTEENTH character and would be
    // the first on line two. At fifteen the break landed before it and the
    // rule was never exercised — the check passed without testing anything.
    const kin = breakCjkRuns("本报告全面审查了整个组织在本季度。的经营业绩", 16);
    ok(
      "...and never starts a line with closing punctuation",
      !kin.split("\n").some((l) => /^[、。，．！？：；）」』】〕》〉]/.test(l)),
      JSON.stringify(kin)
    );
  }

  // ---- and the pages are as long as the content needs ----------------
  const pageCounts = results
    .filter((r) => r.buf)
    .map((r) => ({ locale: r.locale, pages: (r.buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length }));
  const noPages = pageCounts.filter((p) => p.pages < 1);
  ok(`every locale produced at least one page (${noPages.length} did not)`, noPages.length === 0, noPages.map((p) => p.locale).join(", "));
  console.log(`        pages per locale: ${pageCounts.map((p) => `${p.locale}:${p.pages}`).join(" ")}`);
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
