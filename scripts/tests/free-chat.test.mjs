// Reproduction test for free chat's economics.
//
// The thing that can silently go wrong here is not a crash — it is the
// allowance quietly costing more than the plan it sits on. Every check
// below is about that.
//
// Run: node scripts/tests/free-chat.test.mjs
import { loadTs } from "./load-ts.mjs";

const m = await loadTs("src/lib/billing/free-chat.ts");
const {
  freeChatWorstCaseCost,
  fullChatWorstCaseCost,
  freeChatEconomics,
  freeChatAllowance,
  freeChatAllowanceForSlug,
  FREE_CHAT_LIMITS,
  PAID_CHAT_LIMITS,
  FREE_CHAT_TARGET_SHARE,
  DEFAULT_FREE_CHAT_MESSAGES,
} = m;

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

console.log("== 1. the free envelope really is smaller than the paid one ==");
check("free message cap < paid message cap", FREE_CHAT_LIMITS.maxMessageChars < PAID_CHAT_LIMITS.maxMessageChars);
check("free history window < paid", FREE_CHAT_LIMITS.historyLimit < PAID_CHAT_LIMITS.historyLimit);
check("free output cap < paid", FREE_CHAT_LIMITS.maxOutputTokens < PAID_CHAT_LIMITS.maxOutputTokens);
check("web search is off for free messages", FREE_CHAT_LIMITS.webSearch === false);

console.log("\n== 2. the route's real constants match what this file models ==");
// If someone raises MAX_TOKENS or HISTORY_LIMIT in the route without
// updating PAID_CHAT_LIMITS, every worst case below silently understates.
const { readFileSync } = await import("node:fs");
const route = readFileSync("src/app/api/chat/route.ts", "utf8");
const routeConst = (name) => {
  const match = route.match(new RegExp(`const ${name} = (\\d+)`));
  return match ? Number(match[1]) : null;
};
const routeMaxUses = Number(route.match(/max_uses:\s*(\d+)/)?.[1] ?? NaN);
check("MAX_MESSAGE_LENGTH matches", routeConst("MAX_MESSAGE_LENGTH") === PAID_CHAT_LIMITS.maxMessageChars,
  `route=${routeConst("MAX_MESSAGE_LENGTH")} model=${PAID_CHAT_LIMITS.maxMessageChars}`);
check("HISTORY_LIMIT matches", routeConst("HISTORY_LIMIT") === PAID_CHAT_LIMITS.historyLimit,
  `route=${routeConst("HISTORY_LIMIT")} model=${PAID_CHAT_LIMITS.historyLimit}`);
check("MAX_TOKENS matches", routeConst("MAX_TOKENS") === PAID_CHAT_LIMITS.maxOutputTokens,
  `route=${routeConst("MAX_TOKENS")} model=${PAID_CHAT_LIMITS.maxOutputTokens}`);
check("web_search max_uses matches", routeMaxUses === PAID_CHAT_LIMITS.maxWebSearches,
  `route=${routeMaxUses} model=${PAID_CHAT_LIMITS.maxWebSearches}`);

console.log("\n== 3. worst-case cost per message ==");
const free = freeChatWorstCaseCost();
const full = fullChatWorstCaseCost();
console.log(`        free: ${free.inputTokens} in / ${free.outputTokens} out / ${free.webSearches} searches = EUR ${free.costEur.toFixed(4)}`);
console.log(`        paid: ${full.inputTokens} in / ${full.outputTokens} out / ${full.webSearches} searches = EUR ${full.costEur.toFixed(4)}`);
check("free worst case is a positive, finite number", free.costEur > 0 && Number.isFinite(free.costEur));
check("free message charges no search fee", free.webSearches === 0);
check("free worst case is at least 10x cheaper than paid", full.costEur / free.costEur >= 10,
  `ratio ${(full.costEur / free.costEur).toFixed(1)}x`);

