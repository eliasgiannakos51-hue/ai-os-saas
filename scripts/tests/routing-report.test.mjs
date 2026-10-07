// THE ROUTER SECTION OF /dashboard/costs ADDS UP, AND ONLY THE OWNER SEES IT
// (BUILD-SPECS 2.13 Ζ, scenarios 10 and 11; QUEUE E.2).
//
// Scenario 11, "the admin page shows correct sums": every figure below was
// worked out by hand from the fixture rows, written as a literal, and
// compared — not recomputed with the function under test.
//
// Scenario 10, "no model name or dollar cost reaches the user's browser",
// in the part E.2 adds: the section that prints model names and dollar
// prices is rendered from one page, after that page's owner check, and
// is not a client component that could be imported anywhere else.
//
// Run: node scripts/tests/routing-report.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const near = (a, b) => Math.abs(a - b) < 1e-9;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const rr = await loadTs("src/lib/billing/routing-report.ts");

// Four rows. EUR = USD × 0.9 on every row, so per-model EUR is easy to
// check by hand.
const ROWS = [
  {
    // A chat on Sonnet: 1M input, 0 output → $3.00 on Sonnet, $1.00 on Haiku.
    feature: "chat_message",
    real_cost_usd: 3, real_cost_eur: 2.7, credits_charged: 540,
    input_tokens: 1_000_000, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0,
    metadata: {
      revenuePerCreditEur: 0.02,
      routing: { category: "chat", tier: "simple", bumped: false, model: "claude-haiku-4-5" },
      modelBreakdown: { "claude-sonnet-4-6": { inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0, webSearches: 0, usdCost: 3, calls: 1 } },
    },
  },
  {
    // A research run: Sonnet tokens $1.50 plus 5 searches $0.05 → $1.55.
    // Shadow is Sonnet too, so its projection equals what it cost.
    feature: "deep_research",
    real_cost_usd: 1.55, real_cost_eur: 1.395, credits_charged: 280,
    input_tokens: 500_000, output_tokens: 0, cache_read_tokens: 500_000, cache_write_tokens: 0,
    metadata: {
      routing: { category: "research", tier: "expert", bumped: true, model: "claude-sonnet-4-6" },
      modelBreakdown: { "claude-sonnet-4-6": { inputTokens: 500_000, outputTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 0, webSearches: 5, usdCost: 1.55, calls: 3 } },
    },
  },
  {
    // An admin's free action: costs money, charges nothing, no decision
    // (settled before the shadow existed).
    feature: "chat_message",
    real_cost_usd: 1, real_cost_eur: 0.9, credits_charged: 0,
    input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0,
    metadata: { bypassCharge: true },
  },
  {
    // Voice: an external service, no routing, priced by the minute.
    feature: "voice",
    real_cost_usd: 0.5, real_cost_eur: 0.45, credits_charged: 90,
    input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0,
    metadata: { modelBreakdown: { "openai:whisper-1": { inputTokens: 0, outputTokens: 0, usdCost: 0.5, calls: 1 } } },
  },
];
const ATTEMPTS = [
  { request_id: "a", attempt_index: 0, outcome: "success" },
  { request_id: "b", attempt_index: 0, outcome: "overloaded" },
  { request_id: "b", attempt_index: 1, outcome: "success" },
  { request_id: "c", attempt_index: 0, outcome: "timeout" },
  { request_id: "c", attempt_index: 1, outcome: "timeout" },
  { request_id: "d", attempt_index: 0, outcome: "success" },
];

const r = rr.buildRoutingReport(ROWS, ATTEMPTS);

