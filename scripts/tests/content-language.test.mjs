// "Το Deep Research βγάζει ερωτήσεις και αναφορά στα αγγλικά ακόμα κι όταν
//  ο χρήστης γράφει ελληνικά."
//
// THE CAUSE, which the report had already located precisely: every feature
// that thought about language took it from useLocale() — the language of
// the MENUS — and passed the ISO CODE into the prompt. A Greek user running
// an English interface typed a Greek topic and got `language = "en"`, so
// the model wrote English. Obediently. It was told to.
//
// Two separate defects in one line, and both are fixed here:
//   THE SOURCE — language follows the TEXT, and the UI locale is a fallback
//   for when the text is too short to tell, which is the only thing it is
//   actually evidence of.
//   THE VALUE — the prompt gets "Greek", not "el". Asking a model to infer
//   a language from a two-letter tag works mostly, and "mostly" is not a
//   property to rely on when writing the word costs nothing.
//
// Run: node scripts/tests/content-language.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

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
function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const cl = await loadTs("src/lib/content-language.ts");

// ---------------------------------------------------------------------
console.log("== 1. the prompt gets a NAME, not a code ==");
eq("el is Greek", cl.languageName("el"), "Greek");
eq("de is German", cl.languageName("de"), "German");
eq("ja is Japanese", cl.languageName("ja"), "Japanese");
// "it" is both the Italian tag and an English pronoun, which is exactly the
// kind of collision that makes a bare code a bad thing to put in a prompt.
eq("it is Italian, not a pronoun", cl.languageName("it"), "Italian");
eq("an unknown code falls back to English", cl.languageName("xx"), "English");
check(
  "every supported locale has a name",
  Object.keys(cl.LANGUAGE_NAMES).length === 10 &&
    Object.values(cl.LANGUAGE_NAMES).every((n) => typeof n === "string" && n.length > 2)
);

// ---------------------------------------------------------------------
console.log("\n== 2. detection follows the text ==");

// Real sentences of the length people actually type into these features,
// not word lists.
const SAMPLES = {
  el: "Θέλω μια αναλυτική έρευνα για την αγορά του specialty coffee στη Θεσσαλονίκη, με στοιχεία για τον ανταγωνισμό και τις τιμές.",
  en: "I would like a detailed report on the specialty coffee market, with data about the competition and what customers are looking for.",
  de: "Ich hätte gerne eine ausführliche Analyse des Marktes für Spezialitätenkaffee, mit Zahlen zur Konkurrenz und zu den üblichen Preisen.",
  fr: "Je voudrais une analyse détaillée du marché du café de spécialité, avec des chiffres sur la concurrence et sur les prix pratiqués.",
  es: "Quiero un informe detallado sobre el mercado del café de especialidad, con datos sobre la competencia y los precios que se aplican.",
  it: "Vorrei un'analisi dettagliata del mercato del caffè speciale, con dati sulla concorrenza e sui prezzi che vengono applicati oggi.",
  pt: "Queria uma análise detalhada do mercado do café de especialidade, com dados sobre a concorrência e também sobre os preços praticados.",
  zh: "我想要一份关于精品咖啡市场的详细报告，包括竞争对手的数据以及目前的价格水平。",
  ja: "スペシャルティコーヒー市場についての詳しいレポートが欲しいです。競合他社のデータと現在の価格帯も含めてください。",
  ar: "أريد تقريرًا مفصلاً عن سوق القهوة المختصة، مع بيانات عن المنافسة والأسعار السائدة حاليًا.",
};
for (const [expected, text] of Object.entries(SAMPLES)) {
  eq(`${expected}: detected from the text`, cl.detectLanguage(text), expected);
}

// Japanese and Chinese share Han characters. Testing Han first would call
// every Japanese sentence Chinese, so kana has to win — worth its own case
// because it is the one pair that can silently collapse.
eq(
  "a Japanese sentence heavy in kanji is still Japanese",
  cl.detectLanguage("日本語の記事を三つ探して、要点をまとめてください。"),
  "ja"
);
// A Greek sentence full of borrowed English tech words is still Greek.
eq(
  "borrowed English words do not make a Greek sentence English",
  cl.detectLanguage("Θέλω ένα SaaS startup landing page με modern design και καλό branding"),
  "el"
);

console.log("\n== 3. it declines to guess rather than guessing wrong ==");
eq("empty text", cl.detectLanguage(""), null);
eq("two characters are not evidence", cl.detectLanguage("Hi"), null);
eq("a proper noun is not a language", cl.detectLanguage("Ionexa Santorini Vercel"), null);
// URLs are full of English function words and say nothing about the writer.
eq(
  "a bare URL is not English evidence",
  cl.detectLanguage("https://www.example.com/the-and-with-for-what-how"),
  null
);

