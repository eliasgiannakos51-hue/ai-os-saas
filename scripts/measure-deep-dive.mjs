#!/usr/bin/env node
/*
 * WHAT THE DEEP DIVE ACTUALLY COSTS, over ten questions.
 *
 * The estimate that authorised it (scripts/measure-context.mjs) modelled
 * 25 rows at MAX_HEADLINE_LENGTH and predicted +388 full-price-equivalent
 * tokens per message. This runs the REAL chooser over real question text
 * and the REAL formatter over rows shaped like the sample dataset, and
 * reports what it actually comes to — including the questions that fire
 * nothing, because the average over ten is the number that matters and
 * an estimate that only prices the hits is not one.
 *
 * Run: node scripts/measure-deep-dive.mjs
 */
import { loadTs } from "./tests/load-ts.mjs";

const dd = await loadTs("src/lib/ai/deep-dive.ts");
const { foldForMatch: fold } = await loadTs("src/lib/text/unicode-patterns.ts");
const rel = await loadTs("src/lib/ai/module-relevance.ts");
const { SAMPLE_TABLES, materialiseSampleData } = await loadTs("src/lib/sample-data/dataset.ts");
const { CLASSIFIER_MODULES } = await loadTs("src/lib/classifier-modules.ts");

const CHARS_PER_TOKEN = 4;
const tok = (n) => Math.ceil(n / CHARS_PER_TOKEN);
const CACHE_READ_MULT = 0.1;

// The vocabulary, built the same way lib/ai/module-vocabulary.ts builds
// it — from the real catalogues, not from a list written here.
const { readFileSync } = await import("node:fs");
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const syn = await loadTs("src/lib/ai/module-synonyms.ts");
const vocab = rel
  .buildModuleVocabulary(CLASSIFIER_MODULES, [en, el])
  .map((v) => ({ ...v, terms: [...v.terms, ...syn.synonymsFor(v.slug)] }));

// Rows shaped like the sample dataset, so the character count is a real
// one rather than 25 x "xxxx".
const NOW = Date.parse("2026-08-30T12:00:00Z");
const sample = materialiseSampleData(NOW);
// materialiseSampleData returns an ARRAY of {slug, table, rows}, not a
// map keyed by table. The first version of this indexed it as a map and
// every lookup came back undefined, so the whole run printed 0 rows and
// 0 tokens — a measurement that reported the feature costs nothing
// because it never measured the feature.
const rowsFor = (slug) => {
  const entry = sample.find((t) => t.slug === slug);
  if (!entry) return [];
  return entry.rows.map((r) => ({
    ...r,
    id: r.id ?? "x",
    created_at: r.created_at ?? r.occurred_at ?? new Date(NOW).toISOString(),
  }));
};

const QUESTIONS = [
  "How were sales this week compared to last week?",
  "Πόσα έξοδα είχα τον τελευταίο μήνα;",
  "Which of my leads is worth chasing first?",
  "Summarise my finance entries and tell me where the money went",
  "What ideas have I logged that I never followed up?",
  "Τι feedback έχω πάρει από πελάτες;",
  "thanks",
  "and?",
  "What should I do next?",
  "Compare my sales and my finance numbers",
];

console.log("TEN QUESTIONS THROUGH THE REAL CHOOSER\n");
console.log("  question                                        module      rows  chars  tokens");
let totalChars = 0;
let fired = 0;
for (const q of QUESTIONS) {
  const folded = fold(q);
  const words = rel.questionWords(folded);
  const scored = vocab.map((v) => ({
    slug: v.slug,
    score: dd.deepDiveScore(
      rel.scoreTerms(words, folded, v.terms),
      rel.scoreTerms(words, folded, syn.associatedFor(v.slug))
    ),
  }));
  const choice = dd.pickDeepDiveModule(q, scored);
  const top3 = [...scored].sort((a, b) => b.score - a.score).slice(0, 3)
    .filter((x) => x.score > 0).map((x) => `${x.slug}:${x.score}`).join(" ");
  if (!choice) {
    if (top3) console.log(`  ${" ".repeat(46)}  (scores ${top3} — no clear winner)`);
    console.log(`  ${q.slice(0, 46).padEnd(46)}  ${"—".padEnd(10)}  ${"—".padStart(4)}  ${"0".padStart(5)}  ${"0".padStart(6)}`);
    continue;
  }
  const config = CLASSIFIER_MODULES.find((m) => m.slug === choice.slug);
  const fields = (config.fields ?? [])
    .filter((f) => f.money === true || f.type === "number" || f.type === "date" || f.type === "select")
    .slice(0, 4)
    .map((f) => ({ key: f.key, label: f.key }));
  const { text, used, omitted } = dd.formatDeepDive(choice.slug, config.headlineKey, fields, rowsFor(choice.slug));
  const block = dd.deepDivePromptAddition(choice.slug, text, text ? text.split("\n").length : 0, omitted, "el");
  totalChars += block.length;
  if (block.length > 0) fired++;
  console.log(
    `  ${q.slice(0, 46).padEnd(46)}  ${choice.slug.padEnd(10)}  ${String(text ? text.split("\n").length : 0).padStart(4)}  ${String(block.length).padStart(5)}  ${String(tok(block.length)).padStart(6)}`
  );
}

