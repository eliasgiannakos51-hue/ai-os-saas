#!/usr/bin/env node
/*
 * WHAT CROSS-MODULE CONTEXT COSTS, BEFORE AND AFTER.
 *
 * The instruction attached to this work was explicit: measure tokens
 * before and after, and narrow the criterion if the context doubles. So
 * this assembles both prompts and prints the difference, rather than
 * asserting that a budget constant is small.
 *
 * NOTHING IS RE-IMPLEMENTED HERE. The rows go through the REAL module
 * configs, the REAL field-label helper and the REAL body serialiser
 * (bodyOf), the selection is the REAL gate (selectWithinBudget), and the
 * prompt fragments are the REAL builders the two endpoints call. A
 * measurement of a hand-written copy of the prompt would measure the copy.
 *
 * TOKENS ARE THE REPO'S OWN ESTIMATE (CHARS_PER_TOKEN = 4, from
 * lib/billing/estimate.ts). It is optimistic for Greek — Claude splits
 * Greek far finer than four characters per token — so the true figures are
 * higher than these in the same proportion on both sides. It is the right
 * number to use anyway: it is the one the billing path charges with, and
 * two different counts for one prompt is how a "cheap" feature turns out
 * to be the expensive one.
 *
 * Run: node scripts/cross-module-context-cost.mjs
 */
import { loadTs } from "./tests/load-ts.mjs";

const rel = await loadTs("src/lib/text/relevance-budget.ts");
const mentions = await loadTs("src/lib/chat/entity-mentions.ts");
const convo = await loadTs("src/lib/chat/record-conversation-context.ts");
const build = await loadTs("src/lib/build-modules.ts");

const CODING = build.BUILD_MODULES.find((m) => m.slug === "coding");
if (!CODING) throw new Error("the coding module is gone from BUILD_MODULES");

const tok = (s) => rel.estimateTokens(s.length);
const pct = (before, after) => (before === 0 ? "n/a" : `${(((after - before) / before) * 100).toFixed(1)}%`);

// ---------------------------------------------------------------------
// Rows in the shape the module actually stores. Note what is NOT here:
// there is no code. ai_coding_requests has title, description, language
// and status and nothing else — the module has no code column and no
// endpoint that writes one.
// ---------------------------------------------------------------------
const ROWS = [
  {
    id: "r1",
    title: "Margin calculator",
    description:
      "Χρειάζομαι μια function που παίρνει κόστος και τιμή πώλησης και επιστρέφει το gross margin ως ποσοστό, με έλεγχο για μηδενικό κόστος ώστε να μην σκάει σε division by zero.",
    language: "TypeScript",
    status: "done",
  },
  {
    id: "r2",
    title: "CSV importer",
    description: "Parser για τα τραπεζικά CSV, με ανίχνευση διπλοεγγραφών στο ίδιο ποσό και ημερομηνία.",
    language: "TypeScript",
    status: "in progress",
  },
  {
    id: "r3",
    title: "Retry wrapper",
    description: "Exponential backoff γύρω από τις κλήσεις στο provider, max 4 προσπάθειες.",
    language: "TypeScript",
    status: "requested",
  },
];

const MESSAGE = "Θυμάσαι το Margin calculator που έφτιαξα; Γιατί έβαλα έλεγχο για μηδενικό κόστος;";

const entities = ROWS.map((row) => ({
  table: CODING.table,
  id: row.id,
  moduleTitle: "AI Coding",
  headline: row.title,
  linked: [],
  excerpt: "",
  body: mentions.bodyOf(CODING, row),
}));

// BEFORE — headline only, which is exactly what shipped.
const before = mentions.buildEntityMentionPromptAddition(
  entities.map(({ body: _b, ...e }) => e)
);

// AFTER — the real gate decides which bodies are worth their characters.
const chosen = rel.selectWithinBudget(
  MESSAGE,
  entities,
  (e) => e.body.slice(0, 260),
  mentions.MENTION_EXCERPT_RELEVANCE
);
const chosenIds = new Set(chosen.selected.map((e) => e.id));
const after = mentions.buildEntityMentionPromptAddition(
  entities.map(({ body, ...e }) => ({
    ...e,
    excerpt: chosenIds.has(e.id) ? (body.length <= 260 ? body : `${body.slice(0, 259)}…`) : "",
  }))
);

