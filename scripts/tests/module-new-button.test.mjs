// "ΝΕΟ ΙΣΤΟΤΟΠΟΙ".
//
// One template, module.new = "New {title}", with the page title
// substituted in. It produced three separate kinds of wrong text, all of
// them shipped to ten languages:
//
//   NUMBER   the title is the PLURAL page name, and the form adds one
//            row. "Νέο Ανταγωνιστές" is "New competitors".
//   GENDER   "Nouveau Recherche" — recherche is feminine, so Nouvelle.
//            Greek needs Νέος / Νέα / Νέο by the noun, and the template
//            used Νέο for all twenty.
//   THE NOUN /dashboard/finance is titled "Finance Agent", so the button
//            read "Νέο Πράκτορας Οικονομικών" — new finance AGENT — on a
//            form that adds a transaction.
//
// English hid all three, because English inflects almost nothing. That is
// what made it survive: the language it was written in is the only one it
// worked in.
//
// No ICU plural or select rule fixes this. The grammar depends on a noun
// the page title does not contain, so the phrase has to be authored per
// module per language — which is what Ideas had already been doing by
// hand ("Νέα ιδέα", "Nouvelle idée") while the other twenty went through
// the template.
//
// Run: node scripts/tests/module-new-button.test.mjs
import { readFileSync } from "node:fs";

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
  check(name, actual.length === 0, actual.slice(0, 10).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
function lookup(obj, dotted) {
  return dotted.split(".").reduce((node, part) => (node == null ? undefined : node[part]), obj);
}

const { loadTs } = await import("./load-ts.mjs");
const { MODULES } = await loadTs("src/lib/modules.ts");
const { BUILD_MODULES } = await loadTs("src/lib/build-modules.ts");
// CLASSIFIER_MODULES is [IDEAS_MODULE, ...MODULES] — it already contains
// the twelve. Spreading it alongside MODULES counted every tracker
// twice, which is how the first run of this file reported 33 modules and
// 12 "duplicate" phrases that were the same module seen twice.
const { CLASSIFIER_MODULES } = await loadTs("src/lib/classifier-modules.ts");
const ALL = [...CLASSIFIER_MODULES, ...BUILD_MODULES];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const modulesCode = stripComments(readFileSync("src/lib/modules.ts", "utf8"));
const formCode = stripComments(readFileSync("src/components/modules/generic-add-form.tsx", "utf8"));

console.log("== 1. the template is gone, in every language ==");
// Not "the component stopped calling it" — the STRING is gone. A retired
// template left in the catalogue is the one the next component finds.
checkList(
  "no locale still carries module.new",
  LOCALES.filter((l) => messages[l].module?.new !== undefined)
);
checkList(
  "and nothing anywhere still substitutes a title into a label",
  LOCALES.filter((l) => JSON.stringify(messages[l].module ?? {}).includes("{title}"))
);
check("the form no longer builds the label from the page title", !/t\("new", \{ title:/.test(formCode));
check("it reads the module's own phrase", /tKey\(module\.newKey\)/.test(formCode));

console.log("\n== 2. every module answers for itself ==");
// A FLOOR ON THE REGISTRIES, not a count of them. `>= 21` was a
// restatement of how many modules there happened to be, so V4 #19 + #20
// moving two out of build-modules.ts — because they became tools with
// bespoke pages — read as a regression. What matters here is that both
// registries were really loaded and that every module in them answers
// for itself; the number is not the property.
check(
  `both registries loaded (${CLASSIFIER_MODULES.length} classifier + ${BUILD_MODULES.length} tracking = ${ALL.length})`,
  CLASSIFIER_MODULES.length >= 13 && BUILD_MODULES.length >= 5,
  `found ${CLASSIFIER_MODULES.length} + ${BUILD_MODULES.length}`
);
checkList("every one declares a newKey", ALL.filter((m) => !m.newKey).map((m) => m.slug));
// Required, not optional — the same argument emptyKey settled. An
// optional key means the twenty-second module silently gets nothing.
check("newKey is required on the type", /newKey: ModuleMessageKey;/.test(modulesCode) && !/newKey\?/.test(modulesCode));
check("and typed as a key, not a string", !/newKey: string/.test(modulesCode));
checkList(
  "no two modules share a phrase key",
  Object.entries(
    ALL.reduce((acc, m) => ((acc[m.newKey] = (acc[m.newKey] ?? 0) + 1), acc), {})
  )
    .filter(([, n]) => n > 1)
    .map(([k, n]) => `${k} used by ${n} modules`)
);
for (const locale of LOCALES) {
  checkList(
    `${locale}: every phrase resolves`,
    ALL.filter((m) => typeof lookup(messages[locale], m.newKey) !== "string").map((m) => m.newKey)
  );
}

console.log("\n== 3. the phrases are singular, and the right noun ==");
// Checked against WHAT THE OLD TEMPLATE WOULD HAVE PRODUCED, not against
// "does the phrase contain the page title".
//
// The first version of this check did the latter and was wrong: German
// "Neuer Wettbewerber" legitimately contains "Wettbewerber" because the
// German singular and plural are the same word, and English "New
// Feedback" always will. A test that fails on correct translations gets
// weakened until it passes, and then it is guarding nothing. These are
// the exact strings that used to ship, kept here because they are the
// only precise statement of the bug.
const OLD_TEMPLATE = {
  en: "New {title}", el: "Νέο {title}", es: "Nuevo {title}", fr: "Nouveau {title}",
  de: "Neu: {title}", it: "Nuovo {title}", pt: "Novo {title}", zh: "新建 {title}",
  ja: "新規 {title}", ar: "جديد {title}",
};
const lazy = [];
for (const locale of LOCALES) {
  for (const m of ALL) {
    const phrase = String(lookup(messages[locale], m.newKey));
    const title = String(lookup(messages[locale], m.titleKey));
    const wouldHaveBeen = OLD_TEMPLATE[locale].replace("{title}", title);
    if (phrase === wouldHaveBeen) lazy.push(`${locale}/${m.slug}: still "${phrase}"`);
  }
}
checkList("no phrase is what the template would have produced", lazy);
// The finance case by name, in every language: the page is called an
// AGENT and the form adds a transaction, so the phrase must not say
// agent.
const AGENT_WORD = /agent|πράκτορ|agente|エージェント|代理|وكيل/i;
checkList(
  "the finance button does not offer to create an agent",
  LOCALES.filter((l) => AGENT_WORD.test(String(lookup(messages[l], ALL.find((m) => m.slug === "finance").newKey))))
);

console.log("\n== 4. gender and script, where the template broke ==");
// Greek: the article has to vary. If every Greek phrase starts with the
// same word, the gender problem was copied rather than fixed.
const elPhrases = ALL.map((m) => String(lookup(messages.el, m.newKey)));
const elFirstWords = new Set(elPhrases.map((p) => p.split(" ")[0]));
check(
  `el uses more than one form of "new" (${[...elFirstWords].join(" / ")})`,
  elFirstWords.size >= 2,
  elPhrases.slice(0, 4).join(" | ")
);
// The exact string the report named.
check(
  'el/websites reads "Νέος ιστότοπος", singular and masculine',
  lookup(messages.el, ALL.find((m) => m.slug === "websites").newKey) === "Νέος ιστότοπος"
);
// French: recherche is feminine.
check(
  "fr/research is Nouvelle, not Nouveau",
  String(lookup(messages.fr, ALL.find((m) => m.slug === "research").newKey)).startsWith("Nouvelle")
);
// German: three genders, three articles.
const deFirst = new Set(ALL.map((m) => String(lookup(messages.de, m.newKey)).split(" ")[0]));
check(`de uses Neuer/Neue/Neues as the noun requires (${[...deFirst].join(" / ")})`, deFirst.size >= 3);
// Non-Latin locales in their own script, which is where a copied English
// phrase shows up immediately.
const SCRIPTS = { el: /\p{Script=Greek}/u, zh: /\p{Script=Han}/u, ja: /\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/u, ar: /\p{Script=Arabic}/u };
for (const [locale, re] of Object.entries(SCRIPTS)) {
  checkList(
    `${locale}: every phrase is written in its own script`,
    ALL.filter((m) => !re.test(String(lookup(messages[locale], m.newKey)))).map((m) => m.slug)
  );
}
// And no locale is left as a copy of the English.
for (const locale of LOCALES.filter((l) => l !== "en")) {
  checkList(
    `${locale}: nothing is left in English`,
    ALL.filter((m) => lookup(messages[locale], m.newKey) === lookup(messages.en, m.newKey)).map((m) => m.slug)
  );
}
// Twenty-one distinct things are being added, so twenty-one distinct
// phrases. A duplicate means two modules claim to add the same thing.
for (const locale of LOCALES) {
  const phrases = ALL.map((m) => lookup(messages[locale], m.newKey));
  check(
    `${locale}: every module says something different (${new Set(phrases).size}/${phrases.length})`,
    new Set(phrases).size === phrases.length
  );
}

console.log("\n== 5. it fits a phone ==");
// The button is `min-h-[44px] px-4` with a plus icon at 375px. These are
// full sentences now rather than "New " plus a word, so the longest one
// is worth knowing rather than discovering in a screenshot.
for (const locale of LOCALES) {
  const longest = ALL.map((m) => String(lookup(messages[locale], m.newKey))).sort((a, b) => b.length - a.length)[0];
  check(`${locale}: the longest phrase is workable (${longest.length} chars: "${longest}")`, longest.length <= 34);
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
