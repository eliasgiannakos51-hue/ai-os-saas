#!/usr/bin/env node
/*
 * CAN ambiguity.test.mjs SEE THE DETECTOR GO WRONG IN EACH DIRECTION?
 *
 * A classifier is the easiest kind of code to test badly, because a
 * degenerate one scores well on a lopsided corpus: "always unsure" makes
 * no false accusations at all, and "always vague" catches every vague
 * request. Both are useless and both pass a check that only looks at one
 * of the two errors. Each mutation below is one of those degeneracies, or
 * a real defect the first draft actually shipped.
 *
 * Run: node scripts/tests/ambiguity.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/ambiguity.test.mjs";
const AMB = "src/lib/ai/ambiguity.ts";
const CLIENT = "src/lib/clarification-client.ts";
const CLAR = "src/lib/clarification.ts";
const TARGETS = [GATE, AMB, CLIENT, CLAR];

const MUTANTS = [
  {
    // 1. ALWAYS UNSURE — the degenerate detector that never makes a
    // false accusation and never saves a penny. It passes every
    // "no clear request is called vague" check ever written.
    // EVERY vague return, not just the first. Removing one leaves the
    // other two standing, so the first draft of this mutation changed
    // almost nothing and was reported as a hole in the gate — which it
    // was not.
    name: "the detector never commits to vague",
    file: AMB,
    from: '  if (reasons.includes("bare")) return { verdict: "vague", reasons, words };\n  if (reasons.includes("placeholder")) return { verdict: "vague", reasons, words };\n  if (reasons.length >= 2) return { verdict: "vague", reasons, words };',
    to: "",
    expect: "vague requests are caught for free",
  },
  {
    // 2. ALWAYS VAGUE for anything short — the opposite degeneracy, and
    // the one that ships if you only measure recall. Every three-word
    // request gets a question.
    name: "brevity alone is treated as evidence",
    file: AMB,
    from: '  if (reasons.includes("placeholder")) return { verdict: "vague", reasons, words };',
    to: '  if (reasons.includes("short")) return { verdict: "vague", reasons, words };',
    expect: "no clear request is ever called vague",
  },
  {
    // 3. SPECIFICITY STOPS OUTRANKING BREVITY. "invoice Acme 4200 for
    // March" becomes a candidate for interrogation. This is the ordering
    // bug, and the order is the whole design.
    name: "specificity is checked after the vagueness signals",
    file: AMB,
    from: '  if (specific.length > 0) {\n    return { verdict: "clear", reasons: specific.map((c) => `specific:${c}`), words };\n  }',
    to: "",
    expect: "is clear (number)",
  },
  {
    // 4. THE CJK THRESHOLD COLLAPSES BACK into the word count — the
    // defect the first draft shipped, where fourteen Japanese characters
    // counted as twelve words and a four-word request was waved through
    // as "long". The flat-threshold-across-scripts mistake.
    name: "one length threshold is used for every script",
    file: AMB,
    from: "  if (length >= (cjk ? CLEARLY_ENOUGH_CJK_CHARS : CLEARLY_ENOUGH_WORDS)) {",
    to: "  if (length >= CLEARLY_ENOUGH_WORDS) {",
    expect: "no clear example passes merely by being long",
  },
  {
    // 5. CONTEXT STOPS MATTERING. "continue" is treated as ambiguous
    // mid-conversation, which is the version of this feature that gets
    // switched off within a day.
    name: "a follow-up is treated like a cold request",
    file: AMB,
    from: '    if (hasContext) return { verdict: "clear", reasons: ["bare:followup"], words };',
    to: "",
    expect: "the same words after a conversation are clear",
  },
  {
    // 6. THE BARE-COMMAND TEST BECOMES A SUBSTRING TEST. "fix it so the
    // header stops overlapping the nav" now matches "fix it" and is
    // called vague — a real request, interrogated, because the matcher
    // stopped requiring the whole utterance.
    name: "bare commands are matched as substrings",
    file: AMB,
    from: "    } else if (normalised === folded) {",
    to: "    } else if (normalised.includes(folded)) {",
    expect: "no clear request is ever called vague",
  },
  {
    // 7. ONE LANGUAGE FALLS OUT of the cue list. Nine keep working, the
    // total still looks healthy, and Greek users stop being understood —
    // which is the exact shape of every language defect this repository
    // has found.
    // AIMED AT RECALL, because that is what actually moves. Dropping the
    // Greek cues makes «κάνε το» UNSURE rather than CLEAR — it is still
    // not sent straight to generation, it just costs a model call — so
    // the per-item "is not called clear" check is right to stay green and
    // the recall count is the one that drops.
    name: "the Greek bare commands are removed",
    file: AMB,
    from: '  "κανε το", "καν το", "καντο", "φτιαξε το", "φτιαξ το", "αλλαξε το",',
    to: "",
    expect: "vague requests are caught for free",
  },
  {
    // 8b. THE WEBSITE CAP COLLAPSES to everything else's. One number, five
    // surfaces, which is the arrangement this table replaced — and the
    // surface it costs is the one where guessing produces a whole wrong
    // site rather than one wrong paragraph.
    name: "the website surface loses its second question",
    file: CLIENT,
    from: "  website: 2,",
    to: "  website: 1,",
    expect: "a website brief may ask two",
  },
  {
    // 8c. A NEW SURFACE INHERITS THE WIDEST CAP instead of the strictest.
    // The fallback is the whole safety property of questionCapFor: a kind
    // nobody has argued about must not quietly get two questions.
    name: "an unknown surface falls back to the widest cap",
    file: CLIENT,
    from: "  return CLARIFICATION_QUESTION_CAP[kind] ?? 1;",
    to: "  return CLARIFICATION_QUESTION_CAP[kind] ?? 2;",
    expect: "an unknown surface gets the STRICTEST cap",
  },
  {
    // 8d. THE MODEL IS TOLD A DIFFERENT NUMBER FROM THE PARSER. The cap
    // still holds — the result is trimmed — but the model wrote three
    // questions of equal weight and we keep the FIRST, not the most
    // important. A cap enforced only by trimming is half a cap.
    name: "the tool description stops carrying the cap",
    file: CLAR,
    from: "    tools: [clarificationTool(cap)],",
    to: "    tools: [clarificationTool(3)],",
    expect: "the tool description is built from the cap",
  },
  {
    // 8. THE CAP GOES BACK TO THREE. The user is handed a form again,
    // and nothing about the code stops compiling.
    name: "the question cap returns to three",
    file: CLIENT,
    from: "export const MAX_CLARIFICATION_QUESTIONS = 1;",
    to: "export const MAX_CLARIFICATION_QUESTIONS = 3;",
    expect: "the default cap is one question",
  },
  {
    // 9. THE SHORT-CIRCUIT IS REMOVED. Every request pays for the Sonnet
    // call again, and the whole "decides before spending" claim is false
    // while the free detector still sits there being unit-tested.
    name: "the paid check stops consulting the free assessment",
    file: CLAR,
    from: '  if (assessment.verdict === "clear") return { needsClarification: false };',
    to: "",
    expect: "a clear verdict returns without calling the model",
  },
  {
    // 10. THE SHORT-CIRCUIT MOVES AFTER THE API CALL. It still exists,
    // still returns the right answer, and saves nothing — the shape of a
    // fix that is measured by its presence rather than by its effect.
    name: "the free assessment runs after the model has been called",
    file: CLAR,
    from: "  const assessment = assessAmbiguity(userText, { hasContext: Boolean(knownContext) });",
    to: "",
    expect: "the free assessment runs before the API client is built",
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

console.log("ambiguity mutations\n");

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
