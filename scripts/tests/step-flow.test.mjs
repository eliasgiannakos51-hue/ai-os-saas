// THE SAME FOUR STEPS, IN THE SAME SHAPE, ON THE FOUR SCREENS THAT HAVE
// STEPS — and the one place where the brief and the product disagree.
//
// Redesign phase 4 asked for a consistent step flow on Website,
// Research, Files and Coding: "same button position, same step names,
// same progress shape". Before it there was ONE step list in the whole
// product — files-workspace.tsx's, written in classes only that file
// had, with its own message keys and its own numbering. It existed
// because of a real report ("I do not understand how it works and I
// cannot ask a question") and it worked; the other three screens simply
// never got the answer.
//
// So the shape moved to components/ui/step-flow.tsx, the words to
// stepFlow.* and the flows to lib/ui/step-flows.ts. This file is what
// stops them drifting apart again.
//
// WHERE THE BRIEF IS NOT FOLLOWED, asserted rather than apologised for:
// Coding's flow is three steps, not the Describe/Build/Test/Fix/Deploy
// the brief named, because lib/coding/operations.ts's four declared
// absences say that screen RUNS NOTHING and MAKES NO COMMITS. Section 4
// checks that the flow contains none of those three words and that the
// absences it defers to are still declared — if that page ever does run
// code, this check goes red and the flow gets its steps back.
//
// Run: node scripts/tests/step-flow.test.mjs
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { openingTags } from "../lib/jsx-scan.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);

