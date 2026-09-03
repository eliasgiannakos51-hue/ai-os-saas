#!/usr/bin/env node
/*
 * CAN website-negatives.test.mjs SEE A PROHIBITION THAT IS READ AND NOT
 * ENFORCED, A CAP THAT IS ASKED AND NOT APPLIED, A MAP LEFT AT A DISTRICT,
 * OR A REMOVAL NOBODY IS TOLD ABOUT?
 *
 * Twelve mutations, one per load-bearing clause, across the reader, the
 * enforcer, the cap, the maps, the worker and the workspace:
 *
 *   1. the Greek boundary goes back to ASCII \b (the original bug)   (lib)
 *   2. "χωρίς" stops being a negation                                 (lib)
 *   3. the adversative cut is dropped — "but keep the map" removes it (lib)
 *   4. our own design-brief block is read as the owner's words        (lib)
 *   5. the page-wrapper guard is dropped — the whole page is removed  (lib)
 *   6. the cap-th page counts as beyond the cap (> becomes >=)        (lib)
 *   7. normalisePages goes back to a silent break                     (pages)
 *   8. the stream no longer aborts at page cap+1                      (builder)
 *   9. a district zoom is accepted (floor 16 becomes 1)               (maps)
 *  10. the worker stops storing the notes                             (process)
 *  11. the worker enforces on the home page only                      (process)
 *  12. the workspace loses its panel                                  (ui)
 *
 * Run: node scripts/tests/website-negatives.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/website-negatives.test.mjs";
const LIB = "src/lib/website-negative-instructions.ts";
const PAGES = "src/lib/publishing/website-pages.ts";
const BUILDER = "src/lib/website-builder.ts";
const MAPS = "src/lib/website-map-embeds.ts";
const PROCESS = "src/app/api/websites/generate/process/route.ts";
const WORKSPACE = "src/components/website-builder/website-builder-workspace.tsx";
const TARGETS = [GATE, LIB, PAGES, BUILDER, MAPS, PROCESS, WORKSPACE];

const MUTANTS = [
  {
    name: "the negation boundary goes back to ASCII \\b — Greek negations vanish",
    file: LIB,
    from: 'const NOT_AFTER_WORD = "(?<![\\\\p{L}\\\\p{N}])";',
    to: 'const NOT_AFTER_WORD = "\\\\b";',
    expect: "the \\b-on-Greek bug",
  },
  {
    name: "'χωρίς' is no longer a negation",
    file: LIB,
    from: "|χωρίς|όχι|να μην",
    to: "|όχι|να μην",
    expect: "'χωρίς newsletter' alone is read",
  },
  {
    name: "the adversative cut is dropped, so 'but keep the map' forbids the map",
    file: LIB,
    from: "    const x = raw.split(ADVERSATIVE)[0].trim();",
    to: "    const x = raw.trim();",
    expect: "adversative: 'No booking but keep the map' forbids booking only",
  },
  {
    name: "our own design-brief block is read as the owner's words",
    file: LIB,
    from: "  return (header === -1 ? description : description.slice(0, header)).trim();",
    to: "  return description.trim();",
    expect: "only the owner's words are read",
  },
  {
    name: "the page-wrapper guard is dropped, so the div holding the booking goes with it",
    file: LIB,
    from: "      const safe = hits.filter((el) => !(tag === \"div\" && el.inner.length > out.length * 0.6));",
    to: "      const safe = hits;",
    expect: "the page wrapper",
  },
  {
    name: "the cap-th page counts as beyond the cap",
    file: LIB,
    from: "  return countPageMarkers(text) > max;",
    to: "  return countPageMarkers(text) >= max;",
    expect: "is NOT reached (the cap-th page is allowed)",
  },
  {
    name: "normalisePages goes back to a silent break at the cap",
    file: PAGES,
    from: "      dropped.push(`${check.slug}: beyond the cap of ${MAX_PAGES_PER_SITE} pages`);\n      continue; // -1: home is not in here",
    to: "      break; // -1: home is not in here",
    expect: "beyond the cap in dropped",
  },
  {
    name: "the stream no longer aborts at page cap+1",
    file: BUILDER,
    from: "      if (pageCapReached(full, pageCap)) {\n        capReached = true;\n        stream.abort();\n      }",
    to: "      if (pageCapReached(full, pageCap)) {\n        capReached = true;\n      }",
    expect: "the stream is ABORTED when the cap is reached",
  },
  {
    name: "a district zoom is accepted",
    file: MAPS,
    from: "export const MIN_ACCEPTABLE_MAP_ZOOM = 16;",
    to: "export const MIN_ACCEPTABLE_MAP_ZOOM = 1;",
    expect: "z=12 (a district) becomes 17",
  },
  {
    name: "the worker stops storing the notes",
    file: PROCESS,
    from: "        generation_notes: notes.length > 0 ? notes : null,",
    to: "        generation_notes: null,",
    expect: "the notes are STORED on the row",
  },
  {
    name: "the worker enforces on the home page only",
    file: PROCESS,
    from: "      const documents: string[] = [split.home, ...keptPages.map((pg) => pg.html)].map((doc) => {\n        const enforced = enforceNegativeInstructions(doc, negatives);",
    to: "      const documents: string[] = [split.home, ...keptPages.map((pg) => pg.html)].map((doc, i) => {\n        const enforced = i === 0 ? enforceNegativeInstructions(doc, negatives) : { html: doc, removed: [] };",
    expect: "every document — home AND each kept page",
  },
  {
    name: "the workspace loses its panel",
    file: WORKSPACE,
    from: '                  {generationNotes.length > 0 && (',
    to: '                  {generationNotes.length > 0 && false && (',
    expect: "a panel renders them",
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

console.log("website-negatives mutations\n");
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
console.log("Every clause in website-negatives.test.mjs is load-bearing.");
