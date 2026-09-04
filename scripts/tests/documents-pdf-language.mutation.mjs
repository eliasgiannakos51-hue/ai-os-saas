#!/usr/bin/env node
/*
 * CAN documents-pdf-language.test.mjs SEE THE PRICE DISAPPEARING, OR THE
 * CHARGE LANDING ON THE FREE PATH?
 *
 * Seven mutations, seven different clauses of the rule "a translation says
 * its price first and the plain download charges nothing":
 *
 *   1. the free path starts reserving              (route)
 *   2. the paid path settles before the PDF exists (route)
 *   3. a failed translation keeps the hold          (route)
 *   4. the estimate route prices a different action (estimate)
 *   5. the dialog enables Download before a price   (dialog)
 *   6. the list card loses its download             (list)
 *   7. a dropped title marker renames the file      (lib)
 *
 * Run: node scripts/tests/documents-pdf-language.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/documents-pdf-language.test.mjs";
const LIB = "src/lib/documents/translation.ts";
const ROUTE = "src/app/api/documents/[id]/pdf/route.ts";
const ESTIMATE = "src/app/api/documents/[id]/pdf-estimate/route.ts";
const DIALOG = "src/components/documents/document-pdf-button.tsx";
const LIST = "src/components/documents/documents-list.tsx";
const TARGETS = [GATE, LIB, ROUTE, ESTIMATE, DIALOG, LIST];

const MUTANTS = [
  {
    // 1. A reservation on the free path: the plain download would hold
    // credits for a document that costs nothing.
    name: "the free path reserves credits",
    file: ROUTE,
    from: "    if (lang === null || !needsTranslation(detectedLocale, lang)) {\n      const element",
    to: "    if (lang === null || !needsTranslation(detectedLocale, lang)) {\n      await reserveCredits(user.id, 1, \"document_translate\", {});\n      const element",
    expect: "...and reserves nothing",
  },
  {
    // 2. Settling before the blocks exist charges for a translation that
    // may turn out to be nothing.
    name: "the paid path settles before the translated blocks exist",
    file: ROUTE,
    from: "    const blocks = htmlToBlocks(translated.html);\n    if (blocks.length === 0) {",
    to: "    await settleReservation({ userId: user.id, reservationId, feature: \"document_translate\", costs, plan, bypassCharge: bypassCredits });\n    const blocks = htmlToBlocks(translated.html);\n    if (blocks.length === 0) {",
    expect: "only after the translated blocks exist",
  },
  {
    // 3. A failure that keeps the hold: the user paid for an error.
    name: "a failed translation no longer releases the hold",
    file: ROUTE,
    from: "      logApiError(\"/api/documents/[id]/pdf\", err, { stage: \"translate\", lang });\n      await releaseReservation(user.id, reservationId);",
    to: "      logApiError(\"/api/documents/[id]/pdf\", err, { stage: \"translate\", lang });",
    expect: "releases the hold on every failure",
  },
  {
    // 4. The quote and the charge drift: a price computed on one profile
    // and a hold sized on another.
    name: "the estimate prices a different action than the route reserves",
    file: ESTIMATE,
    from: '      "documentTranslate",',
    to: '      "textAction",',
    expect: "the estimate route uses the SAME action",
  },
  {
    // 5. A download that can be pressed while the price is still loading
    // is a charge nobody was told about.
    name: "the dialog enables Download before the price is known",
    file: DIALOG,
    from: "disabled={!ready}",
    to: "disabled={downloading}",
    expect: "the download button is disabled until the price is known",
  },
  {
    // 6. The report: no download on the list.
    name: "the list card loses its download",
    file: LIST,
    from: '<DocumentPdfButton documentId={doc.id} variant="menuItem" onActivate={close} />',
    to: "",
    expect: "the list card menu offers the download",
  },
  {
    // 7. A lost marker becomes a renamed file.
    name: "a dropped title marker takes the first heading as the title",
    file: LIB,
    from: "  if (!m) return { title: fallbackTitle, html: cleaned };",
    to: "  if (!m) return { title: cleaned.replace(/<[^>]+>/g, \"\").trim().slice(0, 40) || fallbackTitle, html: cleaned };",
    expect: "a dropped marker keeps the ORIGINAL title",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("documents-pdf-language mutations\n");

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
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause in documents-pdf-language.test.mjs is load-bearing.");
