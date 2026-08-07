// V3 Task 16 — the guard that stops the narrator inventing figures.
//
// The detectors compute the facts; the model only phrases them. This
// file tests the thing that makes "only phrases them" true rather than
// requested: every number in the model's sentence is checked against the
// numbers that went in, and a sentence containing one we never computed
// is discarded in favour of the detector's own wording.
//
// Why it matters: "roughly a third of your revenue" when the evidence
// says 81% is not a rephrasing, it is a different claim — and a user
// acting on it would be acting on something this product never worked
// out.
//
// Run: node scripts/tests/insight-narration.test.mjs
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

const n = await loadTs("src/lib/insights/narrate.ts");

const finding = {
  detector: "revenue_concentration",
  moduleSlug: "finance",
  sampleSize: 41,
  evidence: {
    sharePercent: 81,
    topNames: ["Acme Ltd", "Globex"],
    topAmounts: [9000, 6000],
    totalClients: 7,
    totalIncome: 18500,
  },
  statement: "81% of your recorded income comes from 2 of 7 sources: Acme Ltd and Globex.",
};

console.log("== 1. which numbers the narrator may use ==");
const allowed = n.allowedNumbers(finding);
checkTrue("the evidence numbers are allowed", allowed.has("81") && allowed.has("18500"));
checkTrue("numbers inside arrays are allowed", allowed.has("9000") && allowed.has("6000"));
checkTrue("the sample size is allowed", allowed.has("41"));
checkTrue("numbers only in the statement are allowed", allowed.has("7"));
checkTrue("a number nobody computed is not", !allowed.has("33"));

console.log("\n== 2. grounded narrations pass ==");
checkTrue(
  "the same numbers, different words",
  n.numbersAreGrounded("Acme Ltd and Globex together account for 81% of your income.", allowed)
);
// Small integers are ordinals in prose. Rejecting a sentence for
// containing "two" would reject almost every sentence.
checkTrue("small counting words are fine", n.numbersAreGrounded("Just two clients make up most of it.", allowed));
checkTrue("no numbers at all is fine", n.numbersAreGrounded("Your income is heavily concentrated.", allowed));
// A model may legitimately write 9000 as 9,000 or 9.000 depending on
// locale — the grouped reading is accepted before rejecting.
checkTrue("a grouped thousand is recognised", n.numbersAreGrounded("Acme Ltd paid 9,000 in total.", allowed));
checkTrue("...in the other grouping too", n.numbersAreGrounded("Acme Ltd paid 9.000 in total.", allowed));

console.log("\n== 3. invented figures are caught ==");
// THE CASE THIS EXISTS FOR. A plausible, confident, wrong number.
check(
  "a percentage nobody computed is rejected",
  n.numbersAreGrounded("Roughly 33% of your revenue comes from two clients.", allowed),
  false
);
check(
  "an invented amount is rejected",
  n.numbersAreGrounded("Acme Ltd paid you 12500 last year.", allowed),
  false
);
check(
  "an invented sample size is rejected",
  n.numbersAreGrounded("Across 900 invoices, two clients dominate.", allowed),
  false
);
// A derived figure is still a figure we did not compute. 81% of 18500 is
// arithmetic the model did, not a fact the detector established.
check(
  "a number the model derived itself is rejected",
  n.numbersAreGrounded("That is 14985 of your income.", allowed),
  false
);

console.log("\n== 4. the fallback is a true sentence ==");
const fallback = n.fallbackNarration(finding);
checkTrue("the headline is non-empty", fallback.headline.length > 10);
checkTrue("the detail is non-empty", fallback.detail.length > 0);
// The fallback comes from the detector, so by construction it can only
// contain computed numbers.
checkTrue("the headline is grounded by construction", n.numbersAreGrounded(fallback.headline, allowed));
checkTrue("...and so is the detail", n.numbersAreGrounded(fallback.detail, allowed));
checkTrue("the headline is not absurdly long", fallback.headline.length <= 90);

// A single-sentence statement still splits into something usable.
const single = n.fallbackNarration({
  ...finding,
  statement: "You have 12 ideas recorded and none of them has been turned into a mission yet.",
});
checkTrue("a one-sentence finding still yields a headline", single.headline.length > 10);
checkTrue("...and a detail", single.detail.length > 0);

console.log("\n== 5. the system prompt forbids the two things that ruin this ==");
const prompt = n.narrateSystemPrompt("el");
checkTrue("it names the user's language", prompt.includes("el"));
// Advice and generic wisdom are the two ways an insight stops being
// about the user's own data.
checkTrue("it forbids advice", /NO ADVICE/i.test(prompt));
checkTrue("it forbids generic business wisdom", /GENERIC BUSINESS WISDOM/i.test(prompt));
checkTrue("it forbids new numbers", /must appear in the fact/i.test(prompt));
// Client names and ticker symbols came out of a user's spreadsheet.
checkTrue("it fences the values as data", /DATA/.test(prompt));
checkTrue("...and says not to translate their names", /not words to translate/i.test(prompt));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
