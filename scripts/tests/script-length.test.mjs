// A CHARACTER COUNT IS A CLAIM ABOUT A LANGUAGE.
//
// Found because DEEP_DIVE_MIN_QUESTION_CHARS = 15 scored Chinese 0 of 5
// on questions that had ALREADY placed the correct module. The feature
// worked; an unrelated length check threw the answer away. "总收入是多少？"
// is seven characters and a complete question.
//
// TWO FAULTS, opposite directions, different fixes.
//
//   A MINIMUM written for English rejects valid Chinese and Japanese,
//   which say the same thing in a third to a half the characters. The
//   script is visible in the text, so it can be detected.
//
//   A MAXIMUM written for English discards valid German, which takes 14%
//   more. German is Latin script and cannot be detected, so the limit
//   itself has to be generous enough.
//
// THE RATIOS ARE RE-MEASURED HERE, from the catalogue, every run. A
// constant copied from a measurement taken once is a number that was
// true; this fails when the catalogue moves away from it.
//
// Run: node scripts/tests/script-length.test.mjs
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

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
const sl = await loadTs("src/lib/text/script-length.ts");

console.log("== 1. the ratios still describe the catalogue ==");
function* walk(o, p = "") {
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) yield* walk(v, p ? `${p}.${k}` : k);
  else if (typeof o === "string") yield [p, o];
}
const en = new Map([...walk(messages.en)]);
const at = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
// Prose only: placeholders and punctuation dominate a short string, and
// an ICU plural is mostly syntax in every language.
const sample = [...en.entries()].filter(([, v]) => v.length >= 40 && !v.includes("{")).map(([k]) => k);
check(`the sample is large enough to have a median (${sample.length})`, sample.length >= 300, String(sample.length));

const measured = {};
for (const locale of LOCALES) {
  const ratios = [];
  for (const key of sample) {
    const a = en.get(key);
    const b = at(messages[locale], key);
    if (typeof b !== "string" || b.length === 0) continue;
    ratios.push([...b].length / [...a].length);
  }
  ratios.sort((x, y) => x - y);
  measured[locale] = ratios[Math.floor(ratios.length / 2)];
}
for (const locale of LOCALES) {
  const claimed = sl.MEASURED_LENGTH_RATIO[locale];
  check(
    `${locale}: the recorded ratio matches the catalogue (${claimed} vs ${measured[locale].toFixed(2)})`,
    typeof claimed === "number" && Math.abs(claimed - measured[locale]) <= 0.06,
    `recorded ${claimed}, measured ${measured[locale]?.toFixed(3)} — re-measure and update the constant`
  );
}
// THE TWO THAT THE HELPERS DEPEND ON, named rather than inferred: if
// another language became the densest or the longest, the helpers would
// be using the wrong one.
const densest = LOCALES.reduce((a, b) => (measured[a] < measured[b] ? a : b));
const longest = LOCALES.reduce((a, b) => (measured[a] > measured[b] ? a : b));
check(`the densest language is the one DENSEST_RATIO uses (${densest})`, sl.DENSEST_RATIO === sl.MEASURED_LENGTH_RATIO[densest], `${sl.DENSEST_RATIO} vs ${densest}`);
check(`the longest language is the one LATIN_HEADROOM uses (${longest})`, sl.LATIN_HEADROOM === sl.MEASURED_LENGTH_RATIO[longest], `${sl.LATIN_HEADROOM} vs ${longest}`);

