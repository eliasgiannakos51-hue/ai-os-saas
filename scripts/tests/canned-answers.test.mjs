// Answering without a model.
//
// Two ways this feature can be worse than not having it:
//   1. It answers a question about the ACCOUNT from a fixed string, so
//      every user is told the same thing about their own balance.
//   2. It states a price or a credit cost that has since changed, and the
//      user holds us to a number nobody reviewed.
// Both are checked here, and both are hard failures.
//
// Run: node scripts/tests/canned-answers.test.mjs
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}

const kb = await loadTs("src/lib/support/knowledge-base.ts");
const { matchCannedAnswer, isAccountSpecific, normalize, articlesByCategory } = kb;

// The catalogue is rows in help_articles now, not a literal in the app, so
// the checks below read the SEED — the data that actually ships — and pass
// the rows for one language into the matcher the way the route does.
const { EN } = await import("../help-articles/en.mjs");
const { EL } = await import("../help-articles/el.mjs");
const { CORE_1, CORE_SLUGS } = await import("../help-articles/core-1.mjs");
const { CORE_2 } = await import("../help-articles/core-2.mjs");
const CORE = { ...CORE_1, ...CORE_2 };
const BASE = new Map(EN.map((a) => [a.slug, a]));
const shape = (locale) => (slug, a) => ({
  slug, locale, title: a.title, body: a.body, category: BASE.get(slug).category,
  triggers: a.triggers, href: BASE.get(slug).href ?? null,
});
const ROWS = {
  en: EN.map((a) => shape("en")(a.slug, a)),
  el: EL.map((a) => shape("el")(a.slug, a)),
  ...Object.fromEntries(Object.keys(CORE).map((l) => [l, CORE_SLUGS.map((s) => shape(l)(s, CORE[l][s]))])),
};
// The old name, kept so the rest of this file reads as it did.
const KNOWLEDGE_BASE = ROWS.el;

