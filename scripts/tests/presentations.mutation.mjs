#!/usr/bin/env node
/*
 * CAN presentations.test.mjs TELL A DECK GENERATOR FROM A CLAIM OF ONE?
 *
 * Every clause in the gate that could pass over a broken feature is put
 * to the test here: a bound the parser stops applying, a photo that ships
 * without its photographer, a hold sized from the brief instead of the
 * slides, a stopped run that keeps the hold, an unusable answer that is
 * refunded as if the tokens were free, a .pptx with no speaker notes, a
 * PDF laid out in the interface's font order instead of the deck's, and
 * the row sliding back into hiding in the sidebar. And the gate going
 * blind: the locale list shrinking to one.
 *
 * Run: node scripts/tests/presentations.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/presentations.test.mjs";
const DECK = "src/lib/presentations/deck.ts";
const PROMPT = "src/lib/presentations/prompt.ts";
const GENERATE = "src/lib/presentations/generate.ts";
const PPTX = "src/lib/presentations/pptx.ts";
const PDF = "src/lib/pdf/deck.tsx";
const ROUTE = "src/app/api/presentations/generate/route.ts";
const NAV = "src/lib/sidebar-nav.ts";
const EN = "messages/en.json";
const ZH = "messages/zh.json";

const TARGETS = [GATE, DECK, PROMPT, GENERATE, PPTX, PDF, ROUTE, NAV, EN, ZH];

const MUTANTS = [
  // ---- the contract ------------------------------------------------
  {
    name: "the parser stops cutting the deck at MAX_SLIDES",
    file: DECK,
    from: "    if (slides.length >= MAX_SLIDES) break;",
    to: "    if (slides.length >= MAX_SLIDES * 2) break;",
    expect: "a twenty-first slide is dropped",
  },
  {
    name: "a seventh bullet survives",
    file: DECK,
    from: "      .slice(0, MAX_BULLETS);",
    to: "      .slice(0);",
    expect: "the parser drops a seventh bullet",
  },
  {
    name: "an Unsplash photo ships without its photographer",
    file: DECK,
    from: "    if (!url || !photographerName || !photographerUrl || !downloadLocation) return null;",
    to: "    if (!url) return null;",
    expect: "an unattributed Unsplash photo is refused",
  },
  {
    name: "the same own photo is handed to every slide",
    file: DECK,
    from: "      const path = queue[next++];",
    to: "      const path = queue[next];",
    expect: "own photos are handed out in order and never twice",
  },
  // ---- the call ------------------------------------------------------
  {
    name: "the tool is offered, not forced",
    file: GENERATE,
    from: '        tool_choice: { type: "tool", name: "write_deck" },\n',
    to: "",
    expect: "the deck call forces the write_deck tool",
  },
  {
    name: "the brief is pasted unfenced",
    file: PROMPT,
    from: "${UNTRUSTED_OPEN}\n${description",
    to: "${description",
    expect: "the brief is fenced as data",
  },
  {
    name: "the stop button no longer reaches the provider",
    file: GENERATE,
    from: "      { signal: params.signal }",
    to: "      {}",
    expect: "the stop button reaches the provider call",
  },
  {
    name: "usage is recorded only after a successful parse",
    file: GENERATE,
    from: '  params.costs.record("generation", response.usage, response.model || PRESENTATION_MODEL);\n',
    to: "",
    expect: "usage is recorded before the deck is parsed",
  },
  // ---- the route -----------------------------------------------------
  {
    name: "the hold is sized from the brief alone",
    file: ROUTE,
    from: "        inputChars: deckEstimateInputChars(description.length, slideCount),",
    to: "        inputChars: description.length,",
    expect: "the hold is sized per slide asked for",
  },
  {
    name: "a stopped run keeps the hold",
    file: ROUTE,
    from: '      // did this, and "failed" would be the wrong word for it.\n      await releaseReservation(user.id, reservationId);\n',
    to: '      // did this, and "failed" would be the wrong word for it.\n',
    expect: "a stopped run releases the hold",
  },
  {
    name: "an unusable answer is refunded as if the tokens were free",
    file: ROUTE,
    from: "      const settlement = await settleReservation({\n        userId: user.id,\n        reservationId,\n        feature: \"presentation_generate\",\n        costs,\n        plan,\n        bypassCharge: bypass,\n        metadata: { slideCount, imageSource, outcome: outcome.kind },\n      });",
    to: "      await releaseReservation(user.id, reservationId);\n      const settlement = { creditsCharged: 0 };",
    expect: "an unusable answer still settles",
  },
  {
    name: "an own-photo path outside the person's folder is accepted",
    file: ROUTE,
    from: "  if (ownImagePaths.some((p) => !p.startsWith(`${user.id}/`))) {",
    to: "  if (ownImagePaths.some((p) => !p.startsWith(`${user.id}`))) {",
    expect: "own-photo paths must be under the person's own folder",
  },
  // ---- the exports ---------------------------------------------------
  {
    name: "speaker notes are dropped from the .pptx",
    file: PPTX,
    from: "    if (slide.notes) target.addNotes(slide.notes);\n",
    to: "",
    expect: "speaker notes are written into the .pptx",
  },
  {
    name: "the PDF is laid out in one fixed font order",
    file: PDF,
    from: "  const fontFamily = pdfFontFamily(deck.locale);",
    to: '  const fontFamily = pdfFontFamily("en");',
    expect: "the PDF derives the family from the deck's language",
  },
  // ---- the sidebar and the copy --------------------------------------
  {
    name: "the row slides back into hiding",
    file: NAV,
    from: '        icon: MODULE_ICONS.presentations,\n        hintKey: "presentations",\n      },',
    to: '        icon: MODULE_ICONS.presentations,\n        hintKey: "presentations",\n        hidden: true,\n      },',
    expect: "the row is drawn under Make",
  },
  {
    name: "the English hint disclaims the generator again",
    file: EN,
    from: '"presentations": "Describe a deck and get the slides — PowerPoint or PDF, with photos from Unsplash or your own. It draws no charts."',
    to: '"presentations": "Describe a deck and get the slides — PowerPoint or PDF, with photos from Unsplash or your own. It does not create slides."',
    expect: "en: the hint no longer disclaims the generator",
  },
  {
    name: "a Chinese absence loses its key",
    file: ZH,
    from: '"no_charts": "不绘制图表或表格。',
    to: '"no_chartsX": "不绘制图表或表格。',
    expect: "no_charts: present in all ten locales",
  },
  // ---- the gate going blind -------------------------------------------
  {
    name: "the gate reads one locale and calls it ten",
    file: GATE,
    from: 'const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];',
    to: 'const LOCALES = ["en"];',
    expect: "ten locales were read",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("presentations mutations\n");

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
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => !originals.get(e.file).includes(e.from));
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
    if ([...byFile.entries()].every(([file, text]) => text === originals.get(file))) {
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
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `the gate went red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
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
console.log("Every clause of the gate is load-bearing.");