console.log(`\n== 4. THE BUDGET: this quota fits the ${FREE_CHAT_TARGET_SHARE * 100}% it was allocated ==`);
// DELIBERATELY NOT "the 25% ceiling". This file can only see one
// subsystem, and a file that can only see one subsystem must not claim to
// have checked the whole ceiling — that claim is exactly what let free
// chat sit at 18.8% next to a credit subsystem at 25% and call the pair
// compliant. The 25% question belongs to combined-ceiling.test.mjs, which
// sees both halves; this section checks only that free chat stays inside
// the slice the registry gave it.
const rows = freeChatEconomics();
console.log("        Plan          Price   Free  WorstCost    Budget   %ofPrice");
for (const r of rows) {
  console.log(
    "       ",
    r.planSlug.padEnd(13),
    String(r.planPriceEur).padStart(6),
    String(r.freeMessages).padStart(5),
    ("EUR " + r.worstCaseCostEur.toFixed(2)).padStart(11),
    (r.budgetEur === null ? "--" : "EUR " + r.budgetEur.toFixed(2)).padStart(9),
    (r.shareOfPrice === null ? "--" : (r.shareOfPrice * 100).toFixed(1) + "%").padStart(9)
  );
}
for (const r of rows) {
  check(
    `${r.planSlug} within its allocated budget`,
    r.withinBudget,
    r.budgetEur === null
      ? `EUR ${r.worstCaseCostEur.toFixed(4)} absolute`
      : `EUR ${r.worstCaseCostEur.toFixed(4)} of EUR ${r.budgetEur.toFixed(4)}`
  );
}
// Enterprise is no longer exempt: it has a contractual floor price, so a
// share of it is defined. Only Free — price genuinely zero — has none.
check(
  "every plan with a measurable price has a defined share",
  rows.filter((r) => r.planSlug !== "free").every((r) => r.shareOfPrice !== null),
  JSON.stringify(rows.filter((r) => r.shareOfPrice === null).map((r) => r.planSlug))
);
check(
  "enterprise is measured against its contractual floor, not exempted",
  rows.find((r) => r.planSlug === "enterprise").shareOfPrice !== null
);
check("free plan reports no share (its price is zero)", rows.find((r) => r.planSlug === "free").shareOfPrice === null);
check("free plan's absolute cost stays under EUR 1/month", rows.find((r) => r.planSlug === "free").worstCaseCostEur < 1,
  `EUR ${rows.find((r) => r.planSlug === "free").worstCaseCostEur.toFixed(2)}`);

// The handoff, asserted rather than described: the whole-ceiling question
// is answered elsewhere, and it must actually reach 4x there.
const combined = await loadTs("src/lib/billing/free-allowances.ts");
for (const row of combined.combinedCeilingTable()) {
  if (row.priceEur === null) continue;
  check(
    `${row.planSlug}: credits + free chat together really are >= 4x (${row.combinedMargin.toFixed(2)}x)`,
    row.combinedMargin >= 4 - 1e-9,
    `${(row.totalShare * 100).toFixed(1)}% of EUR ${row.priceEur}`
  );
}

console.log("\n== 5. allowance grows with plan price ==");
const order = ["free", "starter", "growth", "professional", "ultimate"];
let monotone = true;
for (let i = 1; i < order.length; i++) {
  if (DEFAULT_FREE_CHAT_MESSAGES[order[i]] <= DEFAULT_FREE_CHAT_MESSAGES[order[i - 1]]) monotone = false;
}
check("a more expensive plan never gets fewer free messages", monotone);
check("enterprise is bounded, not unlimited", Number.isFinite(DEFAULT_FREE_CHAT_MESSAGES.enterprise) && DEFAULT_FREE_CHAT_MESSAGES.enterprise > 0);

console.log("\n== 6. env overrides ==");
const saved = { ...process.env };
process.env.FREE_CHAT_MESSAGES_STARTER = "42";
check("env override is used", freeChatAllowance("starter") === 42, `got ${freeChatAllowance("starter")}`);
process.env.FREE_CHAT_MESSAGES_STARTER = "not-a-number";
check("garbage env falls back to the default", freeChatAllowance("starter") === DEFAULT_FREE_CHAT_MESSAGES.starter);
process.env.FREE_CHAT_MESSAGES_STARTER = "-5";
check("negative env falls back to the default", freeChatAllowance("starter") === DEFAULT_FREE_CHAT_MESSAGES.starter);
process.env.FREE_CHAT_MESSAGES_STARTER = "0";
check("explicit 0 disables the allowance for that plan", freeChatAllowance("starter") === 0);
delete process.env.FREE_CHAT_MESSAGES_STARTER;
process.env.FREE_CHAT_ENABLED = "false";
check("FREE_CHAT_ENABLED=false turns everything off", order.every((s) => freeChatAllowance(s) === 0));
delete process.env.FREE_CHAT_ENABLED;
check("default restored after env cleanup", freeChatAllowance("starter") === DEFAULT_FREE_CHAT_MESSAGES.starter);
process.env = saved;

console.log("\n== 7. an unknown plan slug degrades to Free, not to unlimited ==");
check("unknown slug -> free allowance", freeChatAllowanceForSlug("no-such-plan") === DEFAULT_FREE_CHAT_MESSAGES.free);
check("empty slug -> free allowance", freeChatAllowanceForSlug("") === DEFAULT_FREE_CHAT_MESSAGES.free);