console.log("\n== 4. the UI locale is a fallback, not the source ==");
// THE REPORTED CASE, exactly: Greek text, English interface.
const greekInEnglishUi = cl.resolveContentLanguage(SAMPLES.el, "en");
eq("Greek text + English UI resolves to Greek", greekInEnglishUi.code, "el");
eq("...and hands the prompt the name", greekInEnglishUi.name, "Greek");
eq("...and records that it was detected", greekInEnglishUi.source, "detected");
// The mirror case, which must not regress: English text, Greek interface.
const englishInGreekUi = cl.resolveContentLanguage(SAMPLES.en, "el");
eq("English text + Greek UI resolves to English", englishInGreekUi.code, "en");
// Undetectable text is where the UI locale earns its place.
const tooShort = cl.resolveContentLanguage("ok", "el");
eq("undetectable text falls back to the UI locale", tooShort.code, "el");
eq("...and says so", tooShort.source, "ui-locale");
eq(
  "an unsupported UI locale falls back to English",
  cl.resolveContentLanguage("ok", "kl").code,
  "en"
);
eq("a missing UI locale falls back to English", cl.resolveContentLanguage("ok", undefined).code, "en");

// ---------------------------------------------------------------------
console.log("\n== 5. the instruction says the whole answer, and how to write it ==");
const greek = cl.resolveContentLanguage(SAMPLES.el, "en");
const instruction = cl.languageInstruction(greek, "the report");
check("it names the language by name", /in Greek/.test(instruction), instruction);
check("it never leaks the bare code", !/\bel\b/.test(instruction), instruction);
check("it names what is being written", /the report/.test(instruction));
// The reported symptom included English HEADINGS on an otherwise Greek
// answer, so headings are called out rather than left to "the answer".
check("headings and labels are covered explicitly", /every heading/.test(instruction));
check("and the specific Greek machinery is named", /τονισμό/.test(instruction), instruction);
check("proper nouns are exempted", /Proper nouns stay as they are/.test(instruction));

const german = cl.languageInstruction(cl.resolveContentLanguage(SAMPLES.de, "en"));
check("German gets its cases named", /Kasus/.test(german), german);
const french = cl.languageInstruction(cl.resolveContentLanguage(SAMPLES.fr, "en"));
check("French gets agreement named", /accord en genre et en nombre/.test(french), french);
// A language with no bespoke note still gets a usable instruction rather
// than an empty one.
check(
  "a language with no bespoke note still gets a quality clause",
  /correct spelling, grammar and syntax/.test(cl.languageInstruction(cl.resolveContentLanguage(SAMPLES.zh, "en")))
);

