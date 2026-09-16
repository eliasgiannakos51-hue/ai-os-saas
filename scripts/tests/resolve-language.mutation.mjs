#!/usr/bin/env node
/*
 * CAN resolve-language.test.mjs SEE THE ANSWER GO BACK TO THE WRONG LANGUAGE?
 *
 * THE BUG THIS GATE EXISTS FOR was every AI surface sending
 * `language: locale` — the INTERFACE language — so a Greek topic typed
 * into an English UI came back as an English report. Two routes had it
 * identically, which is the tell that it was a shared assumption rather
 * than a slip. A gate against that has to survive both halves: the
 * DECISION (which language is this text in) and the WIRING (does the
 * route pass it).
 *
 * Seven mutants, each a thing somebody would plausibly do:
 *
 *   1. the share threshold is raised, so a Greek question with English
 *      product names in it stops being Greek
 *   2. the threshold is dropped to zero, so one "μ" in an English
 *      sentence makes the whole answer Greek — the defect the share was
 *      introduced to prevent, in the other direction
 *   3. katakana leaves the kana test, so a Japanese request written the
 *      way loanwords are written resolves to Chinese
 *   4. `break` goes, so a character counts for two scripts and the
 *      denominator stops meaning anything
 *   5. the tie-break stops being deterministic
 *   6. a route goes back to sending the UI locale — the original bug
 *   7. a system prompt loses the line telling the model which language
 *      to answer in, which is how the decision gets made and then
 *      ignored
 *
 * Run: node scripts/tests/resolve-language.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/resolve-language.test.mjs";
const LIB = "src/lib/text/resolve-language.ts";

// Top-level declaration, under the name the reader looks for — see the
// SHAPE note in scripts/tests/lib/mutation-runner.mjs.
const MUTANTS = [
  {
    name: "the non-Latin share bar is raised, so a Greek question with product names stops being Greek",
    file: LIB,
    from: "const NON_LATIN_SHARE_THRESHOLD = 0.2;",
    to: "const NON_LATIN_SHARE_THRESHOLD = 0.9;",
    expect: "a Greek topic, English UI",
  },
  {
    name: "the bar drops to zero, so a single Greek letter in English decides the whole answer",
    file: LIB,
    from: "const NON_LATIN_SHARE_THRESHOLD = 0.2;",
    to: "const NON_LATIN_SHARE_THRESHOLD = 0;",
    expect: "a Latin topic with one Greek letter",
  },
  {
    name: "katakana leaves the kana test, so Japanese loanword text reads as Chinese",
    file: LIB,
    from: "const KANA = /[\\p{Script=Hiragana}\\p{Script=Katakana}]/u;",
    to: "const KANA = /[\\p{Script=Hiragana}]/u;",
    expect: "katakana-only is Japanese",
  },
  // NOT MUTATED: the `break` in the per-character loop.
  //
  // Removing it leaves every result identical, and that is a fact about
  // the rules rather than a gap in the gate: GREEK, ARABIC and
  // CJK_PATTERN are mutually exclusive, so no character can match two.
  // The break is an optimisation whose comment ("one script per
  // character") reads like a correctness guard. A mutant for it would
  // be an EQUIVALENT mutant — a change with no behaviour behind it —
  // and demanding a gate catch one is how a suite grows checks that
  // assert the shape of the code instead of what it does.
  {
    name: "Latin text stops falling back to the interface language",
    file: LIB,
    from: "  if (best !== null && best.count / letters >= NON_LATIN_SHARE_THRESHOLD) {",
    to: "  if (best !== null) {",
    expect: "Latin",
  },
  {
    name: "the tie-break stops being deterministic",
    file: LIB,
    from: "    if (count > 0 && (best === null || count > best.count)) {",
    to: "    if (count > 0 && (best === null || count >= best.count)) {",
    expect: "equal Greek and Arabic",
  },
  {
    name: "an unsupported UI locale stops falling back to English",
    file: LIB,
    from: '  const fallback = (SUPPORTED_LOCALES as readonly string[]).includes(uiLocale) ? uiLocale : "en";',
    to: "  const fallback = uiLocale;",
    expect: "en",
  },
  // NOT MUTATED EITHER: the `text.length === 0` half of the guard.
  // An empty string reaches `letters === 0` two lines later and returns
  // the same fallback, so dropping it changes nothing observable —
  // verified by calling resolveLanguage("", "el") directly. Equivalent,
  // like the break above.
  {
    name: "the CJK group stops being split, so Japanese and Chinese merge",
    file: LIB,
    from: '    if (best.locale === "cjk") return KANA.test(text) ? "ja" : "zh";',
    to: '    if (best.locale === "cjk") return "zh";',
    expect: "a Japanese topic, English UI",
  },
];

runMutations({
  name: "resolve-language",
  gate: GATE,
  targets: [LIB],
  mutants: MUTANTS,
});
