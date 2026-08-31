#!/usr/bin/env node
/*
 * CAN pdf-font-stack.test.mjs ACTUALLY TELL A COMPLETE FONT STACK FROM A
 * SHORT ONE?
 *
 * The failure it guards is silent by construction: @react-pdf given a family
 * that lacks the character draws the glyph at that id in the font it DOES
 * have, so a stack missing its Chinese face produces "N:" where "华为" should
 * be — a document that looks finished and is unreadable. Nobody reports that
 * as a bug; they conclude the app does not support their language.
 *
 * So the gate is mutated where it would matter:
 *
 *   THE STACK        a family removed from FONT_STACK in fonts.ts, which is
 *                    the change a refactor makes. The gate must go red.
 *   THE FACES        a face removed, so a family in the stack has nothing
 *                    behind it.
 *   THE GATE ITSELF  each clause of the check, so a clause that does
 *                    nothing is reported as doing nothing.
 *
 * Every mutation is applied to a REAL source file and the gate is run
 * against it, so a mutation that the gate does not notice is a hole in the
 * gate rather than an opinion about one.
 *
 * Run: node scripts/tests/pdf-font-stack.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/pdf-font-stack.test.mjs";
const FONTS = "src/lib/pdf/fonts.ts";
const STACK_TS = "src/lib/pdf/font-stack.ts";
const DOCUMENT = "src/lib/pdf/document.tsx";
const RENDER = "src/lib/pdf/render.ts";
const ROUTE = "src/app/api/documents/[id]/pdf/route.ts";
const EDITOR = "src/components/documents/document-editor.tsx";
const BUTTON = "src/components/ui/download-pdf-button.tsx";

const TARGETS = [GATE, FONTS, STACK_TS, DOCUMENT, RENDER, ROUTE, EDITOR, BUTTON];

const MUTANTS = [
  // ---- the thing the owner asked for by name ------------------------
  {
    name: "the Chinese face is dropped from FONT_STACK",
    file: STACK_TS,
    from: 'export const FONT_STACK = ["Inter", "NotoSansSC", "NotoSansArabic"] as const;',
    to: 'export const FONT_STACK = ["Inter", "NotoSansArabic"] as const;',
  },
  {
    name: "the Arabic face is dropped from FONT_STACK",
    file: STACK_TS,
    from: 'export const FONT_STACK = ["Inter", "NotoSansSC", "NotoSansArabic"] as const;',
    to: 'export const FONT_STACK = ["Inter", "NotoSansSC"] as const;',
  },
  {
    name: "the stack collapses to one family",
    file: STACK_TS,
    from: 'export const FONT_STACK = ["Inter", "NotoSansSC", "NotoSansArabic"] as const;',
    to: 'export const FONT_STACK = ["Inter"] as const;',
  },
  {
    name: "a family in the stack is pointed at the wrong face file",
    file: STACK_TS,
    from: '    family: "NotoSansSC",\n    file: "NotoSansSC.ttf",\n    weight: 400,\n    style: "normal",',
    to: '    family: "NotoSansSC",\n    file: "Inter.ttf",\n    weight: 400,\n    style: "normal",',
  },
  // ---- a route that decides its own font ----------------------------
  {
    name: "the shared document sets a literal family instead of the stack",
    file: DOCUMENT,
    from: "      fontFamily,\n      fontSize: 11,",
    to: '      fontFamily: "Inter",\n      fontSize: 11,',
  },
  {
    name: "a route stops rendering through pdfResponse",
    file: ROUTE,
    from: "    return await pdfResponse(element, { filename: title, fallbackName: \"document\" });",
    to: "    return NextResponse.json({ element: String(element) });",
  },
  {
    name: "pdfResponse stops registering the fonts",
    file: RENDER,
    from: "  registerPdfFonts();",
    to: "  void registerPdfFonts;",
  },
  // ---- the gate's own clauses ---------------------------------------
  {
    name: "the round trip never compares what came back",
    file: GATE,
    from: "  return [...new Set([...wanted].filter((c) => c.trim()))].filter((c) => !have.has(c));",
    to: "  void have;\n  return [];",
  },
  {
    // TWO EDITS, because one proves nothing. A gate that restates the stack
    // is indistinguishable from one that reads it — until the real stack
    // changes underneath it. Both happen here, and the gate must still see
    // the Chinese face go missing.
    name: "the gate restates the stack AND the real stack loses its Chinese face",
    edits: [
      {
        file: GATE,
        from: "const STACK = PDF_FONT_FAMILY ?? [];",
        to: 'const STACK = ["Inter", "NotoSansSC", "NotoSansArabic"];',
      },
      {
        file: STACK_TS,
        from: 'export const FONT_STACK = ["Inter", "NotoSansSC", "NotoSansArabic"] as const;',
        to: 'export const FONT_STACK = ["Inter", "NotoSansArabic"] as const;',
      },
    ],
  },
  {
    // Likewise: the red-proof in section 5 is what makes section 4 mean
    // anything, and section 4 is what makes section 5 mean anything. Break
    // the comparison and excuse the red-proof at the same time and every
    // check passes over nothing.
    name: "the round trip compares nothing AND the red-proof is excused",
    edits: [
      {
        file: GATE,
        from: "  return [...new Set([...wanted].filter((c) => c.trim()))].filter((c) => !have.has(c));",
        to: "  void have;\n  return [];",
      },
      {
        file: GATE,
        from: '    "with a single family, Chinese does not survive",\n    lostChinese.length > 0,',
        to: '    "with a single family, Chinese does not survive",\n    true,',
      },
      {
        file: GATE,
        from: '  ok("...and neither does Arabic", lostArabic.length > 0, JSON.stringify(crippled.slice(0, 120)));',
        to: '  ok("...and neither does Arabic", true, JSON.stringify(crippled.slice(0, 120)));',
      },
    ],
  },
  // ---- the leading family, which sets every space -------------------
  {
    // The bug this whole section exists for: with Inter leading, every space
    // in an Arabic paragraph is set in Inter and the line is cut into a
    // separate shaping run at every word boundary. Measured against
    // Chromium: 0.833 / 0.897 / 0.909 / 0.902, against 0.973 / 0.948 /
    // 0.986 / 0.983 with the Arabic face leading.
    name: "the stack stops varying by locale, so Latin leads for Arabic too",
    file: STACK_TS,
    from: '  const lang = String(locale ?? "")',
    to: '  const lang = "en" || String(locale ?? "")',
  },
  {
    name: "Arabic keeps the Latin face in front of its own",
    file: STACK_TS,
    from: '    return ["NotoSansArabic", "NotoSansSC", "Inter"];',
    to: '    return ["Inter", "NotoSansArabic", "NotoSansSC"];',
  },
  {
    name: "the shared document takes a constant stack instead of the document's language",
    file: DOCUMENT,
    from: "  const fontFamily = pdfFontFamily(locale);",
    to: "  const fontFamily = pdfFontFamily(null);",
  },
  // ---- the download has to be reachable ----------------------------
  {
    name: "the documents editor loses its download button",
    file: EDITOR,
    from: '            <DownloadPdfButton href={`/api/documents/${doc.id}/pdf`} fallbackName="document" />\n',
    to: "",
  },
  {
    name: "a button points at a route that does not exist",
    file: EDITOR,
    from: "<DownloadPdfButton href={`/api/documents/${doc.id}/pdf`}",
    to: "<DownloadPdfButton href={`/api/documents/${doc.id}/export`}",
  },
  {
    // The blob keeps application/pdf, so every browser renders it in its
    // own viewer instead of saving it — the exact "opens in a text editor
    // instead of downloading" report that export-data-button.tsx already
    // paid for once.
    name: "the blob is not forced to octet-stream, so the PDF opens instead of downloading",
    file: BUTTON,
    from: 'const blob = new Blob([raw], { type: "application/octet-stream" });',
    to: "const blob = raw;",
  },
  {
    name: "every file is excused as another renderer, not the one that uses one",
    file: GATE,
    from: '  const usesOtherRenderer = (code) => /\\bImageResponse\\b/.test(code) || /from "next\\/og"/.test(code);',
    to: "  const usesOtherRenderer = () => true;",
  },
  {
    name: "the other-renderer exemption stops earning itself",
    file: GATE,
    from: '  const usesOtherRenderer = (code) => /\\bImageResponse\\b/.test(code) || /from "next\\/og"/.test(code);',
    to: "  const usesOtherRenderer = () => false;",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, out: "" };
  } catch (e) {
    return { green: false, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

console.log("pdf-font-stack mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log("\nBASELINE IS RED — no mutation result below would mean anything.\n" + base.out.slice(-800));
    process.exit(1);
  }

  for (const m of MUTANTS) {
    // SOME CLAUSES ONLY MATTER TOGETHER. A gate that restates the font stack
    // instead of reading it is not wrong on a healthy tree — it is wrong the
    // day the real stack changes, which is a SECOND edit. A mutant that
    // makes only the first change proves nothing, so a mutant may carry a
    // list of edits and they are applied at once.
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => {
      const source = originals.get(e.file);
      return !source.includes(e.from);
    });
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      byFile.set(e.file, current.replace(e.from, e.to));
    }
    const noop = [...byFile.entries()].every(([file, text]) => text === originals.get(file));
    if (noop) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (!result.green) {
      caught++;
      const which = (result.out.match(/^ {2}- (.+)$/m) ?? [])[1] ?? "a check went red";
      console.log(`  CAUGHT  ${m.name}\n          -> ${which}`);
    } else {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
    }
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