// ---------------------------------------------------------------------
console.log("\n== 6. every feature that had the bug is wired to the fix ==");
// Features with USER PROSE to read a language off. These are the ones the
// report was about, and detection is mandatory for them.
const DETECTING_FEATURES = [
  ["Deep Research", "src/app/api/research/route.ts", "topicCheck.topic"],
  ["Files → Ask", "src/app/api/files/ask/route.ts", "question"],
];
for (const [label, file, from] of DETECTING_FEATURES) {
  const src = readFileSync(file, "utf8");
  check(`${label}: resolves the language from the user's text`, /resolveContentLanguage\(/.test(src), file);
  check(
    `${label}: ...specifically from ${from}`,
    new RegExp(`resolveContentLanguage\\(${from.replace(".", "\\.")},`).test(src),
    file
  );
  check(
    `${label}: the UI locale is named as a fallback, not the source`,
    /uiLocale/.test(src) && !/const language = typeof body\?\.language/.test(src),
    file
  );
}

// Insights is the honest exception, and asserting the same thing of it
// would have been wrong. Its findings are computed from uploaded numbers;
// the user never writes a sentence for the run, so there is no text to read
// a language off and the UI locale is not a bad source here — it is the only
// one. What it must still do is pass the NAME rather than the code, which is
// the half of the defect that did apply to it.
{
  const src = readFileSync("src/app/api/insights/generate/route.ts", "utf8");
  check(
    "Insights: goes through the shared language module",
    /contentLanguageFromCode\(/.test(src)
  );
  check(
    "Insights: no longer hands a bare code to the prompt",
    !/const language = typeof body\?\.language === "string" \? body\.language\.slice\(0, 12\) : "en";/.test(src)
  );
  check(
    "Insights: and says why it does not detect",
    /NO user prose/.test(src),
    "an exception with no stated reason reads as an oversight"
  );
}

// And the prompts receive the NAME. This is the assertion that would have
// caught the original defect: it fails on `(${language})` holding a code.
const research = readFileSync("src/lib/research/research.ts", "utf8");
check("research prompts take a language NAME", /languageName|language\.name|languageInstruction/.test(research));
check(
  "the old bare-code interpolation is gone from research",
  !/Write in the user's language \(\$\{language\}\)/.test(research),
  "this is the literal line that shipped a code into the prompt"
);

// ---------------------------------------------------------------------
console.log("\n== 7. mixed-language text picks the DOMINANT language ==");
// Greek prose full of borrowed English tech words is Greek, and English
// prose containing a Greek product name is English. Scoring by proportion
// rather than by first-match is what makes both come out right.
eq(
  "Greek prose with English tech terms",
  cl.detectLanguage("Θέλω ένα dashboard με analytics και ένα CRM integration για τους πελάτες μου στη Λάρισα"),
  "el"
);
eq(
  "English prose naming a Greek company",
  cl.detectLanguage("I want a report on how the Ελληνικά Ταχυδρομεία network compares with the private couriers"),
  "en"
);
eq(
  "German prose with English loanwords",
  cl.detectLanguage("Ich brauche ein Dashboard mit Analytics und einem CRM Integration für meine Kunden in Leipzig"),
  "de"
);

// ---------------------------------------------------------------------
console.log("\n== 8. THE GATE: a new AI call cannot reintroduce the bug ==");
//
// The defect was not hard to see once you looked — `(${language})` with a
// UI locale in it, three times in one file. It shipped because nothing was
// looking. This is the thing that looks, on every build.
//
// It scans every module that builds a system prompt and fails on the two
// shapes that caused it: interpolating a variable named `language`/`locale`
// straight into prompt text, and taking body.language as the answer rather
// than as a fallback.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Source with // and /* *\/ comments removed, so the guards below grade
 *  what is SENT to a model rather than what is written about it. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const ALL = [...walk("src/lib"), ...walk("src/app/api")];

// A bare code interpolated into prompt prose. `language.name` and
// `languageInstruction(...)` are the sanctioned forms and do not match.
const BARE_CODE = /\$\{\s*(?:params\.)?(?:config\.)?(?:language|locale)\s*\}/;
const offenders = [];
for (const file of ALL) {
  if (file.endsWith("content-language.ts")) continue;
  const src = readFileSync(file, "utf8");
  // Only look inside template literals that read like prompt text — a
  // `${language}` in a URL or a log line is not this bug.
  for (const line of stripComments(src).split("\n")) {
    if (!BARE_CODE.test(line)) continue;
    if (!/language|Language|LANGUAGE|Write|write|Reply/.test(line)) continue;
    offenders.push(`${file}: ${line.trim().slice(0, 90)}`);
  }
}
check(
  "no prompt interpolates a bare language code",
  offenders.length === 0,
  offenders.join("\n        ") + "\n        use languageInstruction(resolveContentLanguage(userText, uiLocale)) instead"
);

// The second shape: a route that reads body.language and treats it as the
// answer. The sanctioned form names it uiLocale and passes it as the
// FALLBACK argument of resolveContentLanguage.
const uiAsAnswer = [];
for (const file of ALL) {
  const src = readFileSync(file, "utf8");
  if (!/body\?\.language/.test(src)) continue;
  const takesItAsTheAnswer = /const language = typeof body\?\.language/.test(src);
  if (takesItAsTheAnswer) uiAsAnswer.push(file);
}
check(
  "no route takes the UI locale as the answer",
  uiAsAnswer.length === 0,
  uiAsAnswer.join(", ") + "\n        name it uiLocale and pass it to resolveContentLanguage(userText, uiLocale)"
);

// And the mirror defect, which the sweep turned up on its own: a prompt
// that hardcodes ONE language for everybody. A Greek prompt telling the
// model to answer in Greek is the reported bug with the languages swapped.
const hardcoded = [];
for (const file of ALL) {
  // Comments stripped first. The check flagged its own fix's explanatory
  // comment on the first run — a guard that fires on prose ABOUT the bug
  // teaches people to ignore it, which is worse than not having it.
  const src = stripComments(readFileSync(file, "utf8"));
  if (/Απάντα στα ελληνικά|Answer in Greek|answer in Greek/i.test(src)) hardcoded.push(file);
}
check(
  "no prompt hardcodes one language for every user",
  hardcoded.length === 0,
  hardcoded.join(", ")
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED:\n" + failures.map((f) => "  - " + f).join("\n"));
}
process.exit(failures.length === 0 ? 0 : 1);
