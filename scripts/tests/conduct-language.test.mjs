#!/usr/bin/env node
/*
 * A SENTENCE THE MODEL IS TOLD TO ECHO MUST SAY WHICH LANGUAGE IT IS IN.
 *
 * MEASURED, NOT SUPPOSED. On 2026-09-06 the three agent tiers were run on
 * one Greek task through scripts/agent-tier-compare.mjs. Claude Haiku 4.5
 * closed its Greek answer with:
 *
 *   "I'm not an accountant — for your specific business situation,
 *    consult a professional."
 *
 * Sonnet 4.6 and Opus 4.5 wrote the same note in Greek. The cheapest tier
 * is the one that pasted the English.
 *
 * WHY: src/lib/agents/agent-runner.ts says "LANGUAGE: write the entire
 * result in ${config.language}" and then appends AI_SAFETY_BOUNDARIES_EN,
 * which ended with a literal English sentence the model is told to ALWAYS
 * close with. Two instructions, and the last one was a quoted English
 * string. The strong models resolved it; the cheap one copied.
 *
 * REPRODUCED AND MEASURED with the full runner prompt extracted from
 * source, five runs each on Haiku 4.5:
 *
 *   before the fix:  ENGLISH 1 · greek 3 · no disclaimer at all 1
 *   after the fix:   ENGLISH 0 · greek 5 · none 0
 *
 * Five samples is a small number and is reported as one — but the
 * mechanism is not statistical: the prompt now names the language of the
 * note, and the run that omitted the note entirely also stopped.
 *
 * SO THIS GATE IS STRUCTURAL, not a re-run. It costs nothing and asks the
 * only question that matters: does a block that hands the model a
 * sentence to echo also tell it what language to echo it in?
 *
 * Run: node scripts/tests/conduct-language.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let pass = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
};

const conductSrc = readFileSync(path.join(ROOT, "src/lib/ai-conduct.ts"), "utf8");

console.log("== 1. the conduct blocks, and which of them hand over a sentence ==");
// A BLOCK IS A `export const AI_… = ` template literal. The ones that
// matter are the ones containing a quoted sentence long enough to be a
// sentence — that is what a model can paste.
const blocks = [...conductSrc.matchAll(/export const (AI_[A-Z_]+) = `([\s\S]*?)`;/g)].map((m) => ({
  name: m[1],
  text: m[2],
}));
check(
  `the conduct blocks were found (${blocks.length}: ${blocks.map((b) => b.name).join(", ")})`,
  blocks.length >= 6,
  "if this collapses the checks below are green over nothing"
);

// AN ECHO EXEMPLAR IS NOT ANY QUOTED TEXT, and the first version of this
// check pretended otherwise: it flagged three more blocks, and all three
// were noise. `"I understand how you feel"` is a phrase the crisis block
// tells the model NEVER to say; the other two were fragments, because
// this file's Greek prose uses straight quotes as scare-quotes and a bare
// /"[^"]{25,}"/ happily spans from one to the next.
//
// Precision matters more than reach here. A gate whose findings are
// mostly noise teaches the next reader to skip it, which is worse than
// not having it — so an exemplar is recognised only where an instruction
// TELLS the model to produce that sentence, and never where one tells it
// not to.
// THE WINDOW IS 220 CHARS AND THAT NUMBER HAS A REASON. At 80 it stopped
// seeing AI_SAFETY_BOUNDARIES_EN the moment that block was FIXED — the
// fix inserts "WRITTEN IN THE SAME LANGUAGE AS THE REST OF YOUR ANSWER.
// In English that note reads: " between the cue and the quote, which is
// itself ~100 characters. A detector that loses sight of a block as soon
// as somebody repairs it turns section 2 green over an empty set, which
// is the exact failure this repository keeps finding in its own gates.
// The floor below is what makes that visible if it happens again.
const ECHO_CUE = /(close with|closing with|reply with|answer with|say exactly|note reads|note:|κλείσε[^.]{0,40}με|σύσταση:)[^"]{0,220}$/i;
const FORBID_CUE = /(never say|do not say|don't say|avoid saying|ΠΟΤΕ[^"]{0,20}πεις|ΜΗΝ[^"]{0,20}πεις)[^"]{0,220}$/i;
const exemplarsIn = (text) =>
  [...text.matchAll(/"([^"]{25,})"/g)].filter((m) => {
    const before = text.slice(Math.max(0, m.index - 260), m.index);
    return ECHO_CUE.test(before) && !FORBID_CUE.test(before);
  });
const handOver = blocks.filter((b) => exemplarsIn(b.text).length > 0);
// BOTH SAFETY BLOCKS MUST STILL BE IN VIEW. Naming them is the floor:
// "at least one" would have stayed green while the detector quietly lost
// the English block, which is precisely what happened at an 80-character
// window.
const handOverNames = handOver.map((b) => b.name);
check(
  `the blocks that hand over a sentence are still detected (${handOver.length}: ${handOverNames.join(", ") || "none"})`,
  handOverNames.includes("AI_SAFETY_BOUNDARIES_EN") && handOverNames.includes("AI_SAFETY_BOUNDARIES_EL"),
  "both safety blocks close with a quoted note; a detector that sees neither is measuring nothing"
);

console.log("\n== 2. every such block names the language of the sentence ==");
// THE RULE, and why it is phrased as "names a language" rather than
// "contains this exact wording": the point is that the model is told the
// note follows the answer's language, not that a particular sentence
// appears. Either shape satisfies it.
const NAMES_A_LANGUAGE =
  /SAME LANGUAGE AS THE REST|in the (?:user's|reader's) language|ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ|in that language/i;
const silent = handOver.filter((b) => !NAMES_A_LANGUAGE.test(b.text));
for (const b of handOver) {
  console.log(`        ${b.name}: ${exemplarsIn(b.text).length} exemplar(s) — ${NAMES_A_LANGUAGE.test(b.text) ? "names its language" : "SILENT"}`);
}
check(
  `no block hands over a sentence without saying what language it goes in (${silent.length} silent)`,
  silent.length === 0,
  silent.map((b) => b.name).join(", ") +
    " — a quoted English sentence with no language rule is what Haiku 4.5 pasted into a Greek answer"
);

console.log("\n== 3. the surfaces that set a language and then append an English block ==");
// THE BLAST RADIUS, counted rather than described. Four of the five
// surfaces that use the English conduct block also tell the model which
// language to write in — so the collision was not one route's mistake.
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const f = path.join(d, e);
    if (statSync(f).isDirectory()) walk(f);
    else if (/\.tsx?$/.test(f)) files.push(f);
  }
};
walk(path.join(ROOT, "src"));

const DECLARES_LANGUAGE = /LANGUAGE:|Reply in the (?:user's|same)|Write .{0,30}in the user's language|SAME LANGUAGE/i;
const usesEnBlock = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!/AI_SAFETY_BOUNDARIES_EN|AI_CONDUCT_EN/.test(src)) continue;
  usesEnBlock.push({ file: path.relative(ROOT, f), declaresLanguage: DECLARES_LANGUAGE.test(src) });
}
const both = usesEnBlock.filter((u) => u.declaresLanguage);
console.log(
  `        ${usesEnBlock.length} file(s) use the English conduct block; ${both.length} of them also set a language`
);
for (const u of usesEnBlock) console.log(`          ${u.declaresLanguage ? "sets a language" : "no language     "}  ${u.file}`);
check(
  `the scan found the surfaces that use it (${usesEnBlock.length})`,
  usesEnBlock.length >= 4,
  "a scan that finds nothing makes the count below meaningless"
);
// NOT A FAILURE — a record. Setting a language and appending the English
// block is fine now that the block names the language of its own
// sentence. What must not happen is that number going up while section 2
// is failing, so the two are printed together.
check(
  `...and every one that sets a language is covered by section 2 (${both.length} of ${usesEnBlock.length})`,
  silent.length === 0,
  "section 2 is what makes this safe; if it is red these are the routes that leak"
);

console.log("\n== 4. a surface whose OUTPUT is read by a person must name a language ==");
//
// SECTION 2 GUARDS A SENTENCE HANDED OVER TO BE ECHOED. This one guards
// the wider case the same sweep found: a prompt whose entire product is
// text a person reads, with no instruction about which language to write
// it in.
//
// FOUND 2026-09-06 in src/lib/clarification.ts — the step that asks the
// owner what their prices are before generating their site. Zero mentions
// of language, English example questions, and every question rendered
// straight into components/clarification/clarification-questions.tsx. It
// runs on Sonnet 4.6, which infers the language from the description in
// the same prompt and gets it right — which is exactly what hid the
// English disclaimer until the cheapest tier met it.
//
// THE LIST IS EXPLICIT, not discovered, and that is the honest shape: a
// scan cannot tell "this text is shown to a person" from "this text is a
// rule for the model". Each entry is a file whose output was read and
// found to be user-facing, so adding one is a decision somebody makes.
const USER_FACING_PROMPTS = [
  ["src/lib/clarification.ts", "the clarifying questions are rendered by components/clarification/clarification-questions.tsx"],
  ["src/lib/agents/agent-runner.ts", "the agent's result is emailed and shown"],
  ["src/lib/research/research.ts", "the research report is the deliverable"],
  ["src/lib/files/ask.ts", "the answer about a file is shown in the workspace"],
];
const DECLARES = /LANGUAGE:|Reply in the (?:user's|same)|Write .{0,40}in the user's language|SAME LANGUAGE|ask every question in the SAME LANGUAGE/i;
const silentSurfaces = [];
for (const [file, why] of USER_FACING_PROMPTS) {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  const ok = DECLARES.test(src);
  console.log(`        ${ok ? "names a language" : "SILENT          "}  ${file} — ${why}`);
  if (!ok) silentSurfaces.push(file);
}
check(
  `every prompt whose output a person reads names a language (${USER_FACING_PROMPTS.length} listed, ${silentSurfaces.length} silent)`,
  USER_FACING_PROMPTS.length >= 4 && silentSurfaces.length === 0,
  silentSurfaces.join(", ")
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