// THE DENOMINATOR HAS TO BE THE WHOLE PROMPT.
//
// Reporting "+168%" because a 135-character fragment became 362 is true
// and useless: the fragment is not what gets sent. The instruction was
// about whether the CONTEXT doubles, so the comparison is against the
// system prompt these fragments are appended to, which already carries the
// conduct block and the quality checklist on every call.
const conduct = await loadTs("src/lib/ai-conduct.ts");
const checklist = await loadTs("src/lib/ai-quality-checklist.ts");
const BASE_PROMPT_CHARS = conduct.AI_CONDUCT_EL.length + checklist.AI_QUALITY_CHECKLIST_EL.length;
console.log(`base system prompt (conduct + checklist, on every call): ${BASE_PROMPT_CHARS} chars, ${rel.estimateTokens(BASE_PROMPT_CHARS)} tokens\n`);

console.log("=========== (α) CHAT SEES THE CODING RECORD ===========");
console.log(`message                 : "${MESSAGE}"`);
console.log(`records mentioned       : ${entities.length}`);
console.log(`bodies the gate kept    : ${chosen.selected.length}  (dropped: ${chosen.droppedForScore} irrelevant, ${chosen.droppedForBudget} over budget)`);
console.log(`top relevance score     : ${chosen.topScore.toFixed(2)}   threshold ${mentions.MENTION_EXCERPT_RELEVANCE.minScore}`);
console.log(`  before : ${String(before.length).padStart(5)} chars  ${String(tok(before)).padStart(4)} tokens`);
console.log(`  after  : ${String(after.length).padStart(5)} chars  ${String(tok(after)).padStart(4)} tokens`);
console.log(`  delta  : ${String(after.length - before.length).padStart(5)} chars  ${String(tok(after) - tok(before)).padStart(4)} tokens   (${pct(before.length, after.length)})`);
console.log(`  ceiling: ${mentions.MENTION_EXCERPT_RELEVANCE.budgetChars} chars = ${rel.estimateTokens(mentions.MENTION_EXCERPT_RELEVANCE.budgetChars)} tokens, whatever the data`);
console.log(`  against the whole prompt : +${(((after.length - before.length) / (BASE_PROMPT_CHARS + before.length)) * 100).toFixed(1)}%  (worst case at the ceiling: +${((mentions.MENTION_EXCERPT_RELEVANCE.budgetChars / (BASE_PROMPT_CHARS + before.length)) * 100).toFixed(1)}%)`);

// ---------------------------------------------------------------------
// (β) the Ask-AI prompt, with and without the conversation it was blind to
// ---------------------------------------------------------------------
const TURNS = [
  { role: "user", excerpt: "Για το Margin calculator — αν το κόστος είναι 0 τι πρέπει να γυρνάει;", createdAt: "2026-08-14T09:12:00Z" },
  { role: "assistant", excerpt: "Πρότεινα να επιστρέφει null αντί για Infinity, ώστε ο caller να αποφασίσει πώς το εμφανίζει και να μη διαδίδεται Infinity στα σύνολα.", createdAt: "2026-08-14T09:13:00Z" },
  { role: "user", excerpt: "Το CSV importer θέλει και ανίχνευση διπλοεγγραφών.", createdAt: "2026-08-15T11:02:00Z" },
];
const QUESTION = "Γιατί το έκανες έτσι με το μηδενικό κόστος;";
// The same grouping the shipped function does: a user turn that names the
// record carries the assistant turn that answered it. Scoring the reply on
// its own is what returned nothing here at first — an answer does not
// repeat the question's words.
const NEEDLE = "margin calculator";
const groups = [];
for (let i = 0; i < TURNS.length; i++) {
  if (!TURNS[i].excerpt.toLowerCase().includes(NEEDLE)) continue;
  const turns = [TURNS[i]];
  if (TURNS[i].role === "user" && TURNS[i + 1]?.role === "assistant") {
    turns.push(TURNS[i + 1]);
    i++;
  }
  groups.push({ turns, text: turns.map((t) => t.excerpt).join(" ") });
}
const selectedTurns = rel.selectWithinBudget(
  QUESTION,
  groups,
  (g) => g.text,
  convo.RECORD_CONVERSATION_RELEVANCE
);
const ctx = {
  turns: selectedTurns.selected.flatMap((g) => g.turns),
  chars: selectedTurns.chars,
  scanned: TURNS.length,
  mentioning: groups.length,
  droppedForScore: selectedTurns.droppedForScore,
  droppedForBudget: selectedTurns.droppedForBudget,
};
const addition = convo.buildRecordConversationPromptAddition(ctx);

