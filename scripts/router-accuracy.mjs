#!/usr/bin/env node
/*
 * HOW OFTEN THE HOME FIELD'S "WILL OPEN → X" IS RIGHT, ON 50 SENTENCES.
 *
 * Run: node scripts/router-accuracy.mjs
 *      node scripts/router-accuracy.mjs --json
 *
 * The owner's condition for the design's routing line, 2026-10-02: "μέτρησε
 * τον router πρώτα (50 φράσεις) — θέλω να ξέρω την ακρίβεια πριν βγει στον
 * χρήστη". The router is lib/voice/voice-command.ts's preflight(), which
 * runs lib/ai/ambiguity.ts and lib/create-studio/producer-routes.ts in the
 * browser. It makes no model call, so this costs nothing to run.
 *
 * THE LABELS WERE WRITTEN BEFORE THE FIRST RUN, by intent: what a person
 * typing that sentence wants. Each is one of
 *   open:<producer>   one producer is meant
 *   classify          nothing is named; the paid classifier should decide
 *   question          too thin to act on
 * and the three kinds of disagreement are not equally bad, so they are
 * counted apart:
 *   WRONG OPEN   the card offers the wrong page, or a page when none was
 *                meant. This is the one the routing line makes visible.
 *   MISSED       a producer was meant and the router did not name it.
 *                Safe: the classifier or the one question catches it.
 *   OTHER        classify vs question — both are safe fallbacks.
 *
 * Fifty sentences are a sample written by one person, not traffic. The
 * number this prints is the router against these fifty and nothing wider.
 */
import { loadTs } from "./tests/load-ts.mjs";

const { preflight } = await loadTs("src/lib/voice/voice-command.ts");

const CASES = [
  // website (8)
  ["φτιάξε site για την καφετέρια μου", "open:website"],
  ["θέλω ιστοσελίδα για το κομμωτήριο", "open:website"],
  ["κάνε μου ένα e-shop για κοσμήματα", "open:website"],
  ["landing page για το νέο μου προϊόν", "open:website"],
  ["build me a website for my bakery", "open:website"],
  ["χρειάζομαι σάιτ για δικηγορικό γραφείο", "open:website"],
  ["ανανέωσε την ιστοσελίδα μου με νέα χρώματα", "open:website"],
  ["θέλω portfolio site για τις φωτογραφίες μου", "open:website"],
  // presentation (7)
  ["φτιάξε παρουσίαση για τους επενδυτές", "open:presentation"],
  ["10 διαφάνειες για το νέο τιμολόγιο", "open:presentation"],
  ["make a pitch deck for my startup", "open:presentation"],
  ["παρουσίαση για τη σύσκεψη της Δευτέρας", "open:presentation"],
  ["slides about our Q3 results", "open:presentation"],
  ["κάνε ένα deck για το προϊόν", "open:presentation"],
  ["θέλω powerpoint για το σεμινάριο", "open:presentation"],
  // posts (7)
  ["γράψε post για το instagram για τις εκπτώσεις", "open:posts"],
  ["ανάρτηση στο LinkedIn για τη νέα πρόσληψη", "open:posts"],
  ["write a tweet about our launch", "open:posts"],
  ["posts για facebook για το καλοκαιρινό ωράριο", "open:posts"],
  ["κάνε 3 αναρτήσεις για το νέο μενού", "open:posts"],
  ["caption για φωτογραφία με καφέ στο instagram", "open:posts"],
  ["post για τα social για την επέτειο", "open:posts"],
  // research (7)
  ["ψάξε τους ανταγωνιστές μου στη Θεσσαλονίκη", "open:research"],
  ["κάνε έρευνα αγοράς για vegan προϊόντα", "open:research"],
  ["research the best CRM for small teams", "open:research"],
  ["βρες πληροφορίες για επιδοτήσεις ΕΣΠΑ 2026", "open:research"],
  ["σύγκρινε τιμές προμηθευτών καφέ", "open:research"],
  ["τι λέει η αγορά για τα ηλεκτρικά ποδήλατα", "open:research"],
  ["deep research on Greek tourism trends", "open:research"],
  // coding (6)
  ["γράψε μια συνάρτηση python που διαβάζει csv", "open:coding"],
  ["fix this javascript error", "open:coding"],
  ["κάνε ένα script που στέλνει email", "open:coding"],
  ["γράψε SQL query για τους πελάτες", "open:coding"],
  ["φτιάξε κώδικα για υπολογισμό ΦΠΑ", "open:coding"],
  ["write a regex for greek phone numbers", "open:coding"],
  // agent (5)
  ["κάθε Δευτέρα στείλε μου σύνοψη πωλήσεων", "open:agent"],
  ["παρακολούθησε τις τιμές του ανταγωνιστή καθημερινά", "open:agent"],
  ["φτιάξε agent που απαντά σε email", "open:agent"],
  ["every morning check the news about my industry", "open:agent"],
  ["αυτοματοποίησε την υπενθύμιση πληρωμών", "open:agent"],
  // nothing named — the classifier decides (6)
  ["πόσα ξόδεψα τον Σεπτέμβριο;", "classify"],
  ["πρόσθεσε έξοδο 50 ευρώ για καύσιμα", "classify"],
  ["ποιος πελάτης μου χρωστάει;", "classify"],
  ["τι να κάνω σήμερα πρώτα;", "classify"],
  ["εξήγησέ μου τα νούμερα αυτού του μήνα", "classify"],
  ["γράψε email στον Νίκο ότι αργεί η παράδοση", "classify"],
  // too thin (4)
  ["κάν' το", "question"],
  ["βοήθεια", "question"],
  ["κάτι για το μαγαζί", "question"],
  ["ok", "question"],
];

