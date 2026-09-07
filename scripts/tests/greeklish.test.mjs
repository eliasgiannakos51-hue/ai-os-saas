#!/usr/bin/env node
/*
 * GREEKLISH, AND THE ONE THING THAT MATTERS MORE THAN THE FOLD.
 *
 * "thelo na ftiakso" is Greek. The app saw noise. The fold that fixes it
 * is the easy half; the hard half is that SIX surfaces needed it and they
 * did not share a seam — four decide a match with `.includes()` on folded
 * text, two test hand-written regex alternations. A fold added to
 * whichever one somebody was looking at is this repository's own named
 * shape, "wired at the one place somebody needed it".
 *
 * So section 1 is the list of six. It is explicit, and it goes red for
 * any of them that stops calling the shared implementation.
 *
 * THE FOUR TIMES THIS EXACT CLASS HAS BROKEN HERE — \b is ASCII,
 * foldForMatch's private copy, MIN_CHARS on CJK, the owner's own name in
 * another case — were all "text matching that worked in one script". The
 * corpus below runs both directions so this is not the fifth.
 *
 * Run: node scripts/tests/greeklish.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

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

const u = await loadTs("src/lib/text/unicode-patterns.ts");
const syn = await loadTs("src/lib/ai/module-synonyms.ts");
const rel = await loadTs("src/lib/ai/module-relevance.ts");
const kb = await loadTs("src/lib/support/knowledge-base.ts");

console.log("== 1. all six matching surfaces call the one implementation ==");
//
// THE CLASSIFIER IS THE HONEST EXCEPTION. What decides which module a
// message is about, in the create route, is a MODEL call — it reads
// greeklish natively and there is no pattern to teach. Listing it with a
// reason is the point: an unexplained absence from this list is how the
// sixth surface quietly never gets it.
const SURFACES = [
  ["src/lib/text/search-match.ts", "⌘K and every list filter"],
  ["src/lib/support/knowledge-base.ts", "the canned answers"],
  ["src/lib/ai/module-relevance.ts", "which module a question is about"],
  ["src/lib/trading/rules.ts", "the trading-rule parser"],
  ["src/lib/website-negative-instructions.ts", "what a website brief forbids"],
];
const missing = SURFACES.filter(([f]) => !/textHasGreeklish(Term|Stem)\(/.test(readFileSync(f, "utf8")));
for (const [f, what] of SURFACES) {
  const ok = /textHasGreeklish(Term|Stem)\(/.test(readFileSync(f, "utf8"));
  console.log(`        ${ok ? "calls the seam" : "DOES NOT     "}  ${f} — ${what}`);
}
check(
  `every text-matching surface calls the shared implementation (${SURFACES.length} listed, ${missing.length} not)`,
  SURFACES.length >= 5 && missing.length === 0,
  missing.map(([f]) => f).join(", ")
);
check(
  "and there is exactly one implementation of it",
  /export function textHasGreeklishTerm/.test(readFileSync("src/lib/text/unicode-patterns.ts", "utf8")) &&
    SURFACES.every(([f]) => !/function textHasGreeklish/.test(readFileSync(f, "utf8"))),
  "a second copy in a consumer is the shape this file exists to prevent"
);

// AND CALLING IT IS NOT THE SAME AS USING THE ANSWER. Section 1 reads
// source; these five run the surfaces. Every one of them was added
// because the mutation that unwired the behaviour left section 1 green —
// `false && textHasGreeklishTerm(...)` still contains the call.
const search = await loadTs("src/lib/text/search-match.ts");
check(
  'a Latin query finds a Greek row ("esoda" in "Έσοδα Ιουλίου")',
  search.matchesSearch("Έσοδα Ιουλίου", "esoda"),
  "the ⌘K filter is the surface a user meets first"
);
check(
  '...and does not find an unrelated one',
  !search.matchesSearch("Πελάτες Αθήνας", "esoda")
);
check(
  "the seam refuses a text that is already Greek, even a mixed one",
  !u.textHasGreeklishTerm("θέλω esoda", ["έσοδα"]),
  "MIXED is the case that matters: an all-Greek text has no Latin tokens to try, so it is refused by arithmetic rather than by the guard"
);
check(
  "a stem cannot swallow a much longer word",
  u.textHasGreeklishStem("kratisi", ["κράτησ"]) &&
    !u.textHasGreeklishStem("kratisiologikotatos", ["κράτησ"]),
  "the allowance is MAX_INFLECTION, not unlimited"
);
check(
  "a skeleton under three characters matches nothing",
  !u.isGreeklishOf("to", "τω") && !u.isGreeklishOf("na", "να") && u.isGreeklishOf("nero", "νερό"),
  "short skeletons collide with almost everything. The floor is on the SKELETON, not the spelling: \"ναι\" is three letters and reduces to two, because the digraph is one sound"
);
// THE PHRASE TRIGGER ON ITS OWN, because in section 4 a single-word
// trigger sits beside it and can carry the match — which is how the
// digraph-marker bug survived its own mutation.
check(
  'a two-word trigger needs BOTH its words ("akyrwsh sindromhs" yes, "akyrwsh mono" no)',
  u.textHasGreeklishTerm("akyrwsh sindromhs", ["ακύρωση συνδρομής"]) &&
    !u.textHasGreeklishTerm("akyrwsh mono", ["ακύρωση συνδρομής"]),
  "the marker for a digraph must not be a space, or the two words fuse into one and half a phrase matches it"
);

console.log("\n== 2. the corpus, in both directions ==");
const PAIRS = [
  ["θέλω", ["thelo", "thelw", "8elw", "8elo"]],
  ["συνδρομή", ["sindromi", "syndromi", "sindromh", "syndromh"]],
  ["έσοδα", ["esoda"]],
  ["έξοδα", ["exoda", "eksoda", "ejoda", "e3oda"]],
  ["ξέρω", ["xero", "ksero", "jero"]],
  ["χαρά", ["xara", "chara", "hara"]],
  ["ημέρα", ["hmera", "imera"]],
  ["ψάχνω", ["psaxno", "psachno"]],
  ["ακύρωση", ["akyrosi", "akirwsh", "akurwsi"]],
  ["φτιάξω", ["ftiakso", "ftiaxo", "ftia3w"]],
  ["αυτό", ["auto", "avto", "afto"]],
  ["εύκολο", ["eukolo", "evkolo", "efkolo"]],
  ["πληρωμή", ["pliromi", "plhrwmh"]],
  ["τιμολόγιο", ["timologio"]],
  ["κέρδος", ["kerdos"]],
  ["δαπάνες", ["dapanes"]],
];
const forms = PAIRS.reduce((n, [, f]) => n + f.length, 0);
const misses = [];
for (const [greek, spellings] of PAIRS)
  for (const f of spellings)
    if (!u.isGreeklishOf(f, greek)) misses.push(`${f} !~ ${greek}`);
check(
  `every spelling reaches its Greek word (${forms - misses.length}/${forms})`,
  forms >= 40 && misses.length === 0,
  misses.join(" | ")
);
// THE OTHER DIRECTION: the Greek word must not be treated as greeklish,
// and a Latin word must not be treated as Greek. Both guards, tested.
check(
  "a Greek string is never read as greeklish of something",
  PAIRS.every(([greek]) => !u.isGreeklishOf(greek, greek)),
  "isGreeklishOf refuses a Latin argument that contains Greek letters"
);
check(
  "...and a Latin target is refused too",
  !u.isGreeklishOf("thelo", "thelo"),
  "the target has to be Greek or there is nothing to transliterate"
);
// THE AMBIGUOUS LETTERS, named because they are the ones that would push
// somebody towards transliterating instead of comparing skeletons.
check(
  `x is read as BOTH chi and xi (${u.greeklishSkeletons("xero").join(", ")})`,
  u.isGreeklishOf("xero", "ξέρω") && u.isGreeklishOf("xara", "χαρά")
);
check(
  `h is read as BOTH eta and chi (${u.greeklishSkeletons("hara").join(", ")})`,
  u.isGreeklishOf("hmera", "ημέρα") && u.isGreeklishOf("hara", "χαρά")
);
check(
  "u is read as BOTH theta and the vowel",
  u.isGreeklishOf("uelo", "θέλω") && u.isGreeklishOf("akurwsi", "ακύρωση")
);
check(
  `the branch count is bounded (${u.greeklishSkeletons("xhuxhuxhuxhu").length} for a word of nothing but ambiguous letters)`,
  u.greeklishSkeletons("xhuxhuxhuxhu").length <= 16
);

console.log("\n== 3. an English word is not a Greek one ==");
//
// MEASURED AGAINST THIS APP'S OWN VOCABULARY, not asserted. Every Greek
// word the module matcher knows, against every English word it knows plus
// the ones a user of this product types.
const greekVocab = new Set();
const englishVocab = new Set();
for (const v of Object.values(syn.MODULE_SYNONYMS))
  for (const list of Object.values(v))
    if (Array.isArray(list))
      for (const w of list) {
        if (u.GREEK_LETTER_PATTERN.test(w)) greekVocab.add(w);
        else if (/^[a-z]+$/i.test(w)) englishVocab.add(w.toLowerCase());
      }
for (const w of "email admin export import login password dashboard settings account profile search filter delete update create report invoice client agent website chat file note task team plan price credit token model prompt".split(" "))
  englishVocab.add(w);
const collisions = [];
for (const e of englishVocab)
  for (const g of greekVocab)
    if (u.isGreeklishOf(e, g)) collisions.push(`${e} ~ ${g}`);
console.log(`        ${greekVocab.size} Greek × ${englishVocab.size} English = ${greekVocab.size * englishVocab.size} pairs`);
console.log(`        collisions: ${collisions.join(", ") || "none"}`);
check(
  `the vocabularies are real and were compared (${greekVocab.size} × ${englishVocab.size})`,
  greekVocab.size >= 40 && englishVocab.size >= 100
);
// ONE IS ALLOWED AND NAMED. "idea" and the Greek for it ARE the same
// word and point at the same module, so matching them is correct. Any
// OTHER collision is a defect, and the allowance is a list rather than a
// count so a second one cannot hide inside a threshold.
const ALLOWED_COLLISIONS = new Set(["idea ~ ιδέα"]);
const unexpected = collisions.filter((c) => !ALLOWED_COLLISIONS.has(c));
check(
  `no English word is read as a different Greek word (${collisions.length} collisions, ${unexpected.length} unexpected)`,
  unexpected.length === 0,
  unexpected.join(", ")
);
check(
  "...and every allowed collision still happens, so the list cannot go stale",
  [...ALLOWED_COLLISIONS].every((c) => collisions.includes(c)),
  "an allowance that matches nothing is an allowance hiding whatever replaces it"
);
check(
  "nothing is ever rewritten: no exported function returns Greek",
  u.greekSkeleton("θέλω") === "8elo" && !u.GREEK_LETTER_PATTERN.test(u.greeklishSkeletons("thelo").join("")),
  "these return skeletons for comparing, so \"email\" cannot become a Greek word"
);

console.log("\n== 4. the three questions the owner asked for ==");
const financeScore = (q) => {
  const f = u.foldForMatch(q);
  return rel.scoreTerms(rel.questionWords(f), f, syn.MODULE_SYNONYMS.finance.primary);
};
check(
  `"thelo na dw ta esoda mou" reaches finance (${financeScore("thelo na dw ta esoda mou")})`,
  financeScore("thelo na dw ta esoda mou") >= 1
);
check(
  `"poso ejodepsa" reaches finance (${financeScore("poso ejodepsa")})`,
  financeScore("poso ejodepsa") >= 1
);
check(
  "...and the Greek spelling of each scores the same",
  financeScore("θέλω να δω τα έσοδά μου") === financeScore("thelo na dw ta esoda mou") &&
    financeScore("πόσο ξόδεψα") === financeScore("poso ejodepsa"),
  "a greeklish question that scores differently from its Greek twin is a second behaviour, not a fold"
);
const ARTICLES = [
  { slug: "cancel-subscription", locale: "el", answer: "…", triggers: ["ακύρωση συνδρομής", "συνδρομή", "ακύρωση"] },
];
const hit = (q) => kb.matchCannedAnswer(q, ARTICLES);
check('"sindromi" reaches the cancellation article', Boolean(hit("sindromi")));
check('...and so does the two-word "akyrwsh sindromhs"', Boolean(hit("akyrwsh sindromhs")));
check('...while "email" reaches nothing', !hit("email"));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
