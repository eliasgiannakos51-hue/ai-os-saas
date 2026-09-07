#!/usr/bin/env node
/*
 * CAN website-greek-spelling.test.mjs SEE THE CHECK TURN HARMFUL?
 *
 * A spelling note is a courtesy. It becomes a defect the moment it tells
 * somebody their own village is misspelled, or shows them a word that was
 * never on their page, or rewrites the page instead of reporting.
 *
 * Each mutation below is one of those, plus the two the gates caught in
 * the first draft of this feature: a private accent fold, and a model call
 * whose tokens reach no accumulator.
 *
 * Run: node scripts/tests/website-greek-spelling.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/website-greek-spelling.test.mjs";
const PURE = "src/lib/website-greek-spelling.ts";
const CALL = "src/lib/websites-greek-spelling-check.ts";
const TARGETS = [GATE, PURE, CALL];

const MUTANTS = [
  {
    // 1. THE OWNER'S OWN WORDS STOP BEING PROTECTED. Their village, their
    // surname, their brand all become "possible typos".
    name: "the brief no longer protects the words the owner wrote",
    file: PURE,
    from: "  const fromBrief = briefWordFolds(brief);",
    to: "  const fromBrief = new Set<string>();",
    expect: "the exact-fold set alone protects a common noun from the brief",
  },
  {
    // 2. THE PRIVATE FOLD COMES BACK — the first draft's defect. An accent
    // in the brief and none on the page, and the protection silently stops
    // applying.
    //
    // TWO MUTATIONS NOW, WHERE ONE USED TO DO, and the reason is a change
    // made on 2026-09-07 rather than a preference. The brief side moved
    // into an exported briefWordFolds() so scripts/check-site-spelling.mjs
    // could reuse it instead of carrying a second copy of "what a Greek
    // word is". That put the fold in TWO places, and a mutation that
    // replaces one of them is measuring the other one's redundancy — the
    // same thing that made this suite's role mutation go WRONG for the
    // isolation probe. 2 breaks the BRIEF side; 2b breaks the PAGE side;
    // each names the clause that isolates it.
    name: "the brief side folds with lower-case only, so an accent defeats the protection",
    file: PURE,
    from: "  return new Set((brief.match(GREEK_WORD) ?? []).map(foldForMatch));",
    to: '  return new Set((brief.match(GREEK_WORD) ?? []).map((s) => s.toLowerCase().replace(/\\u03c2/g, "\\u03c3")));',
    expect: "the shared fold alone protects it across an accent",
  },
  {
    name: "the page side folds with lower-case only",
    file: PURE,
    from: "  const fold = foldForMatch;",
    to: '  const fold = (s: string) => s.toLowerCase().replace(/\\u03c2/g, "\\u03c3");',
    expect: "the exact-fold set alone protects a common noun from the brief",
  },
  {
    // 3. THE MODEL'S ANSWER IS TRUSTED WHOLE. Anything it says appears
    // beside the preview, including words it invented.
    name: "a word the model invented is shown to the owner",
    file: PURE,
    from: "    const hit = allowed.get(foldForMatch(item.trim()));\n    if (hit && !out.includes(hit)) out.push(hit);",
    to: "    if (!out.includes(item)) out.push(item);",
    expect: "a word the model invented is dropped",
  },
  {
    // 4. THE CAP GOES, so one long page turns a 200-token courtesy into an
    // unbounded call.
    name: "the word cap is removed",
    file: PURE,
    from: "    if (out.length >= SPELLING_WORD_CAP) break;",
    to: "",
    expect: "words are sent",
  },
  {
    // 5. THE TOKENS REACH NO ACCUMULATOR — the call the owner pays for and
    // the user never does. billing-coverage.test.mjs refuses this too; the
    // point here is that THIS gate's own section 5 does as well.
    name: "the spelling call stops recording its usage",
    file: CALL,
    from: '    costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);',
    to: "",
    expect: "records its usage on the caller",
  },
  {
    // 6. A FAILURE STOPS BEING SILENT, so a provider hiccup fails a whole
    // generation the owner has already paid for.
    name: "a provider refusal is no longer an empty list",
    file: CALL,
    from: "    if (!outcome.ok) return [];",
    to: '    if (!outcome.ok) throw new Error("spelling check failed");',
    expect: "and a refusal from the provider is too",
  },
  {
    // 7. THE PURE HALF IMPORTS THE PROVIDER AGAIN, which is what put these
    // rules out of reach of any test in the first place.
    name: "the provider chain is imported back into the pure half",
    file: PURE,
    from: 'import { foldForMatch, MAX_INFLECTION } from "@/lib/text/unicode-patterns";',
    to: 'import { foldForMatch, MAX_INFLECTION } from "@/lib/text/unicode-patterns";\nimport { runCompletion } from "@/lib/ai/providers/complete";\nvoid runCompletion;',
    expect: "the pure half imports no provider",
  },
  {
    // THE DEFECT MEASURED ON THE FIRST REAL SITE THIS CODE EVER SAW:
    // "Χαλάνδρι" in the brief, "Χαλανδρίου" on the page and in the list
    // of words put to the model as candidate misspellings. Six of six
    // constructed cases leaked. Exact-form matching in an inflected
    // language protects one form and no other.
    name: "the owner's own name is protected only in the exact form they typed",
    file: PURE,
    from: "if (fromBrief.has(key) || seen.has(key) || isOwnName(raw, ownStems)) continue;",
    to: "if (fromBrief.has(key) || seen.has(key)) continue;",
    expect: "no inflection of the owner's own name is put to the model",
  },
  {
    // AND THE OVER-CORRECTION, which is worse: a checker that silences a
    // real typo to protect a name has stopped being a spelling checker.
    // Stemming the sentence-initial capital too would swallow every word
    // beginning "ζαχαροπλαστ", the brief's own common noun.
    name: "...and every capital becomes a name, including the one that starts the sentence",
    file: PURE,
    from: "    for (const w of words.slice(1)) {",
    to: "    for (const w of words) {",
    expect: "no real misspelling is silenced to protect a name",
  },
  {
    // THE STEM GETS SHORT ENOUGH TO CATCH STRANGERS. "χαλα" also begins
    // χαλαρός and χάλασε.
    name: "the stem shortens until unrelated words are swallowed",
    file: PURE,
    from: "  const len = Math.max(OWN_STEM_MIN, Math.ceil(folded.length * 0.6));",
    to: "  const len = Math.max(3, Math.ceil(folded.length * 0.3));",
    expect: "no real misspelling is silenced to protect a name",
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

console.log("website-greek-spelling mutations\n");

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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
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
console.log("Every refusal in website-greek-spelling.test.mjs is load-bearing.");