const got = (plan) => (plan.kind === "open" ? `open:${plan.producer}` : plan.kind);
const rows = CASES.map(([text, expected]) => {
  const plan = preflight(text);
  const actual = got(plan);
  let verdict = "RIGHT";
  if (actual !== expected) {
    if (actual.startsWith("open:")) verdict = "WRONG OPEN";
    else if (expected.startsWith("open:")) verdict = "MISSED";
    else verdict = "OTHER";
  }
  return { text, expected, actual, verdict, choices: plan.kind === "question" ? plan.choices : undefined };
});

const count = (v) => rows.filter((r) => r.verdict === v).length;
const opens = rows.filter((r) => r.actual.startsWith("open:"));
const meantOpen = rows.filter((r) => r.expected.startsWith("open:"));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ rows }, null, 2));
  process.exit(0);
}

for (const r of rows) {
  const mark = r.verdict === "RIGHT" ? "  ok " : r.verdict.padEnd(10);
  const extra = r.choices?.length ? ` (asks: ${r.choices.join(" / ")})` : "";
  console.log(`${mark.padEnd(11)} ${r.text.padEnd(52)} expected ${r.expected.padEnd(18)} got ${r.actual}${extra}`);
}
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)}%` : "—");
console.log(`
${rows.length} sentences
  right            ${count("RIGHT")}   ${pct(count("RIGHT"), rows.length)}
  WRONG OPEN       ${count("WRONG OPEN")}   — the card names the wrong page (the error the routing line shows)
  missed           ${count("MISSED")}   — a page was meant, the router fell back to the classifier or a question
  other            ${count("OTHER")}   — classify vs question, both safe

When the card says "will open X": X was right ${opens.length - count("WRONG OPEN")} of ${opens.length} times (${pct(opens.length - count("WRONG OPEN"), opens.length)}).
Of the ${meantOpen.length} sentences that meant a page, the router named the right one ${meantOpen.filter((r) => r.verdict === "RIGHT").length} times (${pct(meantOpen.filter((r) => r.verdict === "RIGHT").length, meantOpen.length)}).`);
