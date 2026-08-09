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
  const m = matchCannedAnswer(q);
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
  check(`"${q}" falls through to the model`, matchCannedAnswer(q) === null,
    `matched ${matchCannedAnswer(q)?.article.id} — a fixed string cannot answer a question about one account.`);
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
check("an unrelated question does not match", matchCannedAnswer("Γράψε μου ένα ποίημα για τη θάλασσα") === null);
check("an empty message does not match", matchCannedAnswer("") === null);
check("whitespace does not match", matchCannedAnswer("    ") === null);
// A long message is a conversation, not a lookup — even if it contains a trigger.
const longWithTrigger = "Θέλω να μου εξηγήσεις αναλυτικά " + "τη στρατηγική ".repeat(20) + " και επίσης πόσο κοστίζει";
check("a long message with a trigger still goes to the model", matchCannedAnswer(longWithTrigger) === null);
// The threshold is honoured rather than hardcoded into the callers.
// The threshold is a real parameter, not decoration: raising it past what
// any match can score turns the whole canned path off.
check("the threshold parameter is honoured",
  matchCannedAnswer("Πόσο κοστίζει;") !== null && matchCannedAnswer("Πόσο κοστίζει;", 1.01) === null);
check("an exact-phrase question scores at the top of the range",
  matchCannedAnswer("Πόσο κοστίζει;").confidence === 1);

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
check("«ΠΟΣΟ ΚΟΣΤΙΖΕΙ» matches", matchCannedAnswer("ΠΟΣΟ ΚΟΣΤΙΖΕΙ;")?.article.id === "pricing-overview");
check("«πόσο κοστίζει» matches", matchCannedAnswer("πόσο κοστίζει")?.article.id === "pricing-overview");
check("normalize strips accents", normalize("Πόσο Κοστίζει;") === "ποσο κοστιζει");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
