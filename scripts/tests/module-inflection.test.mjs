#!/usr/bin/env node
/*
 * "παρουσίαση πωλήσεων" REACHED NOTHING.
 *
 * Run: node scripts/tests/module-inflection.test.mjs
 *
 * WHERE THE QUESTION CAME FROM. The owner's own test sentence for the
 * new data context — a sales presentation, the most ordinary phrase
 * there is — scored every module ZERO and pulled in no Sales rows at
 * all. The nominative "πωλήσεις" scored 1. The matcher compares whole
 * folded words, the synonym list carried the nominative, and Greek puts
 * the GENITIVE after another noun: παρουσίαση πωλήσεων, κόστος
 * προϊόντων, λίστα ιδεών. The one form the language actually uses in a
 * brief was the one form the vocabulary did not have.
 *
 * THE SAME SHAPE AS module-verbs.test.mjs, one case along. That file
 * found a vocabulary harvested from an interface, which is all nouns
 * and no verbs. This one finds the same vocabulary carrying each noun in
 * exactly ONE case, because that is how a label is written on a screen.
 *
 * SO THE CHECK RANGES OVER EVERY MODULE, not over the one that was
 * reported. If the rule is "a module's own name reaches it in the case
 * people type", the population is every module's Greek primary terms —
 * generated from the list itself, never typed here, so a module added
 * tomorrow is held to it without anybody remembering.
 *
 * NOT A STEMMER, and the reason is in lib/ai/module-synonyms.ts: the
 * ending is what changes, and `stem` only allows letters to be ADDED.
 */
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const syn = await loadTs("src/lib/ai/module-synonyms.ts");
const rel = await loadTs("src/lib/ai/module-relevance.ts");
const vocabMod = await loadTs("src/lib/ai/module-vocabulary.ts");
const uni = await loadTs("src/lib/text/unicode-patterns.ts");
const classifier = await loadTs("src/lib/classifier-modules.ts");

const vocabulary = vocabMod.moduleVocabulary();
const byslug = new Map(vocabulary.map((v) => [v.slug, v]));

