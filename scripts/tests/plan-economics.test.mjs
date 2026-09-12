/**
 * What every plan costs us in its worst month, and what that leaves.
 *
 * THE GAP THIS EXISTS TO CLOSE. Two subsystems each guarantee they stay
 * under a ceiling, and nothing adds them together:
 *
 *   1. CREDIT-SETTLED WORK. lib/billing/credit-formula.ts charges
 *      ceil(cost x margin / creditPrice), so spending an entire monthly
 *      allowance costs us exactly price/margin. At the per-plan multipliers
 *      in margin-policy.ts that is 20-25% of the plan price. Under the
 *      ceiling, by construction, with a proof in the file.
 *
 *   2. FREE CHAT. lib/billing/free-chat.ts hands out 15-1200 messages a
 *      month that cost NO credits, each capped at EUR 0.02. Its own comment
 *      says the allowances are "sized to land at ~20% of the plan price at
 *      absolute worst case, leaving headroom under the 25% ceiling".
 *
 * Both are true. Both are measured against the same 25% ceiling. Neither
 * knows the other exists, so a plan's real worst case is the SUM — and the
 * sum is 32-37%, which is a blended margin of 2.7-3.1x, not the >=4x the
 * product believes it has.
 *
 * Nothing here is broken in the sense of a bug: every individual charge is
 * correct and every individual ceiling is respected. The number that was
 * never computed is the one that matters.
 *
 * Run: node scripts/tests/plan-economics.test.mjs
 */
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
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail !== undefined) console.log(`        ${detail}`);
}

const { PLANS } = await loadTs("src/lib/billing/plans.ts");
const { PLAN_MARGIN_DEFAULTS } = await loadTs("src/lib/billing/margin-policy.ts");
const { DEFAULT_FREE_CHAT_MESSAGES, DEFAULT_FREE_CHAT_MAX_COST_EUR } = await loadTs(
  "src/lib/billing/free-chat.ts"
);
const { DEFAULTS } = await loadTs("src/lib/billing/pricing-config.ts");

const LIST_CREDIT_PRICE = DEFAULTS.creditPriceEur;

/** What one credit is really worth on this plan — mirrors effectiveCreditPriceEur. */
function creditPriceFor(plan) {
  if (typeof plan.price !== "number" || typeof plan.monthlyCredits !== "number") {
    // Enterprise: assume the cheapest published rate, which is the only
    // assumption that cannot under-charge.
    const rates = PLANS.filter(
      (p) => typeof p.price === "number" && p.price > 0 && typeof p.monthlyCredits === "number"
    ).map((p) => p.price / p.monthlyCredits);
    return Math.min(LIST_CREDIT_PRICE, ...rates);
  }
  if (plan.price <= 0 || plan.monthlyCredits <= 0) return LIST_CREDIT_PRICE;
  return Math.min(LIST_CREDIT_PRICE, plan.price / plan.monthlyCredits);
}

const ULTIMATE = PLANS.find((p) => p.slug === "ultimate");

const rows = PLANS.map((plan) => {
  // Enterprise has no published price; priced as Ultimate so the ratio is
  // meaningful rather than NaN.
  const price = typeof plan.price === "number" ? plan.price : ULTIMATE.price;
  const credits = typeof plan.monthlyCredits === "number" ? plan.monthlyCredits : ULTIMATE.monthlyCredits;
  const margin = PLAN_MARGIN_DEFAULTS[plan.slug];

  // Spending the whole allowance on credit-settled AI.
  const creditCost = (credits * creditPriceFor(plan)) / margin;
  // Every free message, each at its cost ceiling.
  const freeChatCost = DEFAULT_FREE_CHAT_MESSAGES[plan.slug] * DEFAULT_FREE_CHAT_MAX_COST_EUR;
  const total = creditCost + freeChatCost;

  return {
    slug: plan.slug,
    price,
    creditCost,
    freeChatCost,
    total,
    sharePct: price > 0 ? (total / price) * 100 : Infinity,
    blendedMargin: total > 0 ? price / total : Infinity,
    creditOnlyMargin: margin,
  };
});