// The record half of that prompt, serialised the way the endpoint does.
const recordBlock = CODING.fields
  .map((f) => (ROWS[0][f.key] ? `- ${f.key}: ${ROWS[0][f.key]}` : null))
  .filter(Boolean)
  .join("\n");

console.log("\n=========== (β) ASK-AI SEES THE CONVERSATION ===========");
console.log(`question                : "${QUESTION}"`);
console.log(`pairs about the record   : ${groups.length}  (from ${TURNS.length} turns)`);
console.log(`turns the gate kept     : ${ctx.turns.length}  (dropped: ${ctx.droppedForScore} irrelevant, ${ctx.droppedForBudget} over budget)`);
console.log(`top relevance score     : ${selectedTurns.topScore.toFixed(2)}   threshold ${convo.RECORD_CONVERSATION_RELEVANCE.minScore}`);
console.log(`  before : ${String(recordBlock.length).padStart(5)} chars  ${String(tok(recordBlock)).padStart(4)} tokens   (the record alone — all this endpoint ever had)`);
console.log(`  after  : ${String(recordBlock.length + addition.length).padStart(5)} chars  ${String(tok(recordBlock + addition)).padStart(4)} tokens`);
console.log(`  delta  : ${String(addition.length).padStart(5)} chars  ${String(convo.recordConversationTokenCost(ctx)).padStart(4)} tokens   (${pct(recordBlock.length, recordBlock.length + addition.length)})`);
console.log(`  ceiling: ${convo.RECORD_CONVERSATION_RELEVANCE.budgetChars} chars = ${rel.estimateTokens(convo.RECORD_CONVERSATION_RELEVANCE.budgetChars)} tokens, whatever the data`);
console.log(`  against the whole prompt : +${((addition.length / (BASE_PROMPT_CHARS + recordBlock.length)) * 100).toFixed(1)}%  (worst case at the ceiling: +${((convo.RECORD_CONVERSATION_RELEVANCE.budgetChars / (BASE_PROMPT_CHARS + recordBlock.length)) * 100).toFixed(1)}%)`);

// ---------------------------------------------------------------------
// The alternative that was NOT taken, priced.
// ---------------------------------------------------------------------
const classifier = await loadTs("src/lib/classifier-modules.ts");
const alwaysOnModules = classifier.CLASSIFIER_MODULES.length;
const buildModules = build.BUILD_MODULES.length;
console.log("\n=========== THE ALTERNATIVE, PRICED ===========");
console.log(`AI Life Context scans ${alwaysOnModules} modules on EVERY AI request, 5 rows each.`);
console.log(`Adding the ${buildModules} build modules to that scan would be +${((buildModules / alwaysOnModules) * 100).toFixed(0)}% module summary`);
console.log(`on every request, to answer a question that may not be about any of them —`);
console.log(`which is the "sends everything regardless of relevance" this work was told to avoid.`);
console.log(`Both gates above fire only when the user's own words select the material.`);

// A run where the gate silently kept nothing would print reassuring
// zero-delta numbers. Refuse to be that run.
if (chosen.selected.length === 0 || ctx.turns.length === 0) {
  console.log("\nMEASUREMENT INVALID — a gate selected nothing, so the deltas above measure nothing");
  process.exit(1);
}
if (after.length <= before.length) {
  console.log("\nMEASUREMENT INVALID — the 'after' prompt is not larger, so the excerpt never rendered");
  process.exit(1);
}