// ---------------------------------------------------------------------
// 0. THE KNOWLEDGE BASE IS WRITTEN IN ONE LANGUAGE. ONLY THAT LANGUAGE
//    MAY BE ANSWERED FROM IT.
//
// All 27 answers and all 27 titles are Greek. All 27 articles also carry
// ENGLISH triggers — "pricing", "price", "credits", "cancel", 60 of them —
// because the same list serves a Greek user who writes the product noun in
// English. The scoring makes a bare trigger score 0.975, well over the
// 0.85 threshold, so an English, French, German or Japanese user who typed
// one English word got a GREEK paragraph back, with the model never
// called and no credits charged: the cheapest possible way to answer the
// wrong person in the wrong language.
//
// The model path is not the problem — its system prompt says ΑΠΑΝΤΑ ΠΑΝΤΑ
// ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ and it obeys. The canned path simply had no idea what
// language it was speaking, because matchCannedAnswer() was never told.
//
// The locale is now a REQUIRED argument, in second position, so this
// cannot be forgotten by a future caller: leaving it out is a TypeScript
// error, not a silently Greek answer.
//
// HOW THE "BEFORE" WAS MEASURED, because this section's own red state is
// misleading on its own. Against the OLD two-argument signature the
// second argument was the threshold, so passing "el" made every numeric
// comparison false and the nine "no English trigger" checks below passed
// VACUOUSLY. The defect was measured by running the real two-argument
// matcher directly:
//
//     matchCannedAnswer("pricing")          -> pricing-overview   conf 0.975
//     matchCannedAnswer("what are credits") -> what-are-credits   conf 1.0
//
// both returning Greek paragraphs. What went red here before the fix were
// the two Greek checks and the empty-locale one; what proves the leak is
// closed is those two runs now returning null for every locale but el.
console.log("== 0. the canned path only answers the language it is written in ==");
{
  const GREEK_ASKS = [
    ["Πόσο κοστίζει;", "pricing-overview"],
    ["Τι είναι τα credits;", "what-are-credits"],
  ];
  for (const [q, id] of GREEK_ASKS) {
    const m = matchCannedAnswer(q, ROWS.el);
    check(`el: "${q}" is still answered from the knowledge base`, m?.article.slug === id,
      `got ${m?.article.slug ?? "null"}`);
  }

  // The exact strings that reached a Greek answer before, measured by
  // running the real matcher rather than chosen by reading a trigger list.
  //
  // WHAT THIS ASSERTS CHANGED, AND THE CHANGE IS THE POINT. It used to be
  // "these must match NOTHING", because the fix at the time was a
  // whole-language guard that refused every non-Greek locale outright —
  // correct, and it cost nine languages their canned answers. Now they
  // SHOULD match: an English user typing "pricing" gets the English
  // article, a French user typing "credits" gets the French one, because
  // "crédits" normalises to the same string. What must never happen is
  // the answer coming back in Greek.
  const ENGLISH_TRIGGERS = ["pricing", "what are credits", "price", "credits"];
  const GREEK_SCRIPT = /[\u0370-\u03FF]/;
  for (const locale of ["en", "fr", "de", "es", "it", "pt", "zh", "ja", "ar"]) {
    const leaked = ENGLISH_TRIGGERS
      .map((q) => ({ q, m: matchCannedAnswer(q, ROWS[locale] ?? []) }))
      .filter(({ m }) => m && (m.article.locale !== locale || GREEK_SCRIPT.test(m.article.body)));
    check(`${locale}: no English trigger reaches a Greek answer`, leaked.length === 0,
      leaked.map(({ q, m }) => `"${q}" -> ${m.article.slug} (${m.article.locale})`).join(", "));
  }
  // And the other half of the same fact: every locale now answers the
  // money question when it is asked IN THAT LOCALE'S OWN LANGUAGE. All
  // nine of these used to be refused outright.
  //
  // Asked with each locale's own trigger, not with the English word —
  // "pricing" correctly matches nothing in Spanish, because Spanish
  // triggers are Spanish. Testing it with an English word would be
  // re-testing the leak and calling it a regression.
  const stillRefused = [];
  for (const locale of Object.keys(ROWS)) {
    const article = ROWS[locale].find((a) => a.slug === "pricing-overview");
    const ownWords = article?.triggers ?? [];
    const answered = ownWords.some((t) => matchCannedAnswer(t, ROWS[locale], 0.5));
    if (!answered) stillRefused.push(locale);
  }
  check(`every locale answers its own money question (${Object.keys(ROWS).length - stillRefused.length}/${Object.keys(ROWS).length})`,
    stillRefused.length === 0, `still refused: ${stillRefused.join(", ")}`);

  // An unknown locale loads no rows, and no rows must match nothing rather
  // than throw. This used to be a guard on the locale STRING; it is now a
  // property of the data, which is why it is checked with an empty array.
  for (const locale of ["", "xx", "EL", "el-GR"]) {
    check(`locale ${JSON.stringify(locale)} has no articles, so matches nothing`,
      matchCannedAnswer("pricing", ROWS[locale] ?? []) === null);
  }

  // Every GREEK answer really is Greek. This used to be the premise a
  // whole-language guard rested on; it is now just a sanity check that the
  // Greek rows are the Greek ones.
  const nonGreek = KNOWLEDGE_BASE.filter((a) => !/[\u0370-\u03FF]/.test(a.body)).map((a) => a.slug);
  check("every article in the Greek catalogue is written in Greek", nonGreek.length === 0, nonGreek.join(", "));
}

console.log(`== 1. the questions the brief named all match (${KNOWLEDGE_BASE.length} articles) ==`);
const MUST_MATCH = [
  ["Πόσο κοστίζει;", "pricing-overview"],
  ["Ποια πακέτα υπάρχουν;", "pricing-overview"],
  ["Πώς ακυρώνω;", "cancel"],
  ["Πώς αλλάζω πλάνο;", "change-plan"],
  ["Τι είναι τα credits;", "what-are-credits"],
  ["Πόσα credits κοστίζει ένα website;", "credit-cost-per-action"],
  ["Πώς φτιάχνω website;", "create-website"],
  ["Πώς φτιάχνω agent;", "create-agent"],
  ["Πώς φτιάχνω mission;", "create-mission"],
  ["Πού βάζω τον κωδικό πρόσκλησης;", "invite-code"],
];
for (const [q, expectedId] of MUST_MATCH) {
  const m = matchCannedAnswer(q, ROWS.el);
  check(
    `"${q}" -> ${expectedId}`,
    m?.article.slug === expectedId && m.confidence >= 0.85,
    m ? `matched ${m.article.slug} @ ${m.confidence}` : "no match — this question would still cost a full AI call"
  );
}

