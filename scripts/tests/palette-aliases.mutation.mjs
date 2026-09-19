#!/usr/bin/env node
/*
 * CAN THE ALIAS GATE SEE THE REPORT COMING BACK?
 *
 * The report, from production on 2026-09-19: «θέλω να δω τα έσοδά μου»
 * and «οικο» in ⌘K, no results. «οικο» always worked. «έσοδα» never did
 * — nothing is called that — and neither did a sentence, in any
 * language, because every tier of the matcher compares the WHOLE query
 * with a candidate.
 *
 * Both halves of the fix are put back here as the defects they were,
 * plus the hole the gate was written around: a ratio with no negative
 * control. command-palette-language.test.mjs printed 520 of 520 with a
 * matcher that returned everything.
 *
 * Run: node scripts/tests/palette-aliases.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/palette-aliases.test.mjs";
const MATCH = "src/lib/command-palette-match.ts";
const ALIASES = "src/lib/palette-aliases.ts";
const PALETTE = "src/components/dashboard/command-palette.tsx";

const TARGETS = [GATE, MATCH, ALIASES, PALETTE];

const MUTANTS = [
  {
    // THE REPORT, HALF ONE. No aliases: «έσοδα» reaches nothing again.
    name: "the palette stops passing the aliases",
    file: PALETTE,
    from: '            ...aliasesFor(ITEM_LABEL_KEYS[item.label] ?? "", locale),',
    to: "            ...[],",
    expect: "passes the aliases as candidates",
  },
  {
    // THE REPORT, HALF TWO. A sentence matches nothing again.
    name: "the sentence fallback is removed",
    file: MATCH,
    from: "  for (const word of wordsByLength(rawQuery).slice(0, MAX_FALLBACK_WORDS)) {",
    to: "  for (const word of []) {",
    expect: 'reaches finance',
  },
  {
    // THE RULE THAT WAS WRONG BEFORE IT WAS RIGHT. The fallback first
    // returned the longest word's pages only; for a sentence naming
    // three things that is Products alone.
    name: "the fallback returns one word's pages instead of every word's",
    file: MATCH,
    from: "  const out: T[] = [];\n  const seen = new Set<T>();",
    to: "  const out: T[] = [];\n  const seen = new Set<T>();\n  if (out.length === 0) {\n    for (const w of wordsByLength(rawQuery)) {\n      const h = rank(w);\n      if (h.length > 0) return h;\n    }\n    return [];\n  }",
    expect: "reaches all three",
  },
  {
    name: "the fallback stops bounding how many words it tries",
    file: MATCH,
    from: "export const MAX_FALLBACK_WORDS = 8;",
    to: "export const MAX_FALLBACK_WORDS = 999;",
    expect: "words are ever tried",
  },
  {
    // The short-word guard. Without it «μου», «να», "my", "the" each
    // drag in whatever they happen to be a substring of.
    name: "short words become fallback queries",
    file: MATCH,
    from: "export const MIN_WORD_FALLBACK_LENGTH = 4;",
    to: "export const MIN_WORD_FALLBACK_LENGTH = 1;",
    expect: "a short word is never tried alone",
  },
  {
    // THE HOLE THE GATE WAS WRITTEN AROUND. A matcher that reaches
    // everything satisfies "every item is reachable by its own name".
    name: "the matcher reaches everything",
    file: MATCH,
    from: "  const whole = rank(rawQuery);\n  if (whole.length > 0) return whole;",
    to: "  return entries.map((e) => e.item);",
    expect: "reaches nothing",
  },
  {
    // An alias table pointing at items that do not exist. The gate reads
    // the real registry out of sidebar-nav.ts, so this cannot pass.
    name: "an alias is filed under an item the sidebar does not render",
    file: ALIASES,
    from: "export const PALETTE_ALIASES: PaletteAliases = {",
    to: 'export const PALETTE_ALIASES: PaletteAliases = {\n  noSuchItem: { en: ["nowhere"], el: ["πουθενά"] },',
    expect: "every alias key is an item the sidebar actually renders",
  },
  {
    // AND THE FLOOR. An empty table satisfies "every alias reaches its
    // own item" by having none — the shape CLAUDE.md records under
    // db-migrations' three scrapers.
    name: "the alias table is emptied",
    file: ALIASES,
    from: "export const PALETTE_ALIASES: PaletteAliases = {",
    to: "export const PALETTE_ALIASES: PaletteAliases = {};\nconst UNUSED_ALIASES: PaletteAliases = {",
    expect: "the table is not empty",
  },
  {
    // The coverage claim must match the table. Adding a locale the
    // file's own paragraph does not mention makes that paragraph false.
    name: "a locale appears in the table that the file does not admit to",
    file: ALIASES,
    from: '  finance: {\n    en: [',
    to: '  finance: {\n    ja: ["収益"],\n    en: [',
    expect: "the covered locales are exactly the ones the file claims",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]) };
  }
}

console.log("palette-aliases mutations\n");

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
    console.log(`\nBASELINE IS RED — nothing below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => !originals.get(e.file ?? m.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const file = e.file ?? m.file;
      const current = byFile.get(file) ?? originals.get(file);
      byFile.set(file, current.replace(e.from, () => e.to));
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
      missed.push({
        ...m,
        why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
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
