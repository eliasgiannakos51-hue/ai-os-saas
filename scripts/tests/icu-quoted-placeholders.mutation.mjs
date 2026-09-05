#!/usr/bin/env node
/*
 * CAN icu-quoted-placeholders.test.mjs SEE THE STRING GO WRONG AGAIN?
 *
 * The defect was a string that LOOKS right. Each mutation below puts one
 * such string back, or takes away the rule that catches it, and the gate
 * must go red on the clause that names it.
 *
 * Run: node scripts/tests/icu-quoted-placeholders.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/icu-quoted-placeholders.test.mjs";
const EN = "messages/en.json";
const EL = "messages/el.json";
const BUILD_GATE = "scripts/check-i18n.js";
const TARGETS = [GATE, EN, EL, BUILD_GATE];

const MUTANTS = [
  {
    // 1. THE ORIGINAL DEFECT, in English. One doubled quote pair undone.
    name: "common.noMatches goes back to '{query}' in English",
    file: EN,
    // RE-ANCHORED 2026-09-06. This pointed at the doubled-apostrophe form
    // `''{query}''`; the catalogue uses typographic quotes, which is the
    // OTHER correct answer and the one the product settled on. The anchor
    // was left behind, so both of these mutants reported STALE — a
    // mutation suite that had stopped testing the thing it names, in the
    // gate whose whole subject is a string that silently means something
    // else. Found by running every suite in the foreground.
    from: `"noMatches": "No matches for \u201c{query}\u201d"`,
    to: `"noMatches": "No matches for '{query}'"`,
    expect: "en common.noMatches shows the query",
  },
  {
    // 2. THE SAME DEFECT IN GREEK — the scan must read every locale, not
    // the English source only.
    name: "common.noMatches goes back to '{query}' in Greek",
    file: EL,
    from: `\u00ab{query}\u00bb`,
    to: `'{query}'`,
    expect: "no locale wraps a placeholder in single quotes",
  },
  {
    // 3. THE BUILD GATE LOSES THE RULE, so the next such string ships.
    name: "the build gate stops failing on an escaped placeholder",
    file: BUILD_GATE,
    from: "const ESCAPED_PLACEHOLDER = /(^|[^'])'\\{[A-Za-z_]+\\}'(?!')/;",
    to: "const ESCAPED_PLACEHOLDER = /(?!)/;",
    expect: "the build gate carries the escaped-placeholder rule",
  },
  {
    // 4. THE BUILD GATE SCANS ONLY THE TRANSLATIONS, and English — the
    // source every translator copies — is where the defect was written.
    name: "the build gate stops scanning English",
    file: BUILD_GATE,
    from: 'for (const loc of ["en", ...LOCALES]) {',
    to: "for (const loc of LOCALES) {",
    expect: "...and it scans English too, not only the translations",
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

console.log("icu-quoted-placeholders mutations\n");

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
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"`,
      });
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
console.log("Every clause in icu-quoted-placeholders.test.mjs is load-bearing.");