console.log("== worst-case month, per plan ==");
console.log("  plan          price   credits+chat = total    % of price   blended margin");
for (const r of rows) {
  const price = r.price === 0 ? "free" : `EUR ${String(r.price).padStart(3)}`;
  const share = r.price > 0 ? `${r.sharePct.toFixed(1).padStart(5)}%` : "    n/a";
  const m = r.price > 0 ? `${r.blendedMargin.toFixed(2)}x` : "n/a";
  console.log(
    `  ${r.slug.padEnd(13)} ${price}   ${r.creditCost.toFixed(2).padStart(6)}+${r.freeChatCost
      .toFixed(2)
      .padStart(5)} = ${r.total.toFixed(2).padStart(6)}   ${share}       ${m}`
  );
}

console.log("\n== 1. credit-settled work alone clears the floor ==");
// This is the guarantee credit-formula.ts actually proves, and it holds.
for (const r of rows) {
  checkTrue(
    `${r.slug}: credit-settled margin ${r.creditOnlyMargin}x >= 4x`,
    r.creditOnlyMargin >= 4
  );
}

console.log("\n== 2. free chat is not free ==");
// Recorded so the number cannot drift upward unnoticed. Raising an
// allowance in free-chat.ts moves this, and it should be a decision.
const paid = rows.filter((r) => r.price > 0);
for (const r of paid) {
  const share = (r.freeChatCost / r.price) * 100;
  // 6%, against 4.3% measured on every paid plan (2026-09-12). The old
  // ceiling was 15%, which left room to TRIPLE the top plan's allowance
  // without this line noticing — plan-economics.mutation.mjs did exactly
  // that and the gate stayed green.
  checkTrue(
    `${r.slug}: free chat is ${share.toFixed(1)}% of price (<= 6%)`,
    share <= 6,
    `${DEFAULT_FREE_CHAT_MESSAGES[r.slug]} messages x EUR ${DEFAULT_FREE_CHAT_MAX_COST_EUR}`
  );
}

console.log("\n== 3. the two together ==");
// THE TARGET IS 0.25 AND THE PRODUCT IS AT 0.243 — measured 2026-09-12.
//
// This comment said "the product is at 0.37" and the ceiling below was
// 0.375 to match. Both were true when written and neither is now: the
// worst-case month costs 24.3% of price on every paid plan, so the target
// this file was written to chase has been MET and nothing said so.
//
// A ratchet thirteen points above the measured value is not a ratchet. It
// is a number that will absorb the next three regressions in silence, and
// plan-economics.mutation.mjs proved it: cutting the entry plan's price
// from EUR 20 to EUR 8, and separately quadrupling the credits it grants,
// both left this gate green. So the ceiling is the target now, which the
// product already clears.
//
// THE ARITHMETIC, kept because it is what makes the number movable: with
// credit margin M and free chat at share F of price, the worst case is
// 1/M + F, and >=4x blended needs 1/M + F <= 0.25. Today M is 5 and F is
// 0.043, giving 0.243. The lever that moves it is F — the free-chat
// allowance in free-chat.ts — not M.
const WORST_CASE_SHARE_CEILING = 0.25;
const TARGET_SHARE_CEILING = 0.25;

for (const r of paid) {
  checkTrue(
    `${r.slug}: worst case ${r.sharePct.toFixed(1)}% of price (<= ${(WORST_CASE_SHARE_CEILING * 100).toFixed(1)}% recorded)`,
    r.sharePct / 100 <= WORST_CASE_SHARE_CEILING,
    `EUR ${r.total.toFixed(2)} of EUR ${r.price}`
  );
}

const breaching = paid.filter((r) => r.sharePct / 100 > TARGET_SHARE_CEILING).map((r) => r.slug);
console.log(
  `\n  NOTE  ${breaching.length} of ${paid.length} paid plans are above the ${(TARGET_SHARE_CEILING * 100).toFixed(0)}% target: ${breaching.join(", ") || "none"}`
);
console.log(
  "        Blended margin today runs " +
    `${Math.min(...paid.map((r) => r.blendedMargin)).toFixed(2)}x-${Math.max(...paid.map((r) => r.blendedMargin)).toFixed(2)}x, against a >=4x goal.`
);

console.log("\n== 4. free is an acquisition cost, and a bounded one ==");
const free = rows.find((r) => r.slug === "free");
checkTrue(
  `free costs at most EUR ${free.total.toFixed(2)}/account/month (<= EUR 1.00)`,
  free.total <= 1,
  `${free.creditCost.toFixed(2)} credits + ${free.freeChatCost.toFixed(2)} chat`
);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
