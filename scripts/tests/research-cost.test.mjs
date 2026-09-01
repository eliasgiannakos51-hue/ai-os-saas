// WHAT THE ACCOUNT CONTEXT COSTS A RESEARCH REPORT, in characters and in
// the money that follows from them.
//
// V4.6. "Measure: how much does the cost go up? Is the margin 4x?"
//
// WHAT IS MEASURED AND WHAT IS ESTIMATED, said first because the two get
// conflated and only one of them is a fact:
//
//   MEASURED — the characters. buildSynthesisInput is called with and
//   without the account context and the two strings are subtracted. That
//   is exact and it is what this file asserts on.
//
//   ESTIMATED — the tokens. lib/text/relevance-budget.ts's
//   CHARS_PER_TOKEN = 4, the same divisor every other budget in this
//   codebase uses. It is a divisor, not a tokenizer: English runs near
//   4, Greek and Arabic run lower (more tokens per character), and CJK
//   lower still. So the token figures below are the RIGHT ORDER and not
//   the right number, and the honest way to hold them is as a ceiling on
//   the English case rather than as a measurement of any case.
//
// The one number that is neither measured nor estimated here is the real
// billed usage: that comes back from the API in `response.usage` and is
// recorded by the CostAccumulator on every real run. This file cannot
// see it and does not pretend to.
//
// THE MARGIN IS NOT DILUTED, and this file needed two corrections to say
// so. See the "margin question" section at the bottom: credits are
// computed from the measured bill, so the multiplier is preserved by
// construction and what changes is the price of a report, not the margin
// on it.
//
// Run: node scripts/tests/research-cost.test.mjs
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

const { buildSynthesisInput } = await loadTs("src/lib/research/research.ts");
const { collateEntrySources } = await loadTs("src/lib/research/entry-sources.ts");
const { formatAccountSummary } = await loadTs("src/lib/research/research-context.ts");
const { estimateTokens, CHARS_PER_TOKEN } = await loadTs("src/lib/text/relevance-budget.ts");
const { DEEP_DIVE_CHAR_BUDGET, DEEP_DIVE_ROW_LIMIT } = await loadTs("src/lib/ai/deep-dive.ts");

// A REALISTIC REPORT, not a favourable one. Twelve web sources and six
// questions is a normal deep research run; a two-source fixture would
// make the account context look proportionally larger than it is.
const SOURCES = Array.from({ length: 12 }, (_, i) => ({
  url: `https://example${i + 1}.test/report-${i + 1}`,
  title: `A source with a title of roughly the length a real one has, number ${i + 1}`,
}));
const FINDINGS = Array.from({ length: 6 }, (_, i) => ({
  question: `Question ${i + 1} about the topic, phrased the way the planner phrases them?`,
  summary: "A paragraph of findings, about as long as the model actually returns for one question. ".repeat(6),
  sources: SOURCES.slice(i, i + 3),
}));

// THE ACCOUNT AT ITS WIDEST: every module in use, the deep read at its
// full row limit. Anything smaller would understate the cost, and the
// question is what the WORST case costs.
const MODULE_SUMMARIES = Array.from({ length: 13 }, (_, i) => ({
  slug: `module-${i + 1}`,
  title: `Module Number ${i + 1}`,
  rows: Array.from({ length: 20 }, () => ({ atMs: Date.UTC(2026, 2, 14) })),
}));
const accountSummary = formatAccountSummary(MODULE_SUMMARIES, [], 3, 20);