/** Which modules a phrase reaches, strongest first. The REAL scorer. */
function reaches(phrase) {
  const folded = uni.foldForMatch(phrase);
  const words = rel.questionWords(folded);
  return vocabulary
    .map((v) => ({ slug: v.slug, score: rel.scoreTerms(words, folded, v.terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------
console.log("== 1. the generator only touches Greek, and only regular endings ==");

check("a Latin word is left alone", syn.greekPluralForms("sales").length === 0, JSON.stringify(syn.greekPluralForms("sales")));
check("a mixed word is left alone", syn.greekPluralForms("crm πελάτες").length === 0);
// THE OUTPUT IS FOLDED, on purpose: the matcher compares folded words,
// so an accented form would be folded again anyway. Each expectation is
// therefore written through the same fold rather than as the accented
// word a person would type — writing it the other way is what made the
// first version of this check fail on a correct answer.
check("πωλήσεις -> πωλήσεων",
  syn.greekPluralForms("πωλήσεις")[0] === uni.foldForMatch("πωλήσεων"),
  JSON.stringify(syn.greekPluralForms("πωλήσεις")));
check("ιδέες -> ιδεών (the accent moves, and the fold removes it)",
  syn.greekPluralForms("ιδέες")[0] === uni.foldForMatch("ιδεών"),
  JSON.stringify(syn.greekPluralForms("ιδέες")));
check("a Greek word with no regular plural ending is left alone",
  syn.greekPluralForms("κόστος").length === 0, JSON.stringify(syn.greekPluralForms("κόστος")));

// ---------------------------------------------------------------------
console.log("\n== 2. every module: its own Greek name reaches it, in both cases ==");

// THE POPULATION IS GENERATED FROM THE LIST, never typed here.
const GREEK = /^[Ͱ-Ͽἀ-῿]+$/;
let pairsChecked = 0;
const misses = [];
for (const config of classifier.CLASSIFIER_MODULES) {
  // THE PRIMARY LIST, which is the population the shipped code inflects
  // — not synonymsFor, which also returns the verbs and the generated
  // forms themselves. The first run of this file used synonymsFor and
  // duly reported that "επινόησων" reaches nothing, which is true and is
  // a statement about a word this product never makes.
  const terms = (syn.MODULE_SYNONYMS[config.slug]?.primary ?? []).filter((t) => GREEK.test(t));
  for (const term of terms) {
    const inflected = syn.greekPluralForms(term);
    for (const form of inflected) {
      pairsChecked++;
      // The phrase a person types: another noun, then the genitive.
      const hit = reaches(`παρουσίαση ${form}`);
      if (!hit.some((h) => h.slug === config.slug)) {
        misses.push(`${config.slug}: "${term}" -> "${form}" reaches ${hit.map((h) => h.slug).join("/") || "nothing"}`);
      }
    }
  }
}
check(`there are inflected forms to check (${pairsChecked})`, pairsChecked >= 10, String(pairsChecked));
check(`every generated plural still reaches its own module (${pairsChecked - misses.length}/${pairsChecked})`,
  misses.length === 0, misses.slice(0, 8).join("\n        "));

// ---------------------------------------------------------------------
console.log("\n== 3. the sentences a person actually writes ==");

// NAMED, because a generated corpus checks the generator against itself.
// These are phrases, not single words, and each names the module a
// reader would expect — the thing the generated half cannot verify.
const PHRASES = [
  ["παρουσίαση πωλήσεων", "sales"],
  ["κόστος προϊόντων", "products"],
  ["λίστα ιδεών", "ideas"],
  ["ανάλυση ανταγωνιστών", "competitors"],
];
for (const [phrase, slug] of PHRASES) {
  const hit = reaches(phrase);
  check(`"${phrase}" reaches ${slug}`, hit.some((h) => h.slug === slug),
    `reaches ${hit.map((h) => `${h.slug}:${h.score}`).join(", ") || "nothing"}`);
}

// AND THE NOMINATIVE STILL WORKS. Appending forms must not cost the
// ones that already matched — the whole argument for appending.
check('the nominative "πωλήσεις" still reaches sales', reaches("πωλήσεις").some((h) => h.slug === "sales"));

// THAT LAST CHECK IS NOT SENSITIVE ENOUGH ON ITS OWN, and its own
// mutation run proved it: replacing the primary terms with the
// generated ones left it green, because the module's Greek TITLE is in
// the vocabulary too and carries the nominative independently. So the
// property is asserted where it lives — every primary term is still in
// what synonymsFor returns, for every module.
{
  const lost = [];
  for (const config of classifier.CLASSIFIER_MODULES) {
    const primary = syn.MODULE_SYNONYMS[config.slug]?.primary ?? [];
    const returned = new Set(syn.synonymsFor(config.slug));
    for (const term of primary) if (!returned.has(term)) lost.push(`${config.slug}: ${term}`);
  }
  check(`every primary term survives the generation (${lost.length} lost)`, lost.length === 0,
    lost.slice(0, 8).join(", "));
}
check('English "sales report" still reaches sales', reaches("sales report").some((h) => h.slug === "sales"));

// ---------------------------------------------------------------------
console.log("\n== 4. and the vocabulary did not explode ==");

// A generator that produced a term for every word would match
// everything, which looks exactly like a working one. Measured: the
// added forms are a small fraction of the list.
const before = classifier.CLASSIFIER_MODULES.reduce(
  (n, c) => n + (byslug.get(c.slug)?.terms.length ?? 0), 0);
console.log(`        ${pairsChecked} generated forms across ${before} vocabulary terms`);
check(`the generated forms are a minority of the vocabulary (${pairsChecked} of ${before})`,
  pairsChecked > 0 && pairsChecked < before / 4, `${pairsChecked} / ${before}`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