// =====================================================================
console.log("\n== 1. SCENARIO 11: THE SUMS, AGAINST HAND-WORKED FIGURES ==");
// =====================================================================
ok("4 requests", r.requests === 4, String(r.requests));
// 2.7 + 1.395 + 0.9 + 0.45 = 5.445
ok("total cost €5.445", near(r.costEur, 5.445), String(r.costEur));
// 5.445 / 4 = 1.36125
ok("average per request €1.36125", near(r.avgCostPerRequestEur, 1.36125), String(r.avgCostPerRequestEur));
// (540 + 280 + 0 + 90) × 0.02 = 18.20
ok("revenue €18.20 from 910 credits at €0.02", near(r.revenueEur, 18.2), String(r.revenueEur));
// 18.2 / 5.445
ok("margin = revenue / cost", near(r.margin, 18.2 / 5.445), String(r.margin));
const feat = Object.fromEntries(r.byFeature.map((b) => [b.key, b]));
ok("chat_message: 2 requests, €3.60, €1.80 each", feat.chat_message.requests === 2 && near(feat.chat_message.costEur, 3.6) && near(feat.chat_message.avgEur, 1.8), JSON.stringify(feat.chat_message));
ok("the feature buckets add up to the total", near(r.byFeature.reduce((s, b) => s + b.costEur, 0), r.costEur));
const tier = Object.fromEntries(r.byTier.map((b) => [b.key, b]));
ok("by tier: simple €2.70, expert €1.395", near(tier.simple.costEur, 2.7) && near(tier.expert.costEur, 1.395), JSON.stringify(r.byTier));
ok("two rows carry no decision", r.unclassified === 2, String(r.unclassified));
ok("tier shares are over the decided rows: 50% / 50%", r.tierShare.every((t) => near(t.share, 0.5)), JSON.stringify(r.tierShare));
ok("one of two decided rows was raised for doubt: 50%", near(r.bumpedShare, 0.5), String(r.bumpedShare));
const model = Object.fromEntries(r.byModel.map((b) => [b.key, b]));
// Sonnet: 2.7 + 1.395; whisper 0.45; the bypass row recorded no models.
ok("by model: Sonnet €4.095, Whisper €0.45, unrecorded €0.90", near(model["claude-sonnet-4-6"].costEur, 4.095) && near(model["openai:whisper-1"].costEur, 0.45) && near(model.unrecorded.costEur, 0.9), JSON.stringify(r.byModel));
ok("the model buckets add up to the total", near(r.byModel.reduce((s, b) => s + b.costEur, 0), r.costEur));
// prompt tokens: 1,000,000 + (500,000 + 500,000) = 2,000,000; reads 500,000
ok("cached prompt tokens 25%", near(r.cachedTokenShare, 0.25), String(r.cachedTokenShare));
// requests a, b, c, d; b answered on its second attempt; c never answered
ok("fallback answered 1 of 4 requests: 25%", near(r.fallbackShare, 0.25), String(r.fallbackShare));

// =====================================================================
console.log("\n== 2. WHAT IS NOT MEASURED SAYS SO ==");
// =====================================================================
ok("escalation is null, not 0: nothing escalates yet", r.escalatedShare === null);
ok("an unreadable provider log is null, not 0%", rr.buildRoutingReport(ROWS, null).fallbackShare === null);
const empty = rr.buildRoutingReport([], []);
ok("an empty period has no average and no margin", empty.avgCostPerRequestEur === null && empty.margin === null && empty.requests === 0);

// =====================================================================
console.log("\n== 3. THE SHADOW PROJECTION ==");
// =====================================================================
// Row 1: 1M Sonnet input repriced at Haiku = $1.00 → €0.90.
// Row 2: Sonnet → Sonnet, tokens $1.50 + searches $0.05 = $1.55 → €1.395.
// Voice: has a decision? No (no routing) → not projected. Bypass: no breakdown.
ok("two rows projected", r.shadow.rows === 2, String(r.shadow.rows));
ok("projected €2.295 (0.90 + 1.395)", near(r.shadow.projectedCostEur, 2.295), String(r.shadow.projectedCostEur));
ok("against €4.095 actually spent on those rows", near(r.shadow.actualCostEur, 4.095), String(r.shadow.actualCostEur));

// =====================================================================
console.log("\n== 4. SCENARIO 10: ONLY THE OWNER'S PAGE RENDERS IT ==");
// =====================================================================
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk("src");
ok("the scan read the source tree", files.length >= 500, String(files.length));
const importers = files.filter((f) => /from "@\/components\/costs\/router-report"/.test(readFileSync(f, "utf8")));
ok("router-report is imported by the costs page and nothing else", importers.length === 1 && importers[0] === "src/app/dashboard/costs/page.tsx", importers.join(", "));
const component = readFileSync("src/components/costs/router-report.tsx", "utf8");
ok("it is a server component (no \"use client\")", !/^\s*["']use client["']/m.test(component));
const page = stripComments(readFileSync("src/app/dashboard/costs/page.tsx", "utf8"));
const gate = page.search(/if \(!isAdminEmail\(user\.email\)\) notFound\(\);/);
const firstAdminRead = page.search(/createAdminClient\(\)/);
const reportRender = page.search(/<RouterReport/);
ok("the page refuses everyone but the owner", gate > 0);
ok("...before it opens the admin client", gate > 0 && firstAdminRead > gate, `gate ${gate}, admin ${firstAdminRead}`);
ok("...and before it renders the router section", gate > 0 && reportRender > gate);
ok("the ai_cost_log read is bounded", /\.limit\(ROUTER_ROW_CAP\)/.test(page));
ok("a hit cap is said, not hidden", /truncatedAt=\{routerRows\.length >= ROUTER_ROW_CAP \? ROUTER_ROW_CAP : null\}/.test(page));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
