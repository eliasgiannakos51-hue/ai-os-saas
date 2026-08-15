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
const { KNOWLEDGE_BASE, matchCannedAnswer, isAccountSpecific, normalize, articlesByCategory } = kb;

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
    const m = matchCannedAnswer(q, "el");
    check(`el: "${q}" is still answered from the knowledge base`, m?.article.id === id,
      `got ${m?.article.id ?? "null"}`);
  }

  // The exact strings that reached a Greek answer before this check
  // existed, measured by running the real matcher — not chosen by reading
  // the trigger list.
  const ENGLISH_TRIGGERS = ["pricing", "what are credits", "price", "credits"];
  for (const locale of ["en", "fr", "de", "es", "it", "pt", "zh", "ja", "ar"]) {
    const leaked = ENGLISH_TRIGGERS
      .map((q) => ({ q, m: matchCannedAnswer(q, locale) }))
      .filter(({ m }) => m !== null);
    check(`${locale}: no English trigger reaches a Greek answer`, leaked.length === 0,
      leaked.map(({ q, m }) => `"${q}" -> ${m.article.id}`).join(", "));
  }

  // And the guard is about the LANGUAGE OF THE CATALOGUE, not a blocklist
  // of locales: an unknown or missing locale must fall through too.
  for (const locale of ["", "xx", "EL", "el-GR"]) {
    check(`locale ${JSON.stringify(locale)} does not reach the Greek catalogue`,
      matchCannedAnswer("pricing", locale) === null);
  }

  // Every answer really is Greek — the premise the guard rests on. If
  // somebody adds an English article later, this fails and the guard has
  // to be rethought rather than quietly becoming wrong.
  const nonGreek = KNOWLEDGE_BASE.filter((a) => !/[\u0370-\u03FF]/.test(a.answer)).map((a) => a.id);
  check("every article in the catalogue is written in Greek", nonGreek.length === 0, nonGreek.join(", "));
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
  const m = matchCannedAnswer(q, "el");
  check(
    `"${q}" -> ${expectedId}`,
    m?.article.id === expectedId && m.confidence >= 0.85,
    m ? `matched ${m.article.id} @ ${m.confidence}` : "no match — this question would still cost a full AI call"
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
  check(`"${q}" falls through to the model`, matchCannedAnswer(q, "el") === null,
    `matched ${matchCannedAnswer(q, "el")?.article.id} — a fixed string cannot answer a question about one account.`);
  check(`  ...and is flagged account-specific`, isAccountSpecific(q) === true);
}

console.log("\n== 3. no canned answer states a number that moves ==");
// The rule from the brief: never hardcode credit or price figures.
for (const a of KNOWLEDGE_BASE) {
  const digits = a.answer.match(/\d+/g) ?? [];
  check(
    `${a.id}: answer contains no figures`,
    digits.length === 0,
    `found ${digits.join(", ")} in "${a.title}" — prices and credit costs change; route to /pricing instead.`
  );
}
// And the money questions must actually point somewhere live.
for (const id of ["pricing-overview", "what-are-credits", "team-members"]) {
  const a = KNOWLEDGE_BASE.find((x) => x.id === id);
  check(`${id} points at /pricing for the live numbers`, a?.href === "/pricing" || /\/pricing/.test(a?.answer ?? ""));
}

console.log("\n== 4. below the threshold it defers, it does not guess ==");
check("an unrelated question does not match", matchCannedAnswer("Γράψε μου ένα ποίημα για τη θάλασσα", "el") === null);
check("an empty message does not match", matchCannedAnswer("", "el") === null);
check("whitespace does not match", matchCannedAnswer("    ", "el") === null);
// A long message is a conversation, not a lookup — even if it contains a trigger.
const longWithTrigger = "Θέλω να μου εξηγήσεις αναλυτικά " + "τη στρατηγική ".repeat(20) + " και επίσης πόσο κοστίζει";
check("a long message with a trigger still goes to the model", matchCannedAnswer(longWithTrigger, "el") === null);
// The threshold is honoured rather than hardcoded into the callers.
// The threshold is a real parameter, not decoration: raising it past what
// any match can score turns the whole canned path off.
check("the threshold parameter is honoured",
  matchCannedAnswer("Πόσο κοστίζει;", "el") !== null && matchCannedAnswer("Πόσο κοστίζει;", "el", 1.01) === null);
check("an exact-phrase question scores at the top of the range",
  matchCannedAnswer("Πόσο κοστίζει;", "el").confidence === 1);

console.log("\n== 5. the registry is coherent ==");
const ids = KNOWLEDGE_BASE.map((a) => a.id);
check("no duplicate article id", new Set(ids).size === ids.length);
check("every article has triggers", KNOWLEDGE_BASE.every((a) => a.triggers.length > 0));
check("every article has a non-trivial answer", KNOWLEDGE_BASE.every((a) => a.answer.length > 80));
check("every article has a title", KNOWLEDGE_BASE.every((a) => a.title.length > 0));
check("triggers are stored already-normalisable", KNOWLEDGE_BASE.every((a) => a.triggers.every((t) => normalize(t).length > 0)));
check("categories group cleanly for /help", articlesByCategory().size >= 8);
// Two articles claiming the same trigger makes which one wins arbitrary.
const seen = new Map();
let collisions = [];
for (const a of KNOWLEDGE_BASE) {
  for (const t of a.triggers) {
    const n = normalize(t);
    if (seen.has(n) && seen.get(n) !== a.id) collisions.push(`"${t}" (${seen.get(n)} vs ${a.id})`);
    seen.set(n, a.id);
  }
}
check("no trigger is claimed by two articles", collisions.length === 0, collisions.join("; "));

console.log("\n== 6. accents and case do not matter ==");
check("«ΠΟΣΟ ΚΟΣΤΙΖΕΙ» matches", matchCannedAnswer("ΠΟΣΟ ΚΟΣΤΙΖΕΙ;", "el")?.article.id === "pricing-overview");
check("«πόσο κοστίζει» matches", matchCannedAnswer("πόσο κοστίζει", "el")?.article.id === "pricing-overview");
check("normalize strips accents", normalize("Πόσο Κοστίζει;") === "ποσο κοστιζει");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
