#!/usr/bin/env node
/*
 * DOES SENDING LESS MAKE THE ANSWER WORSE?
 *
 * THE ONLY THING THAT MAY TURN CONTEXT_RELEVANCE ON.
 *
 * The caching work in this workstream removes nothing from the prompt —
 * the model sees byte-identical text, so it cannot change an answer, and
 * it needs no permission. Narrowing is different: it DELETES context, and
 * the brief's rule is explicit — measure ten cases per feature, and if
 * quality drops more than 10%, revert.
 *
 * This is that measurement. It has NOT been run: it needs an
 * ANTHROPIC_API_KEY, and the environment this was built in has none. Any
 * claim that narrowing is safe, made before this script has output, is a
 * claim about a token count wearing the word "quality".
 *
 * HOW IT WORKS. For each case it asks the same question twice — once with
 * every module in the context, once with the narrowed selection — and
 * then asks a third call to judge the two answers against the FULL
 * context, blind to which is which. Blind because a judge told which
 * answer had less information will find that it had less information.
 *
 * Run: ANTHROPIC_API_KEY=... node scripts/context-quality.mjs
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { loadTs } from "./tests/load-ts.mjs";

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.log("ANTHROPIC_API_KEY is not set.");
  console.log("");
  console.log("This script is the gate on CONTEXT_RELEVANCE. Without it, the");
  console.log("honest state is: narrowing is BUILT and OFF, and no quality");
  console.log("comparison has been run. Do not turn it on.");
  process.exit(1);
}

const MODEL = "claude-sonnet-4-6";
const anthropic = new Anthropic({ apiKey: KEY });

const cr = await loadTs("src/lib/ai/context-relevance.ts");
const cm = await loadTs("src/lib/classifier-modules.ts");
const uc = await loadTs("src/lib/user-context.ts");
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const vocabulary = cr.buildModuleVocabulary(cm.CLASSIFIER_MODULES, [en, el]);

// A synthetic but cross-linked business: the point of the AI Life Context
// is that an answer about one module can notice something in another, so
// the fixture has to contain exactly those links or the test cannot fail.
const now = Date.now();
const DAY = 86_400_000;
const FIXTURE = [
  ["sales", 0, ["Acme Ltd — proposal sent, no reply in 3 weeks", "Beta Co — asked about volume pricing", "Gamma — churned, cited price"]],
  ["products", 1, ["Pro tier — price raised to 50 EUR in March", "Starter — unchanged since launch"]],
  ["feedback", 2, ["Two customers said Pro felt expensive", "One asked for a mid tier"]],
  ["finance", 4, ["March revenue 4,200 EUR", "Refund issued to Gamma"]],
  ["competitors", 30, ["Rival launched a 30 EUR mid tier"]],
  ["trading", 120, ["EURUSD long, closed flat"]],
  ["ideas", 5, ["A mid tier between Starter and Pro"]],
  ["research", 20, ["Read: pricing ladders in B2B SaaS"]],
  ["learning", 90, ["Course on positioning"]],
  ["decisions", 60, ["Chose not to discount"]],
  ["content", 3, ["Blog: why we do not discount"]],
  ["analytics", 40, ["Signup conversion 2.1%"]],
  ["automation", 200, ["Weekly digest email"]],
].map(([slug, daysAgo, headlines]) => ({
  slug,
  title: slug,
  headlines,
  lastActivityMs: now - daysAgo * DAY,
}));

// Ten cases. Each is answerable from the full context; several REQUIRE a
// module the narrowing might drop, which is the whole point.
const CASES = [
  "Why did Gamma churn, and is anything else pointing the same way?",
  "Should I introduce a mid tier? What do I already know that bears on it?",
  "How are my sales going, and is there a reason behind the pattern?",
  "Which customer conversations should I follow up this week and why?",
  "Is my pricing a problem? Answer from what I have written down.",
  "What does my recent feedback say about the Pro tier?",
  "Give me the three things most worth my attention right now.",
  "Has anything I wrote down contradicted a decision I made?",
  "What is the strongest signal in my data this month?",
  "Summarise where the business stands, with evidence.",
];

const ctx = (summaries) =>
  uc.buildUserContextPromptAdditionEnglish({
    moduleSummaries: summaries,
    activeMissions: [],
    latestEnergyCheckIn: null,
    healthScore: { score: 68 },
    knowledgeGraphLinkCount: 12,
    knowledgeGraphLinksThisWeek: 2,
  });

async function ask(question, context) {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: `You are a business assistant. Answer using the user's own data.${context}`,
    messages: [{ role: "user", content: question }],
  });
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

let full = 0;
let narrow = 0;
let ties = 0;
const rows = [];

for (const question of CASES) {
  const selection = cr.selectRelevantModules(question, FIXTURE, vocabulary, {
    ...cr.DEFAULT_SELECTION_CONFIG,
    enabled: true,
  });
  const fullAnswer = await ask(question, ctx(FIXTURE));
  const narrowAnswer = await ask(question, ctx(selection.keep));

  // BLIND, and randomised per case so a judge with a position bias does
  // not systematically favour one arm.
  const flip = question.length % 2 === 0;
  const [a, b] = flip ? [narrowAnswer, fullAnswer] : [fullAnswer, narrowAnswer];
  const verdict = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system:
      "You judge two answers to the same question about a business. You are given the COMPLETE data. " +
      "Say which answer is better grounded in it and which misses something real. " +
      'Reply with exactly one of: "A", "B", or "TIE", then one sentence of reason.',
    messages: [
      {
        role: "user",
        content: `COMPLETE DATA:${ctx(FIXTURE)}\n\nQUESTION: ${question}\n\nANSWER A:\n${a}\n\nANSWER B:\n${b}`,
      },
    ],
  });
  const text = verdict.content.filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  const pick = /^A\b/.test(text) ? "A" : /^B\b/.test(text) ? "B" : "TIE";
  const winner = pick === "TIE" ? "TIE" : (pick === "A") === flip ? "NARROW" : "FULL";
  if (winner === "FULL") full += 1;
  else if (winner === "NARROW") narrow += 1;
  else ties += 1;
  rows.push({ question, mode: selection.mode, dropped: selection.droppedSlugs.length, winner, why: text.slice(0, 120) });
  console.log(`  ${winner.padEnd(6)} dropped ${String(selection.dropped ?? selection.droppedSlugs.length).padStart(2)}  ${question.slice(0, 58)}`);
}

const total = CASES.length;
const lossRate = (full - narrow) / total;
console.log(`\n  full context better: ${full}   narrowed better: ${narrow}   tie: ${ties}`);
console.log(`  net quality change: ${(-lossRate * 100).toFixed(0)}%`);
console.log(
  lossRate > 0.1
    ? "\n  OVER THE 10% LIMIT. CONTEXT_RELEVANCE must stay off."
    : "\n  Within the 10% limit on this fixture. That is ONE fixture and ten cases —\n  not a licence, an input to a decision."
);