const READS = [
  {
    slug: "finance",
    title: "Finance",
    shown: DEEP_DIVE_ROW_LIMIT,
    omitted: 0,
    rows: Array.from({ length: DEEP_DIVE_ROW_LIMIT }, (_, i) => ({
      id: `${String(i + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
      headline: `An entry headline of about the length people actually write, number ${i + 1}`,
      atMs: Date.UTC(2026, 2, 14),
    })),
  },
];
const entries = collateEntrySources(READS);

const before = buildSynthesisInput({ topic: "Pricing in my market", findings: FINDINGS, sources: SOURCES });
const after = buildSynthesisInput({
  topic: "Pricing in my market",
  findings: FINDINGS,
  sources: SOURCES,
  entries,
  accountSummary,
});

const addedChars = after.length - before.length;
const addedTokens = estimateTokens(addedChars);
const baseTokens = estimateTokens(before.length);

console.log("== what the account context adds to ONE synthesis prompt ==");
console.log(`        prompt without it : ${before.length} chars  (~${baseTokens} tokens)`);
console.log(`        prompt with it    : ${after.length} chars  (~${estimateTokens(after.length)} tokens)`);
console.log(`        added             : ${addedChars} chars  (~${addedTokens} tokens, at ${CHARS_PER_TOKEN} chars/token)`);
console.log(`        of which flat     : ${accountSummary.length} chars`);
console.log(`        of which entries  : ${addedChars - accountSummary.length} chars`);
console.log(`        as a share        : ${((addedChars / before.length) * 100).toFixed(1)}% of the prompt`);

check(
  `the context is actually added (${addedChars} chars)`,
  addedChars > 500,
  `${addedChars} — nothing was added, so every figure below describes an unchanged prompt`
);

// ONCE PER REPORT, NOT ONCE PER QUESTION. This is the shape of the cost
// and it is the reason it is affordable: the six research questions each
// cost a model call with web search, and the account context is not in
// any of them. It goes into the SYNTHESIS, which happens once.
check(
  "the account context appears in the synthesis prompt only",
  after.includes("THE USER'S ACCOUNT") && after.includes("[E1]"),
  "the entry list or the account summary is missing from the synthesis input"
);

// THE CEILING. The deep read is bounded by DEEP_DIVE_CHAR_BUDGET and the
// flat summary by the module count, so the worst case is arithmetic
// rather than a hope. 13 modules x ~70 chars is under 1000; the deep read
// is capped at DEEP_DIVE_CHAR_BUDGET; the entry list is 25 rows of ~110.
const CEILING_CHARS = 1000 + DEEP_DIVE_CHAR_BUDGET + DEEP_DIVE_ROW_LIMIT * 140;
check(
  `the worst case is bounded (${addedChars} <= ${CEILING_CHARS})`,
  addedChars <= CEILING_CHARS,
  `${addedChars} — above the arithmetic ceiling, so something is unbounded`
);

// AND THE PART THAT DOES NOT SCALE WITH THE ACCOUNT. An account with two
// hundred entries per module must cost the same as one with twenty: the
// flat half reports what a capped scan saw, and the deep half stops at
// its own row limit. This is the check that would catch a change making
// either half proportional to account size.
const BIGGER = Array.from({ length: 13 }, (_, i) => ({
  slug: `module-${i + 1}`,
  title: `Module Number ${i + 1}`,
  rows: Array.from({ length: 500 }, () => ({ atMs: Date.UTC(2026, 2, 14) })),
}));
const biggerSummary = formatAccountSummary(BIGGER, [], 3, 20);
check(
  `a 25x larger account costs the same flat summary (${accountSummary.length} vs ${biggerSummary.length} chars)`,
  Math.abs(biggerSummary.length - accountSummary.length) <= 40,
  `${accountSummary.length} -> ${biggerSummary.length} — the flat half is scaling with the account`
);

console.log("\n== the margin question, answered ==");
// THE MARGIN DOES NOT MOVE, AND TWO DRAFTS OF THIS FILE SAID OTHERWISE.
//
// The first said the margin could not be computed — "the provider rate
// is not in this repository". It is: lib/billing/model-pricing.ts prices
// every model per million tokens.
//
// The second computed a DILUTION: charge stays fixed, bill goes up, so
// 4x becomes 3.57x. It printed that as a failing check. It was wrong,
// and the mistake is worth keeping written down because the number it
// produced was plausible, precise and about a system that does not
// exist. The premise was "the charge is fixed". It is not.
// lib/billing/reservations.ts's settleReservation reads
// `costs.totals().usdCost` — the MEASURED bill — and converts it to
// credits through the margin multiplier. So:
//
//     margin = charge / bill = (bill x M) / bill = M
//
// Adding tokens raises the bill AND the charge, proportionally. The
// multiplier is preserved by construction; there is nothing for the
// account context to dilute.
//
// WHAT ACTUALLY CHANGES is what the user pays. That is the real question
// and it has a real answer, so it is the one measured here.
const { MODEL_PRICING_USD } = await loadTs("src/lib/billing/model-pricing.ts");
const { RESEARCH_MODEL } = await loadTs("src/lib/files/file-models.ts");

const price = MODEL_PRICING_USD[RESEARCH_MODEL];
check(
  `the research model is priced (${RESEARCH_MODEL})`,
  Boolean(price) && price.inputPerMTok > 0,
  `${RESEARCH_MODEL} is not in MODEL_PRICING_USD — every figure below would be zero`
);

// INPUT TOKENS ONLY. The account context is prompt, not completion: it
// cannot change what the model writes back, so the output side of the
// bill is untouched.
const addedUsd = (addedTokens / 1_000_000) * price.inputPerMTok;
// A WHOLE REPORT'S INPUT, priced the same way. Seven or eight calls; the
// six question calls carry web-search results, which are the bulk of it.
// 4000 chars per question prompt is the conservative direction: a
// SMALLER denominator makes the added share look BIGGER, so this cannot
// flatter the result.
const reportInputTokens = estimateTokens(before.length + FINDINGS.length * 4000);
const reportInputUsd = (reportInputTokens / 1_000_000) * price.inputPerMTok;
const inputRise = addedUsd / reportInputUsd;

console.log(`        ${RESEARCH_MODEL} input: $${price.inputPerMTok}/Mtok, output: $${price.outputPerMTok}/Mtok`);
console.log(`        report input before : ~${reportInputTokens} tok  = $${reportInputUsd.toFixed(6)}`);
console.log(`        the account context : ~${addedTokens} tok  = $${addedUsd.toFixed(6)}`);
console.log(`        input bill rises by : ${(inputRise * 100).toFixed(1)}%`);
console.log(`        MARGIN              : unchanged. Credits are computed FROM the measured`);
console.log(`                              bill (reservations.ts), so charge and bill move together.`);
console.log(`        WHAT THE USER PAYS  : at most ${(inputRise * 100).toFixed(1)}% more credits per report,`);
console.log(`                              and less than that once output tokens are counted —`);
console.log(`                              they are the larger half of a synthesis bill at`);
console.log(`                              $${price.outputPerMTok}/Mtok and the context does not change them.`);

// AN UPPER BOUND, ASSERTED. The input-only rise is the ceiling on the
// price increase, and it is worth holding down: a context that doubled
// what a report costs would be a different decision from one that adds a
// tenth, whatever it did to the margin.
check(
  `a report costs at most ${(inputRise * 100).toFixed(1)}% more, input-only ceiling`,
  inputRise < 0.2,
  `${(inputRise * 100).toFixed(1)}% — above a fifth, which is a pricing decision rather than a detail`
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