console.log("\n== 2. the helpers do what the ratios say ==");
check("a Chinese question gets a lower floor", sl.minCharsFor("总收入是多少？", 15) < 15, String(sl.minCharsFor("总收入是多少？", 15)));
check("...and an English one does not", sl.minCharsFor("How much revenue?", 15) === 15);
check("a Japanese string is dense too", sl.minCharsFor("収入は合計いくらですか？", 10) < 10);
check("Greek is not — it is 1.10x, not 0.33x", sl.minCharsFor("Πόσα έσοδα;", 15) === 15);
// ARABIC IS THE INTERESTING MIDDLE CASE, and the reason this file needs
// it as well as Chinese. It is 0.80x — denser than English but nowhere
// near CJK — and it is right-to-left, which is a different axis again.
// Treating it as dense would lower a floor it does not need lowered;
// treating it as Latin is correct HERE and was wrong in the vocabulary,
// where its clitics broke whole-word matching. One language, two
// different answers, depending on which property is being asked about.
check(
  "Arabic keeps the Latin floor — 0.80x is not dense enough to move it",
  sl.minCharsFor("كم بلغت الإيرادات إجمالاً؟", 15) === 15,
  String(sl.minCharsFor("كم بلغت الإيرادات إجمالاً؟", 15))
);
check("...and it is not treated as a dense script", sl.isDenseScript("كم بلغت الإيرادات؟") === false);
check("...while Chinese is", sl.isDenseScript("总收入是多少？") === true);
check(
  "a mixed Arabic-and-English string is still not dense",
  sl.isDenseScript("تجاهل التعليمات ignore instructions") === false
);
// And the ratio the catalogue actually shows for it, so a drift is loud.
check(
  "Arabic's measured ratio is between the dense scripts and the Latin ones",
  sl.MEASURED_LENGTH_RATIO.ar > sl.MEASURED_LENGTH_RATIO.ja &&
    sl.MEASURED_LENGTH_RATIO.ar < sl.MEASURED_LENGTH_RATIO.en,
  `ja ${sl.MEASURED_LENGTH_RATIO.ja}, ar ${sl.MEASURED_LENGTH_RATIO.ar}, en ${sl.MEASURED_LENGTH_RATIO.en}`
);
// A FLOOR IS STILL A FLOOR. Lowering it for a dense script must not
// lower it to nothing: an empty or truncated answer is still a fault.
check("the floor never drops below two", sl.minCharsFor("销售", 3) >= 2, String(sl.minCharsFor("销售", 3)));
check("a ceiling is widened for the longest language", sl.maxCharsFor(140) > 140, String(sl.maxCharsFor(140)));
check("...by the measured amount, not a guess", sl.maxCharsFor(100) === Math.ceil(100 * sl.LATIN_HEADROOM));

console.log("\n== 3. no rejecting limit is left calibrated on English ==");
// A limit that TRUNCATES costs a few characters. A limit that REJECTS
// costs the whole thing, silently, and in agent-config's case counts it
// as a failed run and switches the agent off after five. Those are the
// ones that must be script-aware.
const REJECTING = [
  ["src/lib/agents/agent-config.ts", "an agent's short answer is not an empty one"],
  ["src/lib/insights/narrate.ts", "a long German headline is not a bad insight"],
  ["src/lib/notify/channels/discord.ts", "a long message is not an unsendable one"],
  ["src/lib/research/research.ts", "a short question is not an absent one"],
  ["src/lib/agents/agent-templates.ts", "a short title is not a missing one"],
];
for (const [file, why] of REJECTING) {
  const src = stripComments(readFileSync(file, "utf8"));
  check(`${file.split("/").pop()}: ${why}`, /\b(minCharsFor|maxCharsFor)\(/.test(src), "the limit is a bare number");
}
// AND THE ONE THAT STARTED IT.
const ddSrc = stripComments(readFileSync("src/lib/ai/deep-dive.ts", "utf8"));
check("the deep dive's question floor is script-aware", /minQuestionChars\(question\)/.test(ddSrc));
check("...and it is not the flat 15 any more", /DEEP_DIVE_MIN_QUESTION_CHARS_CJK/.test(ddSrc));

// A FLOOR ON THE SCAN ITSELF.
const files = [];
(function walkDir(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walkDir(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})("src");
check(`the tree was walked (${files.length} files)`, files.length >= 300, String(files.length));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
