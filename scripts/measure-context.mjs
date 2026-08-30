#!/usr/bin/env node
/*
 * WHAT EVERY AI REQUEST ACTUALLY SENDS, before deciding to send less.
 *
 * MEASURED, and honest about what kind of measurement it is.
 *
 *   EXACT: every static prompt, because it is a literal in the source —
 *   this counts the real string.
 *
 *   MODELLED: every dynamic part, because its size is set by a CAP the
 *   code enforces (HISTORY_LIMIT, PER_MODULE_LIMIT, MAX_HEADLINE_LENGTH)
 *   times a per-item size. The caps are read from the source; the
 *   per-item sizes are stated assumptions, printed beside the result so
 *   nobody has to guess which is which.
 *
 *   NOT MEASURED: production traffic. ai_cost_log records input_tokens
 *   per settled call and is the real answer to "average input tokens per
 *   feature" — this environment has no database credentials, so that
 *   query has not been run. What follows is the size of the context the
 *   code BUILDS, which is an upper bound on what any one request sends,
 *   not the average of what users actually send.
 *
 * TOKENS ARE THE APP'S OWN ESTIMATE, and the estimate is optimistic for
 * this app specifically. CHARS_PER_TOKEN is 4 — a reasonable figure for
 * English. Most of the chat system prompt is GREEK, which every
 * byte-pair tokenizer encodes far less efficiently than Latin text. No
 * tokenizer is available offline here and Anthropic's count-tokens
 * endpoint needs an API key, so the real ratio for the Greek half is NOT
 * measured. Characters are exact; treat the token column as a floor.
 *
 * Run: node scripts/measure-context.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./tests/load-ts.mjs";

const chars = (s) => [...s].length;
const CHARS_PER_TOKEN = 4;
const tok = (n) => Math.ceil(n / CHARS_PER_TOKEN);

const pct = (part, whole) => (whole > 0 ? `${((part / whole) * 100).toFixed(0)}%` : "—");

function readConst(file, name) {
  const src = readFileSync(file, "utf8");
  const m = new RegExp(`const ${name} = (\\d+)`).exec(src);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------
// The literals, counted exactly.
// ---------------------------------------------------------------------
const chatRoute = readFileSync("src/app/api/chat/route.ts", "utf8");

function templateLiteral(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) return "";
  const open = src.indexOf("`", at);
  if (open < 0) return "";
  let i = open + 1;
  let depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === "\\") { i += 1; continue; }
    if (src[i] === "$" && src[i + 1] === "{") { depth += 1; i += 1; continue; }
    if (src[i] === "}" && depth > 0) { depth -= 1; continue; }
    if (src[i] === "`" && depth === 0) break;
  }
  return src.slice(open + 1, i);
}

const conduct = await loadTs("src/lib/ai-conduct.ts");
const checklist = await loadTs("src/lib/ai-quality-checklist.ts");
const builder = await loadTs("src/lib/website-builder.ts").catch(() => null);

const CONDUCT_EL = String(conduct.AI_CONDUCT_EL ?? "");
const CONDUCT_EN = String(conduct.AI_CONDUCT_EN ?? "");
const CHECK_EL = String(checklist.AI_QUALITY_CHECKLIST_EL ?? "");
const CHECK_EN = String(checklist.AI_QUALITY_CHECKLIST_EN ?? "");

// The chat persona line, with its interpolations left as the literal
// text they expand from — the expansions are the shared blocks above and
// are counted separately, so counting them twice would overstate.
const personaRaw = templateLiteral(chatRoute, "return `Είσαι ο/η ${personaName}");
const personaOwn = personaRaw
  .replace(/\$\{WEB_SEARCH_INSTRUCTION\}/g, "")
  .replace(/\$\{AI_CONDUCT_EL\}/g, "")
  .replace(/\$\{AI_QUALITY_CHECKLIST_EL\}/g, "")
  .replace(/\$\{personaName\}/g, "Ionexa");

// ---------------------------------------------------------------------
// The caps that decide the dynamic half.
// ---------------------------------------------------------------------
const HISTORY_LIMIT = readConst("src/app/api/chat/route.ts", "HISTORY_LIMIT");
const PER_MODULE_LIMIT = readConst("src/lib/user-context.ts", "PER_MODULE_LIMIT");
const MAX_HEADLINE = readConst("src/lib/user-context.ts", "MAX_HEADLINE_LENGTH");
const cm = await loadTs("src/lib/classifier-modules.ts");
const MODULE_COUNT = cm.CLASSIFIER_MODULES.length;

// Stated assumptions, printed with the answer.
const ASSUMED = {
  chatTurnChars: 400,
  headlineChars: MAX_HEADLINE ?? 60,
  moduleTitleChars: 12,
  missionCount: 3,
  missionChars: 70,
  memoryCount: 8,
  memoryChars: 90,
  entityMentionCount: 4,
  entityMentionChars: 80,
};

console.log("=".repeat(78));
console.log("WHAT ONE CHAT REQUEST SENDS");
console.log("=".repeat(78));

const staticParts = [
  ["persona line (Greek)", chars(personaOwn)],
  ["AI_CONDUCT_EL", chars(CONDUCT_EL)],
  ["AI_QUALITY_CHECKLIST_EL", chars(CHECK_EL)],
];
const staticTotal = staticParts.reduce((s, [, n]) => s + n, 0);

// The AI Life Context block, built by the real formatter over a
// worst-case-shaped input, so the shape is the code's and not mine.
const uc = await loadTs("src/lib/user-context.ts");
if (typeof uc.buildUserContextPromptAdditionGreek !== "function") {
  throw new Error("user-context did not load its formatter — refusing to report a zero");
}
let lifeContextChars = null;
{
  const fakeContext = {
    moduleSummaries: cm.CLASSIFIER_MODULES.map((m) => ({
      title: m.slug.slice(0, ASSUMED.moduleTitleChars),
      headlines: Array.from({ length: PER_MODULE_LIMIT ?? 5 }, () => "x".repeat(ASSUMED.headlineChars)),
    })),
    activeMissions: Array.from({ length: ASSUMED.missionCount }, () => ({
      goal: "x".repeat(ASSUMED.missionChars),
      stepsCompleted: 2,
      stepsTotal: 5,
    })),
    latestEnergyCheckIn: { energyLevel: 4, note: "x".repeat(40) },
    healthScore: { score: 72 },
    knowledgeGraphLinkCount: 41,
    knowledgeGraphLinksThisWeek: 6,
  };
  lifeContextChars = chars(uc.buildUserContextPromptAdditionGreek(fakeContext));
}

const dynamicParts = [
  ["AI Life Context (all modules)", lifeContextChars ?? 0, "built by the real formatter"],
  ["memories", ASSUMED.memoryCount * ASSUMED.memoryChars, `${ASSUMED.memoryCount} x ${ASSUMED.memoryChars} chars (assumed)`],
  ["entity mentions", ASSUMED.entityMentionCount * ASSUMED.entityMentionChars, `${ASSUMED.entityMentionCount} x ${ASSUMED.entityMentionChars} (assumed)`],
];
const dynamicTotal = dynamicParts.reduce((s, [, n]) => s + n, 0);
const historyChars = (HISTORY_LIMIT ?? 20) * ASSUMED.chatTurnChars;
const total = staticTotal + dynamicTotal + historyChars;

const row = (label, n, note = "") =>
  console.log(
    `  ${label.padEnd(34)} ${String(n).padStart(7)} chars  ${String(tok(n)).padStart(6)} tok  ${pct(n, total).padStart(4)}  ${note}`
  );

console.log("\nSTATIC — identical on every message, and cached (lib/ai/cached-system.ts):");
for (const [label, n] of staticParts) row(label, n, "exact");
row("— static subtotal", staticTotal, "");

console.log("\nPER-REQUEST — re-sent in full, never cached:");
for (const [label, n, note] of dynamicParts) row(label, n, note);
row("— per-request subtotal", dynamicTotal, "");

console.log("\nCONVERSATION HISTORY:");
row(`${HISTORY_LIMIT} turns`, historyChars, `${HISTORY_LIMIT} x ${ASSUMED.chatTurnChars} chars (assumed)`);

console.log("\nTOTAL:");
row("one chat request", total, "");

console.log("\n" + "=".repeat(78));
console.log("THE AI LIFE CONTEXT, PER MODULE");
console.log("=".repeat(78));
console.log(`  ${MODULE_COUNT} modules x ${PER_MODULE_LIMIT} entries x up to ${MAX_HEADLINE} chars`);
{
  for (const n of [1, 3, 5, MODULE_COUNT]) {
    const ctx = {
      moduleSummaries: cm.CLASSIFIER_MODULES.slice(0, n).map((m) => ({
        title: m.slug,
        headlines: Array.from({ length: PER_MODULE_LIMIT ?? 5 }, () => "x".repeat(ASSUMED.headlineChars)),
      })),
      activeMissions: [],
      latestEnergyCheckIn: null,
      healthScore: { score: 72 },
      knowledgeGraphLinkCount: 0,
      knowledgeGraphLinksThisWeek: 0,
    };
    const c = chars(uc.buildUserContextPromptAdditionGreek(ctx));
    console.log(
      `  ${String(n).padStart(2)} module(s): ${String(c).padStart(6)} chars  ${String(tok(c)).padStart(5)} tok` +
        (n === MODULE_COUNT ? "   <- what is sent today, always" : "")
    );
  }
}

console.log("\n" + "=".repeat(78));
console.log("SHARED BLOCKS, EXACT");
console.log("=".repeat(78));
for (const [label, text] of [
  ["AI_CONDUCT_EL", CONDUCT_EL], ["AI_CONDUCT_EN", CONDUCT_EN],
  ["AI_QUALITY_CHECKLIST_EL", CHECK_EL], ["AI_QUALITY_CHECKLIST_EN", CHECK_EN],
]) {
  console.log(`  ${label.padEnd(28)} ${String(chars(text)).padStart(6)} chars  ${String(tok(chars(text))).padStart(5)} tok`);
}
if (builder) {
  console.log("\n  website generation system prompt (English), for comparison:");
  const gen = String(builder.WEBSITE_SYSTEM_PROMPT_FOR_TEST ?? "");
  if (gen) console.log(`    ${String(chars(gen)).padStart(6)} chars`);
}

// ---------------------------------------------------------------------
console.log("\n" + "=".repeat(78));
console.log("BEFORE / AFTER");
console.log("=".repeat(78));
{
  const cached = await loadTs("src/lib/ai/cached-system.ts");
  const MODEL = "claude-sonnet-4-6";

  // WHAT CACHING CHANGES is the PRICE of a block, not its size. Anthropic
  // charges a cache READ at 0.1x the input rate and a cache WRITE at
  // 1.25x, so the honest unit here is "full-price-equivalent tokens":
  // what the same request costs relative to sending everything fresh.
  const READ = 0.1;
  const WRITE = 1.25;
  const staticTok = tok(staticTotal);
  const perUserTok = tok(dynamicTotal - (ASSUMED.entityMentionCount * ASSUMED.entityMentionChars));
  const perMessageTok = tok(ASSUMED.entityMentionCount * ASSUMED.entityMentionChars);
  const historyTok = tok(historyChars);

  const before = staticTok * READ + (perUserTok + perMessageTok + historyTok);
  const after = staticTok * READ + perUserTok * READ + perMessageTok + historyTok * READ;

  console.log("  A message in an ongoing conversation, in full-price-equivalent tokens:");
  console.log(`    static prefix        ${String(staticTok).padStart(5)} tok   cached before and after`);
  console.log(`    per-user block       ${String(perUserTok).padStart(5)} tok   full price -> cached`);
  console.log(`    conversation history ${String(historyTok).padStart(5)} tok   full price -> cached`);
  console.log(`    this message's entities ${String(perMessageTok).padStart(2)} tok   full price, unavoidable`);
  console.log(`\n    BEFORE ${before.toFixed(0).padStart(6)} full-price-equivalent tokens`);
  console.log(`    AFTER  ${after.toFixed(0).padStart(6)}`);
  console.log(`    SAVED  ${(before - after).toFixed(0).padStart(6)}  (${(((before - after) / before) * 100).toFixed(0)}%)`);
  console.log(`\n  First message of a conversation pays the ${WRITE}x write premium once:`);
  const firstBefore = staticTok * WRITE + perUserTok + perMessageTok + historyTok;
  const firstAfter = (staticTok + perUserTok + historyTok) * WRITE + perMessageTok;
  console.log(`    BEFORE ${firstBefore.toFixed(0).padStart(6)}   AFTER ${firstAfter.toFixed(0).padStart(6)}   (${firstAfter > firstBefore ? "+" : ""}${(firstAfter - firstBefore).toFixed(0)})`);
  console.log("    — paid back by the second message of the conversation.");

  // And what NARROWING would add, if quality ever justifies turning it on.
  console.log("\n  If CONTEXT_RELEVANCE were on (it is not — see lib/ai/module-relevance.ts):");
  const lifeFull = lifeContextChars ?? 0;
  console.log(`    AI Life Context ${lifeFull} chars; dropping 6 of ${MODULE_COUNT} modules removes ~${Math.round((lifeFull * 6) / MODULE_COUNT)} chars`);
  console.log("    — but that block is now CACHED, so the saving is on a 0.1x line, not a 1.0x one.");
  console.log("    That is the finding: caching it was worth more than narrowing it,");
  console.log("    and narrowing is the only one of the two that can change an answer.");
  void cached; void MODEL;
}


// ==========================================================================
// RAISING PER_MODULE_LIMIT — what it costs, before anyone raises it
// ==========================================================================
//
// The product's one sentence is "it already knows your work". At five
// headlines per module, four questions in five come back with no numbers
// in them, so the sentence is not true. The question is what the true
// version costs.
//
// THE ANSWER TURNS ON WHERE THE BLOCK SITS. AI Life Context is inside
// systemPerUser, which is CACHED (see api/chat/route.ts): after the first
// message of a conversation it is billed at cacheRead, which Anthropic
// prices at 0.1x input. Growing a cached block is a tenth as expensive as
// growing an uncached one, and that is the whole finding here.
console.log(`\n${"=".repeat(78)}`);
console.log("PER_MODULE_LIMIT: 5 vs 20 vs 50");
console.log("=".repeat(78));
{
  const buildAt = (limit) =>
    chars(
      uc.buildUserContextPromptAdditionGreek({
        moduleSummaries: cm.CLASSIFIER_MODULES.map((m) => ({
          title: m.slug.slice(0, ASSUMED.moduleTitleChars),
          headlines: Array.from({ length: limit }, () => "x".repeat(ASSUMED.headlineChars)),
        })),
        activeMissions: Array.from({ length: ASSUMED.missionCount }, () => ({
          goal: "x".repeat(ASSUMED.missionChars),
          stepsCompleted: 2,
          stepsTotal: 5,
        })),
        latestEnergyCheckIn: { energyLevel: 4, note: "x".repeat(40) },
        healthScore: { score: 72 },
        knowledgeGraphLinkCount: 41,
        knowledgeGraphLinksThisWeek: 6,
      })
    );

  // Sonnet list price, from the app's own table rather than from memory.
  const INPUT_USD_PER_MTOK = 3;
  const CACHE_READ_MULT = 0.1;
  const CACHE_WRITE_MULT = 1.25;

  const base = buildAt(PER_MODULE_LIMIT ?? 5);
  const rows = [5, 20, 50].map((limit) => {
    const c = buildAt(limit);
    const t = tok(c);
    return {
      limit,
      chars: c,
      tokens: t,
      readUsd: (t / 1_000_000) * INPUT_USD_PER_MTOK * CACHE_READ_MULT,
      writeUsd: (t / 1_000_000) * INPUT_USD_PER_MTOK * CACHE_WRITE_MULT,
      deltaTok: t - tok(base),
    };
  });

  console.log(`  ${MODULE_COUNT} modules, headlines modelled at ${ASSUMED.headlineChars} chars (MAX_HEADLINE_LENGTH)`);
  console.log("");
  console.log("  rows/module   chars   tokens   cached read   cache write   vs 5 rows");
  for (const r of rows) {
    console.log(
      `  ${String(r.limit).padStart(6)}   ${String(r.chars).padStart(8)}   ${String(r.tokens).padStart(6)}` +
        `   $${r.readUsd.toFixed(6)}     $${r.writeUsd.toFixed(5)}    ${r.deltaTok >= 0 ? "+" : ""}${r.deltaTok} tok`
    );
  }

  const perMessageBefore = 590;
  console.log("");
  for (const r of rows.slice(1)) {
    const extraFullPriceEquivalent = Math.round(r.deltaTok * CACHE_READ_MULT);
    const pctOf = ((extraFullPriceEquivalent / perMessageBefore) * 100).toFixed(1);
    console.log(
      `  at ${r.limit} rows: +${r.deltaTok} cached tokens = +${extraFullPriceEquivalent} full-price-equivalent ` +
        `(+${pctOf}% of a ${perMessageBefore}-token message)`
    );
  }
  console.log("");
  console.log("  MARGIN. The multiplier is applied to MEASURED cost per action");
  console.log("  (lib/billing/margin-policy.ts), so a cost that rises by x% raises");
  console.log("  the charge by x% and the RATIO is unchanged. Raising this limit");
  console.log("  cannot move the 4x margin; it moves the price of a message.");
  console.log("");
  console.log("  NOT MEASURED: whether more rows produce better answers. That is a");
  console.log("  quality question and this file counts characters.");

  // --------------------------------------------------------------------
  // THE THREE WAYS TO GET MORE ROWS, PRICED.
  //
  // The obvious answer is "stop sending a flat 5 and send what the
  // question is about". lib/ai/module-relevance.ts already scores that,
  // and the scoring is already exported. It is used ONLY TO DROP modules,
  // never to deepen one, and it is off by default.
  //
  // The catch is the cache, and it is the whole reason this comparison
  // exists. AI Life Context lives in systemPerUser, which is stable
  // across the messages of a conversation and therefore cached. A
  // per-question allocation is DIFFERENT ON EVERY MESSAGE, so it cannot
  // sit there: it would break the prefix and put the entire per-user
  // block back on a full-price line. That makes the clever option more
  // expensive than the blunt one, which is not the answer anyone expects.
  console.log("");
  console.log("  " + "-".repeat(74));
  console.log("  THREE WAYS TO GET MORE ROWS, in full-price-equivalent tokens per message");
  console.log("  " + "-".repeat(74));
  const perUserBlockTok = 1385; // from BEFORE/AFTER above
  const flat20 = Math.round((tok(buildAt(20)) - tok(buildAt(5))) * CACHE_READ_MULT);
  // Same total rows as a flat 5 (13 x 5 = 65), redistributed: 30 to the
  // module the question is about, 15 to the runner-up, 2 to the rest.
  const redistributedRows = 30 + 15 + (MODULE_COUNT - 2) * 2;
  const flatRows = MODULE_COUNT * (PER_MODULE_LIMIT ?? 5);
  // Breaking the cache costs the block at full price instead of 0.1x.
  const cacheLoss = Math.round(perUserBlockTok * (1 - CACHE_READ_MULT));
  // A separate uncached block appended AFTER the cached one: the cache
  // survives, and only the extra rows are at full price.
  const deepDiveRows = 25;
  const deepDiveTok = tok(deepDiveRows * (ASSUMED.headlineChars + 2));
  console.log(`  A. flat 5 -> 20 everywhere          +${flat20} tok   cache intact, 20 rows in all ${MODULE_COUNT} modules`);
  console.log(
    `  B. relevance-weighted, same ${flatRows} rows   +${cacheLoss} tok   ${redistributedRows} rows, but the block ` +
      `changes per message`
  );
  console.log(`     (0 extra characters — the entire cost is the broken cache)`);
  console.log(
    `  C. keep flat 5 cached, append ${deepDiveRows}    +${deepDiveTok} tok   cache intact, ${deepDiveRows} extra rows ` +
      `in the module asked about`
  );
  console.log("");
  console.log("  B sends the FEWEST characters and costs the MOST. That is the finding.");
  console.log("  C is A's price with better aim: the deep rows go where the question is.");
}

// =====================================================================
// WHAT CROSS-MODULE CONTEXT ADDS (V4 #36)
// =====================================================================
//
// The brief's rule: measure tokens before and after, and if it doubles
// the context, find a narrower criterion. This is that measurement, run
// against the real selector on realistic questions rather than asserted.
{
  const cross = await loadTs("src/lib/ai/cross-module-context.ts");

  // Forty sessions is the pool the store actually loads. Half of them
  // are about the same subject as the question, which is far more
  // generous than reality — a real account's history is mostly about
  // other things.
  const candidates = Array.from({ length: 40 }, (_, i) => {
    const aboutMargin = i % 2 === 0;
    return {
      id: `s${i}`,
      atMs: Date.now() - i * 86_400_000,
      terms: aboutMargin
        ? ["margin", "calculate", "typescript", "generate", "pricing", "credits"]
        : ["parser", "csv", "python", "explain", "encoding"],
      text: aboutMargin
        ? `2026-03-0${(i % 9) + 1} generate (typescript): margin helper\n  asked: write a function that calculates the margin from cost and price\n  produced: export function margin(cost: number, price: number) { return (price - cost) / price; }`
        : `2026-03-0${(i % 9) + 1} explain (python): csv parser\n  asked: explain this csv parser\n  produced: it reads the file line by line and splits on commas`,
    };
  });

  const QUESTIONS = [
    ["about code, specific", "remember the margin function you wrote in typescript? why did you calculate it that way"],
    ["about code, vague", "what did you write for me"],
    ["not about code", "what was my revenue last month and which module should I focus on"],
    ["too short", "why?"],
  ];

  const CHAT_REQUEST_CHARS = 20_725; // measured above, one full chat request

  console.log("\n==============================================================================");
  console.log("CROSS-MODULE CONTEXT (V4 #36) — what it adds to a chat request");
  console.log("==============================================================================");
  console.log(`  A chat request already sends ${CHAT_REQUEST_CHARS} chars. Budget is ${cross.MAX_CROSS_CONTEXT_CHARS}.`);
  console.log("\n  question                     kept  added chars   share of request");
  let worst = 0;
  for (const [label, question] of QUESTIONS) {
    const selection = cross.selectCrossContext({ question, candidates, kind: "coding" });
    const chars = cross.crossContextChars(selection, "coding");
    worst = Math.max(worst, chars);
    const share = ((chars / CHAT_REQUEST_CHARS) * 100).toFixed(1);
    console.log(
      `  ${label.padEnd(28)} ${String(selection.chosen.length).padStart(2)}   ${String(chars).padStart(6)}       ${share.padStart(5)}%   ${selection.reason}`
    );
  }
  console.log(`\n  WORST CASE ${worst} chars = ${((worst / CHAT_REQUEST_CHARS) * 100).toFixed(1)}% of the request, ~${Math.round(worst / 4)} tokens.`);
  console.log("  The brief's threshold is DOUBLING (+100%). This is an order of magnitude inside it.");
  console.log("  It is also UNCACHED — it varies per message, so it sits in the per-user");
  console.log("  block by design; putting it in the static prefix would break the cache");
  console.log("  on every turn, which would cost far more than the block itself.");
}

console.log("\nNOTE: characters are exact. Tokens are chars/4, the app's own");
console.log("assumption (lib/billing/estimate.ts). That figure is calibrated for");
console.log("English; the Greek blocks above tokenize worse, and by how much is");
console.log("NOT measured here — no offline tokenizer, and count-tokens needs a key.");