console.log("");
console.log(`  fired on ${fired} of ${QUESTIONS.length} questions`);
console.log(`  total ${totalChars} chars = ${tok(totalChars)} tokens across ${QUESTIONS.length} questions`);
console.log(`  AVERAGE ${Math.round(totalChars / QUESTIONS.length)} chars = ${Math.round(tok(totalChars) / QUESTIONS.length)} tokens per message`);
console.log("");
console.log("  This block is UNCACHED by design, so its tokens are full price.");
console.log(`  The estimate that authorised it was +388 full-price-equivalent tokens.`);
console.log(`  Measured: +${Math.round(tok(totalChars) / QUESTIONS.length)} per message on average,`);
console.log(`  +${Math.round(tok(totalChars) / Math.max(1, fired))} on the messages where it fires.`);
console.log("");
console.log("  NOT MEASURED: answer quality. This file counts characters.");
console.log("  Tokens are chars/4, the app's own assumption; Greek tokenizes worse.");

// ==========================================================================
// THE TIE: SPLIT THE DEPTH, OR SAY SO?
// ==========================================================================
//
// "Compare my sales and my finance numbers" scores two modules alike and
// currently reaches neither. The user asked something specific and gets a
// shallow answer without being told why. Two ways out:
//
//   (a) read BOTH at half depth — 12 rows each instead of 25 of one
//   (b) read neither, and have the answer say "I looked at both only
//       briefly; ask about one at a time for a deeper read"
console.log(`\n${"=".repeat(78)}`);
console.log("THE TIE CASE: (a) split the depth vs (b) say so");
console.log("=".repeat(78));
{
  const tie = "Compare my sales and my finance numbers";
  const half = Math.floor(dd.DEEP_DIVE_ROW_LIMIT / 2);
  let splitChars = 0;
  for (const slug of ["sales", "finance"]) {
    const config = CLASSIFIER_MODULES.find((m) => m.slug === slug);
    const fields = (config.fields ?? [])
      .filter((f) => f.money === true || f.type === "number" || f.type === "date" || f.type === "select")
      .slice(0, 4)
      .map((f) => ({ key: f.key, label: f.key }));
    const { text, omitted } = dd.formatDeepDive(
      slug, config.headlineKey, fields, rowsFor(slug), dd.DEEP_DIVE_CHAR_BUDGET / 2, half
    );
    const block = dd.deepDivePromptAddition(slug, text, text ? text.split("\n").length : 0, omitted, "el");
    splitChars += block.length;
  }
  // (b) is one sentence in the prompt telling the model to say it read
  // both shallowly. Measured, not guessed: the sentence itself.
  const noticeEl =
    "\n\nΗ ερώτηση αφορά περισσότερες από μία ενότητες, οπότε δεν διάβασες καμία σε βάθος. " +
    "Πες το: πρότεινε στον χρήστη να ρωτήσει για μία ενότητα τη φορά για πιο αναλυτική απάντηση.";
  console.log(`  question: "${tie}"`);
  console.log("");
  console.log(`  (a) both at half depth (${half} rows each)   ${String(splitChars).padStart(5)} chars   ${String(tok(splitChars)).padStart(4)} tok`);
  console.log(`  (b) a sentence saying it read neither deeply ${String(noticeEl.length).padStart(5)} chars   ${String(tok(noticeEl.length)).padStart(4)} tok`);
  console.log("");
  console.log(`  (b) costs ${(tok(splitChars) / Math.max(1, tok(noticeEl.length))).toFixed(0)}x less.`);
  console.log("");
  console.log("  BUT THE COMPARISON IS NOT ONLY COST. (a) answers the question");
  console.log("  asked — a comparison needs both sides — and (b) answers a");
  console.log("  different, easier question and explains itself. The honest");
  console.log("  reading of the numbers: (b) is cheap enough to do ALWAYS, and");
  console.log("  (a) is cheap enough that refusing on cost grounds would be a");
  // 302 is the flat-5 -> flat-20 figure from scripts/measure-context.mjs,
  // named rather than recomputed here so the two files cannot disagree
  // about it silently.
  console.log(`  pretext — ${tok(splitChars)} tokens on the rare tied question is beside the`);
  console.log("  +302 that raising the flat limit to 20 would have cost on EVERY");
  console.log("  message (scripts/measure-context.mjs).");
}
