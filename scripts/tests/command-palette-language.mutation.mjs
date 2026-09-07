#!/usr/bin/env node
/*
 * CAN THE TWO NEW GATES SEE THE PALETTE GO BLIND AGAIN?
 *
 * The defect was that the palette matched an English string it never
 * showed anybody. It is an easy defect to reintroduce, because the fix
 * looks like plumbing: pass one more string into a function. Delete that
 * one string and everything still compiles, every English test passes,
 * and nine languages stop working.
 *
 * Run: node scripts/tests/command-palette-language.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const LANG_GATE = "scripts/tests/command-palette-language.test.mjs";
const SRC_GATE = "scripts/tests/match-sources.test.mjs";
const PALETTE = "src/components/dashboard/command-palette.tsx";
const MATCH = "src/lib/command-palette-match.ts";
const SYN = "src/lib/ai/module-synonyms.ts";
const TARGETS = [LANG_GATE, SRC_GATE, PALETTE, MATCH, SYN];

const MUTANTS = [
  {
    // 1. THE DEFECT ITSELF: the matcher sees only the English label
    // again. Nine languages go blind and the component still renders
    // perfectly translated text above the empty list.
    // AIMED AT THE WIRING CLAUSE, and the reason is worth recording.
    // The cross-product in section 2 of the language gate measures
    // `filterAndRankCandidates` with candidates the TEST builds, so a
    // component that stops passing the translated label cannot move
    // those numbers — the matcher is still perfectly capable, it is just
    // no longer being given anything to work with. Two separate claims,
    // and only the wiring one can see this.
    name: "the palette matches the English label again",
    gate: LANG_GATE,
    file: PALETTE,
    from: "candidates: [translatedLabel(item.label), item.label],",
    to: "candidates: [item.label],",
    expect: "passes the TRANSLATED label to it",
  },
  {
    // 2. THE OPPOSITE HALF. Dropping English rather than the translation
    // passes every "can a Greek user find it" check and breaks the user
    // who knows the product in English or is typing on a Latin keyboard.
    // Written because a fix that swaps one blindness for another is the
    // easiest thing to ship while feeling finished.
    name: "the English label is dropped in favour of the translation",
    gate: SRC_GATE,
    file: PALETTE,
    from: "candidates: [translatedLabel(item.label), item.label],",
    to: "candidates: [translatedLabel(item.label)],",
    expect: "hands the matcher the label it renders",
  },
  {
    // 3. A PRIVATE MATCHER COMES BACK in the component. The shared one
    // still exists and is still measured; nothing that runs uses it.
    // This is the shape the greeklish work already met: wired at the one
    // place somebody needed it.
    name: "the component grows its own matcher again",
    gate: SRC_GATE,
    file: PALETTE,
    from: "  const pageResults = useMemo(",
    to: "  function filterAndRankItems() { return []; }\n  const pageResults = useMemo(",
    expect: "has no private matcher of its own",
  },
  {
    // 4. GREEKLISH STOPS. A Greek user on an English keyboard is the
    // case the whole unicode-patterns module exists for; a matcher that
    // silently drops it is the "defence wired at one place" shape.
    name: "greeklish matching is removed from the palette matcher",
    gate: LANG_GATE,
    file: MATCH,
    from: "    const greeklish = greeklishRank(query, candidate);",
    to: "    const greeklish = null as number | null;",
    expect: "greeklish reaches it too",
  },
  {
    // 5. THE GREEKLISH DIRECTION IS INVERTED — the exact bug the first
    // draft of this matcher shipped, caught by the gate before it left
    // the branch. A Greek candidate is skeletonised against a Greek
    // query, which never matches a Latin one.
    name: "the greeklish rank compares the wrong two things",
    gate: LANG_GATE,
    file: MATCH,
    from: "  if (GREEK_LETTER_PATTERN.test(query)) return null;",
    to: "  if (!GREEK_LETTER_PATTERN.test(query)) return null;",
    expect: "greeklish reaches it too",
  },
  {
    // 6. RANKING COLLAPSES. Every match scores the same, so the entry a
    // user meant sorts wherever the registry happens to put it. The list
    // is still non-empty, which is what makes this survive a check that
    // only asks "did anything match".
    name: "every match is given the same rank",
    gate: LANG_GATE,
    file: MATCH,
    from: "      if (best === null || index < best) best = index;",
    to: "      if (best === null) best = FUZZY_RANK;",
    expect: "a substring hit outranks a subsequence hit",
  },
  {
    // 7. THE VERBS FIELD EMPTIES OUT for one module. The type still has
    // it, synonymsFor still spreads it, and the classifier quietly goes
    // back to nouns for that module only — which is how a fix that
    // covered thirteen modules ends up covering twelve.
    // EMPTIED FOR REAL. The first version deleted only the English line
    // and left nine languages standing, so the list was not empty and
    // the gate was right to stay green — a mutation that does not do
    // what its name says is a hole reported as a pass.
    name: "one module's verbs list is emptied",
    gate: SRC_GATE,
    file: SYN,
    // APPENDED AFTER the real key, not before it. Inserting `verbs: []`
    // at the top of the object literal is a duplicate key that the LATER
    // one wins, so the second draft of this mutation changed nothing
    // either. Two rounds of a mutation that did not mutate, both
    // reported as a hole in the gate rather than in the mutation — which
    // is the right way round, and is why it was worth chasing.
    from: '    /* ar */ "أتمتت", "أتمتة",\n    ],\n  },\n};',
    to: '    /* ar */ "أتمتت", "أتمتة",\n    ],\n    verbs: [],\n  },\n};',
    expect: "none of them is empty",
  },
  {
    // 8. synonymsFor STOPS EMITTING THE VERBS. The data is all still
    // there and correct, and nothing reads it. A field that reaches
    // nothing is the same defect as a field that is empty, and it is
    // harder to see because the list looks right.
    name: "synonymsFor goes back to primary only",
    gate: SRC_GATE,
    file: SYN,
    from: "  return [...m.primary, ...m.verbs];",
    to: "  return [...m.primary];",
    expect: "synonymsFor emits the verbs",
  },
];

function runGate(gate) {
  try {
    execFileSync(process.execPath, [gate], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("command-palette-language mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  for (const gate of [LANG_GATE, SRC_GATE]) {
    const base = runGate(gate);
    console.log(`baseline: ${gate} is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
    if (!base.green) {
      console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
      process.exit(1);
    }
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
      result = runGate(m.gate);
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: `${m.gate} stayed green — nothing here is load-bearing` });
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

const after = [LANG_GATE, SRC_GATE].every((g) => runGate(g).green);
console.log(
  after
    ? "\nbaseline: both gates are green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
