// THE SAME STEPS, IN THE SAME SHAPE, ON THE SCREENS THAT HAVE STEPS — and
// the one screen that was given one and then had it taken away.
//
// Redesign phase 4 asked for a consistent step flow on Website, Research,
// Files and Coding: "same button position, same step names, same
// progress shape". Before it there was ONE step list in the whole
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
// Coding kept a three-step flow of its own — Describe, Generate, Review
// — from 2026-10-05 to 2026-10-18, standing in for the brief's
// Describe/Build/Test/Fix/Deploy for the same reason lib/ui/step-flows.ts
// gives: that screen RUNS NOTHING and MAKES NO COMMITS. On 2026-10-18 the
// owner turned Coding into a conversation («Το Coding καταλαβαίνει μόνο
// του τι ζητάω») with no fixed number of moves, so it has no flow at
// all now — not a shorter one, none — and section 4 checks that absence
// stays true: no <StepFlow> in its workspace, and the same absences
// (no repository, no execution, no whole project) still said in its
// prompt instead.
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
console.log("== 1. the three flows, and the brief's steps ==");
check(`the declaration was read (${Object.keys(FLOWS).length} flows)`, Object.keys(FLOWS).length === 3, JSON.stringify(FLOWS));
// THE BRIEF'S OWN WORDS for all three. Written out here so a step
// cannot quietly be dropped from a flow to make some other check pass —
// that is the direction this kind of list actually rots in.
const EXPECTED = {
  website: ["describe", "generate", "edit", "preview", "publish"],
  research: ["question", "research", "sources", "answer"],
  files: ["upload", "ask", "answer"],
};
for (const [flow, steps] of Object.entries(EXPECTED)) {
  check(
    `${flow}: ${steps.join(" -> ")}`,
    JSON.stringify(FLOWS[flow]) === JSON.stringify(steps),
    JSON.stringify(FLOWS[flow])
  );
}
// THE ABSENCE ITSELF, not just the silence of a missing clause above. A
// typo that renamed `coding` to `code` would pass EXPECTED (no entry
// named "coding" to compare) just as happily as the real thing.
check("coding has no flow of its own", !("coding" in FLOWS), Object.keys(FLOWS).join(", "));

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
};
// The design's filled control since 2026-10-04 is the white button
// (bg-button); it was bg-orange-500/400 before.
const FILLED = /\bbg-(?:button|warning)(?![/\w-])/;

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
  flowBeforeAction('<StepFlow flow="x" current={n} />\n<button className="bg-button">go</button>')
);
check(
  "...and refuses button-then-flow",
  !flowBeforeAction('<button className="bg-button">go</button>\n<StepFlow flow="x" current={n} />')
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
console.log("\n== 4. coding draws no step flow at all ==");
// NOT "fewer steps than the brief" — NONE. A conversation has no step 2
// of 3, so the screen must carry no <StepFlow> and import nothing from
// the component that draws one.
const codingUi = stripComments(readFileSync("src/components/coding/coding-workspace.tsx", "utf8"));
check(
  "the workspace renders no <StepFlow>",
  !/<StepFlow\b/.test(codingUi),
  "a conversation has no fixed number of moves to draw a bar across"
);
check(
  "...and does not even import it",
  !/\bStepFlow\b/.test(codingUi.replace(/<StepFlow\b[^>]*>/g, "")) &&
    !/from ["']@\/components\/ui\/step-flow["']/.test(codingUi),
  "an unused import is the first sign a flow is about to be drawn again"
);
// THE ABSENCES THE OLD BOX ON THE SCREEN SAID, now standing instructions
// inside the prompt instead («Ό,τι πρέπει να ξέρει ο χρήστης το λέει μία
// γραμμή μέσα στη συνομιλία, όταν χρειάζεται») — still declared
// somewhere, just no longer in a box competing with the conversation.
const codingPrompt = readFileSync("src/lib/coding/coding-prompt.ts", "utf8");
for (const clause of [
  /no access to any repository/i,
  /cannot run, execute, test, build, deploy or commit/i,
  /not a whole multi-service application/i,
]) {
  check(`coding still tells the model: ${clause}`, clause.test(codingPrompt));
}

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

// ---------------------------------------------------------------------
console.log("\n== 6. the one colour a static reader cannot judge ==");
// THE DIGIT INSIDE THE CURRENT STEP'S CHIP, pinned to the class that was
// MEASURED rather than the one that looked right. Until 2026-10-04 it was
// an orange that read 4.44:1 in the light theme. Since then there is one
// theme and no accent: text-foreground on a 15% wash of itself, measured
// 14.62:1 on 2026-10-04 by the tool named below.
//
// A contrast ratio is not something this file can compute: it needs the
// composited ground, which needs a browser. So the browser does it in
// scripts/step-flow-contrast.mjs and this pins the answer, which is the
// only half of the pair that can run on every build.
check(
  "the current step's digit uses the text colour that measured above 4.5:1",
  /here \? "bg-foreground\/15 text-foreground"/.test(shape),
  "see scripts/step-flow-contrast.mjs"
);
const contrastTool = readFileSync("scripts/step-flow-contrast.mjs", "utf8");
check(
  "...and the measurement that decided it is in the repository",
  /for \(const theme of \["dark"\]\)/.test(contrastTool) &&
    /el:/.test(contrastTool) && /ar:/.test(contrastTool) && /zh:/.test(contrastTool),
  "a number quoted in a comment with no way to re-derive it is a number nobody can check"
);
// AND IT MEASURES THE SAME CLASS THE COMPONENT DRAWS. A harness that
// measures a colour the product does not use is the cheerful kind of
// green this project has been bitten by four times.
check(
  "...against the same class",
  contrastTool.includes('here ? "bg-foreground/15 text-foreground"'),
  "the harness and the component have drifted apart"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