console.log("\n== 2. NEVER for questions about the user's own account ==");
const MUST_NOT_MATCH = [
  "Πόσα credits μου έχουν μείνει;",
  "Ποιο είναι το πλάνο μου;",
  "Γιατί χρεώθηκα εγώ 40 credits χθες;",
  "Τι έχω φτιάξει μέχρι τώρα;",
  "How many credits do I have?",
  "Δείξε μου τα websites μου",
];
for (const q of MUST_NOT_MATCH) {
  check(`"${q}" falls through to the model`, matchCannedAnswer(q, ROWS.el) === null,
    `matched ${matchCannedAnswer(q, ROWS.el)?.article.slug} — a fixed string cannot answer a question about one account.`);
  check(`  ...and is flagged account-specific`, isAccountSpecific(q) === true);
}

console.log("\n== 3. no canned answer states a number that moves ==");
// The rule from the brief: never hardcode credit or price figures.
for (const a of KNOWLEDGE_BASE) {
  const digits = a.body.match(/\d+/g) ?? [];
  check(
    `${a.slug}: answer contains no figures`,
    digits.length === 0,
    `found ${digits.join(", ")} in "${a.title}" — prices and credit costs change; route to /pricing instead.`
  );
}
// And the money questions must actually point somewhere live.
for (const id of ["pricing-overview", "what-are-credits", "team-members"]) {
  const a = KNOWLEDGE_BASE.find((x) => x.slug === id);
  check(`${id} points at /pricing for the live numbers`, a?.href === "/pricing" || /\/pricing/.test(a?.body ?? ""));
}

console.log("\n== 4. below the threshold it defers, it does not guess ==");
check("an unrelated question does not match", matchCannedAnswer("Γράψε μου ένα ποίημα για τη θάλασσα", ROWS.el) === null);
check("an empty message does not match", matchCannedAnswer("", ROWS.el) === null);
check("whitespace does not match", matchCannedAnswer("    ", ROWS.el) === null);
// A long message is a conversation, not a lookup — even if it contains a trigger.
const longWithTrigger = "Θέλω να μου εξηγήσεις αναλυτικά " + "τη στρατηγική ".repeat(20) + " και επίσης πόσο κοστίζει";
check("a long message with a trigger still goes to the model", matchCannedAnswer(longWithTrigger, ROWS.el) === null);
// The threshold is honoured rather than hardcoded into the callers.
// The threshold is a real parameter, not decoration: raising it past what
// any match can score turns the whole canned path off.
check("the threshold parameter is honoured",
  matchCannedAnswer("Πόσο κοστίζει;", ROWS.el) !== null && matchCannedAnswer("Πόσο κοστίζει;", ROWS.el, 1.01) === null);
check("an exact-phrase question scores at the top of the range",
  matchCannedAnswer("Πόσο κοστίζει;", ROWS.el).confidence === 1);

console.log("\n== 5. the registry is coherent ==");
const ids = KNOWLEDGE_BASE.map((a) => a.slug);
check("no duplicate article id", new Set(ids).size === ids.length);
check("every article has triggers", KNOWLEDGE_BASE.every((a) => a.triggers.length > 0));
check("every article has a non-trivial answer", KNOWLEDGE_BASE.every((a) => a.body.length > 80));
check("every article has a title", KNOWLEDGE_BASE.every((a) => a.title.length > 0));
check("triggers are stored already-normalisable", KNOWLEDGE_BASE.every((a) => a.triggers.every((t) => normalize(t).length > 0)));
check("categories group cleanly for /help", articlesByCategory(KNOWLEDGE_BASE).size >= 8);
// Two articles claiming the same trigger makes which one wins arbitrary.
const seen = new Map();
let collisions = [];
for (const a of KNOWLEDGE_BASE) {
  for (const t of a.triggers) {
    const n = normalize(t);
    if (seen.has(n) && seen.get(n) !== a.slug) collisions.push(`"${t}" (${seen.get(n)} vs ${a.slug})`);
    seen.set(n, a.slug);
  }
}
check("no trigger is claimed by two articles", collisions.length === 0, collisions.join("; "));

console.log("\n== 6. accents and case do not matter ==");
check("«ΠΟΣΟ ΚΟΣΤΙΖΕΙ» matches", matchCannedAnswer("ΠΟΣΟ ΚΟΣΤΙΖΕΙ;", ROWS.el)?.article.slug === "pricing-overview");
check("«πόσο κοστίζει» matches", matchCannedAnswer("πόσο κοστίζει", ROWS.el)?.article.slug === "pricing-overview");
check("normalize strips accents", normalize("Πόσο Κοστίζει;") === "ποσο κοστιζει");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