// The flows, read from the declaration rather than restated here. A gate
// that keeps its own copy of the thing it checks agrees with itself.
const flowsSrc = stripComments(readFileSync("src/lib/ui/step-flows.ts", "utf8"));
const FLOWS = {};
for (const m of flowsSrc.matchAll(/^\s{2}(\w+): \[([^\]]+)\],$/gm)) {
  FLOWS[m[1]] = m[2].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

// ---------------------------------------------------------------------
console.log("== 1. the four flows, and the brief's steps ==");
check(`the declaration was read (${Object.keys(FLOWS).length} flows)`, Object.keys(FLOWS).length === 4, JSON.stringify(FLOWS));
// THE BRIEF'S OWN WORDS for three of the four. Written out here so a
// step cannot quietly be dropped from a flow to make some other check
// pass — that is the direction this kind of list actually rots in.
const EXPECTED = {
  website: ["describe", "generate", "edit", "preview", "publish"],
  research: ["question", "research", "sources", "answer"],
  files: ["upload", "ask", "answer"],
  coding: ["describe", "generate", "review"],
};
for (const [flow, steps] of Object.entries(EXPECTED)) {
  check(
    `${flow}: ${steps.join(" -> ")}`,
    JSON.stringify(FLOWS[flow]) === JSON.stringify(steps),
    JSON.stringify(FLOWS[flow])
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. one word per step, shared between flows ==");
// "SAME STEP NAMES" MEANS ONE KEY, NOT ONE PER FLOW. `describe` is the
// website builder's first step and coding's; `answer` is research's last
// and files'. Nested under the flow they would be four keys and two
// chances for a translator to write two different Greek words for the
// same button.
const names = [...new Set(Object.values(FLOWS).flat())];
check(`distinct step names (${names.length})`, names.length >= 10, names.join(", "));
check(
  "a name is shared rather than duplicated per flow",
  Object.values(FLOWS).flat().length > names.length,
  `${Object.values(FLOWS).flat().length} step slots, ${names.length} names — nothing is reused`
);
for (const loc of LOCALES) {
  const block = messages[loc].stepFlow;
  const missing = names.filter((n) => !block?.steps?.[n] || !block?.hints?.[n]);
  check(
    `${loc}: every step has a word and a hint`,
    Boolean(block?.label) && missing.length === 0,
    missing.join(", ") || "no stepFlow block at all"
  );
}
// AND THE HINT IS A SENTENCE, not the word again. The files page's
// hints are what made its step list work; a hint that repeats the label
// carries none of that.
for (const loc of ["en", "el", "ar"]) {
  const block = messages[loc].stepFlow;
  // ?? "" AND NOT block.hints[n].trim(): a missing hint is a FAILURE of
  // the clause above, and this one threw a TypeError on it instead —
  // which killed the process and took sections 3, 4 and 5 with it. Its
  // own mutation suite is what said so: the "coding claims a step it
  // does not have" mutant went red on the wrong clause because the right
  // one never ran. A checker that crashes reports nothing about
  // everything after it.
  const lazy = names.filter((n) => (block.hints?.[n] ?? "") === (block.steps?.[n] ?? "").trim() && block.steps?.[n]);
  check(`${loc}: no hint is just the step name repeated`, lazy.length === 0, lazy.join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 3. every screen draws it, from derived state ==");
const SCREENS = {
  website: "src/components/website-builder/website-builder-workspace.tsx",
  research: "src/components/research/research-workspace.tsx",
  files: "src/components/files/files-workspace.tsx",
  coding: "src/components/coding/coding-workspace.tsx",
};
const FILLED = /\bbg-(?:orange-400|orange-500|amber-500)(?![/\w-])/;

// SAME BUTTON POSITION, which is half of what the brief asked for and
// the half a word-only check cannot see: the flow is drawn BEFORE the
// screen's filled primary action, so the order a person reads is "where
// am I", then "what do I press".
//
// Split out and fed samples, because the real four files all satisfy it
// today — a clause that nothing can make fail is a sentence, and this
// one had no way to go red until the samples below existed.
function flowBeforeAction(src) {
  const at = src.indexOf("<StepFlow flow=");
  if (at === -1) return false;
  const firstFilled = openingTags(src).find((t) => FILLED.test(t.text));
  return firstFilled === undefined || at < firstFilled.start;
}
function describeOrder(src) {
  const at = src.indexOf("<StepFlow flow=");
  const firstFilled = openingTags(src).find((t) => FILLED.test(t.text));
  return firstFilled ? `StepFlow at ${at}, first filled control at ${firstFilled.start}` : "no filled control";
}
check(
  "the order check accepts flow-then-button",
  flowBeforeAction('<StepFlow flow="x" current={n} />\n<button className="bg-orange-500">go</button>')
);
check(
  "...and refuses button-then-flow",
  !flowBeforeAction('<button className="bg-orange-500">go</button>\n<StepFlow flow="x" current={n} />')
);
for (const [flow, file] of Object.entries(SCREENS)) {
  const src = stripComments(readFileSync(file, "utf8"));
  const at = src.indexOf(`<StepFlow flow="${flow}"`);
  check(`${flow}: the screen renders its own flow`, at !== -1, file);
  if (at === -1) continue;
  // A CONSTANT IS NOT PROGRESS. `current={0}` draws a step list that
  // never moves, which is decoration with a number on it.
  const tag = src.slice(at, src.indexOf(">", at) + 1);
  check(
    `${flow}: current is derived, not a literal`,
    !/current=\{\d+\}/.test(tag),
    tag
  );
  check(
    `${flow}: the flow comes before the screen's filled primary action`,
    flowBeforeAction(src),
    describeOrder(src)
  );
}

// ---------------------------------------------------------------------
console.log("\n== 4. the three steps coding does not have ==");
const coding = stripComments(readFileSync("src/lib/coding/operations.ts", "utf8"));
// The absences the flow defers to, still declared in the product.
for (const clause of ["IT RUNS NOTHING", "IT MAKES NO COMMITS", "IT DOES NOT BUILD A PROJECT"]) {
  const raw = readFileSync("src/lib/coding/operations.ts", "utf8");
  check(`coding still declares: ${clause}`, raw.includes(clause));
}
check(
  "the coding flow claims none of test, fix or deploy",
  !FLOWS.coding.some((s) => ["test", "fix", "deploy", "build"].includes(s)),
  FLOWS.coding.join(", ")
);
check(
  "and CODE_OPERATIONS has not gained one that runs code",
  /CODE_OPERATIONS = \["generate", "explain", "find_bugs", "convert", "write_tests"\]/.test(coding),
  "if this page learns to run or deploy, the flow above owes it those steps"
);

// ---------------------------------------------------------------------
console.log("\n== 5. the indicator does not compete with the action ==");
const shape = readFileSync("src/components/ui/step-flow.tsx", "utf8");
check(
  "no filled accent anywhere in the step flow",
  !FILLED.test(stripComments(shape)),
  "a filled orange chip in a progress bar is a second primary action on every one of these screens"
);
// THE BORDER CEILING IN design-density.test.mjs HAS NO SLACK, and a
// decoration drawn on four screens is not what should spend it.
// A CLASS TOKEN, NOT A SUBSTRING. `bg-border` is a background painted
// in the border COLOUR — the connector line between two steps — and it
// draws no border at all. The first version of this check matched the
// six letters wherever they appeared and called that line a border,
// which is the substring fault CLAUDE.md lists by name.
function borderClassesIn(src) {
  return [...src.matchAll(/(?<=["'\s])(border(?:-[\w/[\]().-]+)?)(?=["'\s])/g)].map((m) => m[1]);
}
// THE CONTROL FIRST, because the clause under it asserts an EMPTY list
// and an empty list is what a broken scan returns too.
const borderControl = borderClassesIn('<div className="border border-border p-2" />');
check(
  "the scan for a border utility can find one",
  borderControl.length >= 2,
  borderControl.join(", ")
);
const borderClasses = borderClassesIn(stripComments(shape));
check(
  "and the step flow has none",
  borderClasses.length === 0,
  `${borderClasses.join(", ")} — see the ceiling in scripts/tests/design-density.test.mjs`
);
check(
  "the current step is marked for a screen reader, not only by colour",
  /aria-current=\{here \? "step" : undefined\}/.test(shape)
);
check("and the list says what it is", /aria-label=\{t\("label"\)\}/.test(shape));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