console.log("\n== 8. raising an allowance past the ceiling is caught ==");
// Proves the ceiling protection is load-bearing rather than always-true.
// It used to be a REPORT (withinCeiling flipped to false and someone had
// to notice); the allowance is now CLAMPED to the ceiling-derived maximum
// at the source, so an absurd env value cannot take effect at all.
process.env.FREE_CHAT_MESSAGES_STARTER = "100000";
const clamped = freeChatEconomics().find((r) => r.planSlug === "starter");
check(
  "an absurd allowance is CLAMPED, never granted",
  clamped.freeMessages < 100000,
  `granted ${clamped.freeMessages}`
);
check(
  "the clamp lands exactly at the ceiling-derived maximum",
  clamped.freeMessages === m.maxAllowanceWithinCeiling("starter"),
  `granted ${clamped.freeMessages}, max ${m.maxAllowanceWithinCeiling("starter")}`
);
check("so the economics stay within the allocated budget even then", clamped.withinBudget === true,
  `${(clamped.shareOfPrice * 100).toFixed(1)}% of price, budget EUR ${clamped.budgetEur.toFixed(2)}`);
delete process.env.FREE_CHAT_MESSAGES_STARTER;

console.log("\n== 9. the per-message cost cap (FREE_CHAT_MAX_COST_EUR) ==");
const { freeChatMaxCostEur, freeChatMessageEstimatedCostEur, freeChatPerMessageWorstCaseEur } = m;
check("default cap is €0.02", freeChatMaxCostEur({}) === 0.02);
check("env override works", freeChatMaxCostEur({ FREE_CHAT_MAX_COST_EUR: "0.05" }) === 0.05);
check("garbage falls back to the default", freeChatMaxCostEur({ FREE_CHAT_MAX_COST_EUR: "-1" }) === 0.02);
const smallCost = freeChatMessageEstimatedCostEur(100, 3000);
const bigCost = freeChatMessageEstimatedCostEur(FREE_CHAT_LIMITS.maxMessageChars, 14000);
check("the estimate grows with message size", bigCost > smallCost, `${smallCost} vs ${bigCost}`);
check(
  "a small message fits under the default cap",
  smallCost <= 0.02,
  `€${smallCost.toFixed(4)}`
);
check(
  "a max-length free message with a big system prompt still fits under the cap",
  freeChatMessageEstimatedCostEur(FREE_CHAT_LIMITS.maxMessageChars, 8000) <= 0.02,
  `€${freeChatMessageEstimatedCostEur(FREE_CHAT_LIMITS.maxMessageChars, 8000).toFixed(4)}`
);
check(
  "an oversized context pushes the estimate over the cap (the gate bites)",
  freeChatMessageEstimatedCostEur(FREE_CHAT_LIMITS.maxMessageChars, 30000) > 0.02,
  `€${freeChatMessageEstimatedCostEur(FREE_CHAT_LIMITS.maxMessageChars, 30000).toFixed(4)}`
);
check(
  "the per-message worst case is bounded by cap + the bounded history window",
  freeChatPerMessageWorstCaseEur() <=
    freeChatMaxCostEur({}) + m.freeChatHistoryWorstCaseEur() + 1e-12,
  `€${freeChatPerMessageWorstCaseEur().toFixed(4)}`
);

console.log("\n== 10. the route gates free grants on BOTH size and estimated cost ==");
const routeSrc = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check("size gate present", /withinFreeSize && withinFreeCost/.test(routeSrc));
check(
  "cost gate compares the message estimate to the cap",
  /freeChatMessageEstimatedCostEur\(\s*message\.length,\s*systemPrompt\.length,\s*pricingConfig,?\s*(freeLimits,?\s*)?\)\s*<=\s*freeChatMaxCostEur\(\)/.test(routeSrc),
  "the gate's shape changed — check api/chat/route.ts"
);
// The gate must price the envelope THIS ACCOUNT will actually run in.
// A grandfathered account keeps an 800-token reply cap; estimating it at
// the published 600 would under-price the message and let it through the
// cap when it should not.
check(
  "…using the ACCOUNT's envelope, not the published constant",
  /freeChatMessageEstimatedCostEur\([\s\S]{0,120}freeLimits/.test(routeSrc) &&
    !/freeChatMessageEstimatedCostEur\([\s\S]{0,120}FREE_CHAT_LIMITS/.test(routeSrc)
);
check(
  "the size gate uses the account's envelope too",
  /message\.length <= freeLimits\.maxMessageChars/.test(routeSrc)
);
check(
  "the client is told when a message was too large to be free",
  /largeMessage: largeMessageReason/.test(routeSrc) && /estimatedCredits: estimate\.estimatedCredits/.test(routeSrc)
);

console.log("\n== 11. the per-plan table (πλάνο | free μηνύματα | worst case | % τιμής) ==");
for (const row of freeChatEconomics()) {
  const share = row.shareOfPrice === null ? "  —  " : `${(row.shareOfPrice * 100).toFixed(1)}%`;
  console.log(
    `   ${row.planSlug.padEnd(13)} | ${String(row.freeMessages).padStart(5)} msgs | €${row.worstCaseCostEur.toFixed(2).padStart(6)} | ${share}`
  );
  check(
    `   ...${row.planSlug} is within its allocated ${FREE_CHAT_TARGET_SHARE * 100}% budget`,
    row.withinBudget === true,
    JSON.stringify(row)
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
