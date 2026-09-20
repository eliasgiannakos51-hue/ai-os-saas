#!/usr/bin/env node
/*
 * CAN THE ENGLISH-ANCHOR GATE SEE THE DEFECT COMING BACK?
 *
 * Three defects, each put back as the thing it was:
 *
 *   1. A prodtest typing an English sentence at a browser again.
 *   2. The scan quietly returning nothing — which makes the gate's first
 *      section pass by measuring nothing, the shape CLAUDE.md records
 *      under db-migrations' three empty scrapers.
 *   3. The ASCII floor in uiTextStrict, `length < 3`, which the gate
 *      itself found an hour after the helper was written: two han
 *      characters are a whole word, so a correct check throws on a
 *      working Japanese product.
 *
 * ...plus the two exception-list failures, which are the half a baseline
 * normally does not have: an exception that no longer matches anything,
 * and one whose file no longer contains the literal it excuses.
 *
 * Run: node scripts/tests/english-anchored-gates.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/english-anchored-gates.test.mjs";
const SCAN = "scripts/scan-english-anchored-gates.mjs";
const HELPER = "scripts/tests/lib/ui-text.mjs";
const CONVERTED = "scripts/tests/agents-ui.prodtest.mjs";
const EXCUSED = "scripts/tests/background-jobs.prodtest.mjs";

const TARGETS = [GATE, SCAN, HELPER, CONVERTED, EXCUSED];

const MUTANTS = [
  {
    // THE DEFECT ITSELF. A rendered-text read compared with an English
    // sentence, in a product that ships in ten languages.
    name: "a prodtest goes back to typing English at the browser",
    file: CONVERTED,
    from: 'containsUi(body, await uiTextStrict(page, "dashboard.agents.historyTitle"))',
    to: 'body.includes("Run history")',
    expect: "the BREAKS list is empty",
  },
  {
    // THE SCRAPER FAILURE. An empty scan satisfies "the BREAKS list is
    // empty" perfectly. Section 2 is the section that notices.
    name: "the scan returns nothing at all",
    file: SCAN,
    from: "  return { files, stripped, breaks, sourceOnly, excused, weakTotal };",
    to: "  return { files, stripped, breaks: [], sourceOnly: [], excused: [], weakTotal };",
    expect: "the scan is still finding literals at all",
  },
  {
    // THE ASCII FLOOR, exactly as it was written. 成功 is two characters.
    name: "the needle floor goes back to a constant three",
    file: HELPER,
    from: "  return CJK.test(String(text)) ? 1 : 3;",
    to: "  return 3;",
    expect: "a two-character Japanese word",
  },
  {
    // ...and the other direction, because a floor of 1 lets "ok" and a
    // stray bracket through and would pass the CJK check above.
    name: "the needle floor accepts anything non-empty",
    file: HELPER,
    from: "  return CJK.test(String(text)) ? 1 : 3;",
    to: "  return 1;",
    expect: "refuses a two-letter Latin one",
  },
  {
    // uiTextStrict stops throwing: the vacuity comes back one level
    // down, where nothing above it can see it.
    name: "uiTextStrict returns the empty needle instead of throwing",
    file: HELPER,
    from: "  if (!text || text.length < minNeedleLength(text)) {",
    to: "  if (false) {",
    expect: "uiTextStrict throws rather than returning a needle under the floor",
  },
  {
    // AN EXCEPTION THAT COVERS NOTHING. The literal is gone from the
    // file, so the entry is a paragraph about a defect that no longer
    // exists — a baseline going stale in the direction nobody checks.
    name: "an exception names a literal that is not in the file it excuses",
    file: SCAN,
    from: '    literal: "Every morning",',
    to: '    literal: "Every afternoon",',
    expect: "still contains",
  },
  {
    // AN EXCEPTION WITHOUT A REASON. The list is only worth more than a
    // number because each row says why.
    name: "an exception is left with a one-line reason",
    file: SCAN,
    from: '      "The assertion is that this ENGLISH sentence is ABSENT from a Greek screen. " +',
    to: '      "Deliberate." || ',
    expect: "says why in more than a phrase",
  },
  {
    // THE KEY SWEEP. A key that does not exist in one of the nine other
    // languages is a prodtest that throws the first time somebody runs
    // it there.
    name: "a converted file names a key that is not in the messages files",
    file: CONVERTED,
    from: '"dashboard.agents.historyTitle"',
    to: '"dashboard.agents.historyTitleThatIsNotThere"',
    expect: "every key resolves in every locale",
  },
  {
    // AND THE FLOOR UNDER THE KEY SWEEP. An empty key list makes every
    // check in section 4 pass by ranging over nothing.
    name: "the key sweep finds no keys",
    file: GATE,
    from: "  for (const m of src.matchAll(KEY_CALL)) {",
    to: "  for (const m of []) {",
    expect: "name message keys at all",
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

console.log("english-anchored-gates mutations\n");

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
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const mutated = originals.get(m.file).replace(m.from, () => m.to);
    if (mutated === originals.get(m.file)) {
      missed.push({ ...m, why: "the mutation left the file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, mutated);
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
