// SEVEN PEOPLE, SIX ANSWERS, THREE DIFFERENT SENTENCES.
//
// The three screens that could have said what this product is said three
// different things — a landing hero about being organised, a greeting
// about the time of day, and an onboarding step that opened by asking the
// user's goal without ever stating what was on offer. One of the seven
// left during that step.
//
// This gate holds the fix in place: ONE key, rendered in all three, in
// all ten languages, saying the thing the feedback actually named. Five
// of the seven said they would cancel ChatGPT, and the reason was not
// that this builds things — it was that it already knows their data.
//
// Run: node scripts/tests/one-sentence.test.mjs
import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";

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
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 8).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]),
);

const { loadTs } = await import("./load-ts.mjs");
const { ONE_SENTENCE_KEY, ONE_SENTENCE_SURFACES } = await loadTs("src/lib/i18n/one-sentence.ts");
const [namespace, key] = ONE_SENTENCE_KEY.split(".");

console.log("== 1. one sentence, in every language ==");
check(`the key is ${ONE_SENTENCE_KEY}`, Boolean(namespace) && Boolean(key));
for (const locale of LOCALES) {
  const value = messages[locale]?.[namespace]?.[key];
  check(
    `${locale}: ${JSON.stringify(value ?? null)}`,
    typeof value === "string" && value.length >= 12,
  );
}
// TEN DIFFERENT SENTENCES, NOT ONE COPIED TEN TIMES. An untranslated
// string is how a Greek reader gets an English promise, and the whole
// point is that the promise is the first thing they understand.
const englishValue = messages.en[namespace][key];
const untranslated = LOCALES.filter(
  (l) => l !== "en" && messages[l][namespace][key] === englishValue,
);
checkList("no locale is left holding the English text", untranslated);

console.log("\n== 2. it renders through the app's own formatter ==");
// Not a substring check on the JSON: the sentence has to survive ICU.
for (const locale of LOCALES) {
  const t = createTranslator({
    locale,
    messages: messages[locale],
    namespace,
    onError: () => {},
  });
  const rendered = t(key);
  check(
    `${locale}: renders without falling back to the key`,
    typeof rendered === "string" && rendered !== key && !rendered.includes(ONE_SENTENCE_KEY),
    JSON.stringify(rendered),
  );
}

console.log("\n== 3. all three surfaces render it ==");
check(
  `three surfaces are declared (${ONE_SENTENCE_SURFACES.length})`,
  ONE_SENTENCE_SURFACES.length >= 3,
);
const notRendering = [];
for (const surface of ONE_SENTENCE_SURFACES) {
  const src = readFileSync(surface.file, "utf8");
  const usesNamespace = new RegExp(`(?:use|get)Translations\\(\\s*"${namespace}"\\s*\\)`).test(src);
  const usesKey = new RegExp(`\\("${key}"\\)`).test(src);
  if (!usesNamespace || !usesKey) {
    notRendering.push(`${surface.file} — ${surface.when}`);
  }
}
checkList("every declared surface renders the sentence", notRendering);

console.log("\n== 4. the three old answers are gone ==");
// THE FAILURE MODE IS A SECOND SENTENCE, not a missing one. Leaving the
// old landing hero in the catalogue is how two descriptions come back:
// one of them gets rendered somewhere, and nothing says which is current.
const strayHero = LOCALES.filter((l) => messages[l].landing && "hero" in messages[l].landing);
checkList("the old landing hero key is gone from every locale", strayHero);
const landing = readFileSync("src/app/page.tsx", "utf8");
check(
  "the landing page no longer renders a hero of its own",
  !/t\("hero"\)/.test(landing),
);
// The greeting is still there — it just no longer occupies the line that
// should say what the product is.
const greeting = readFileSync("src/components/overview/greeting-header.tsx", "utf8");
check("the greeting still exists, below the heading", /greeting\.text/.test(greeting));
check(
  "...and the sentence is above it",
  greeting.indexOf(`tPromise("${key}")`) < greeting.indexOf("greeting.text"),
  "the first line after signing in must be the promise, not the time of day",
);

console.log("\n== 5. it is one sentence, not a paragraph ==");
// A description nobody finishes is a description nobody repeats, and the
// test of this whole change is whether four of five strangers say the
// same thing back.
const words = englishValue.split(/\s+/).filter(Boolean).length;
check(`the English sentence is ${words} words (<= 12)`, words <= 12, englishValue);
for (const locale of LOCALES) {
  const value = messages[locale][namespace][key];
  check(`${locale}: at most 90 characters (${value.length})`, value.length <= 90, value);
}

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
