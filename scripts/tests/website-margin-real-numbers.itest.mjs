// The margin, checked against the exact rows production reported.
//
// REPORTED (ai_cost_log, real account):
//   website_generate_precheck  input 1213, output 188
//   website_generate_precheck  input 1083, output  52
//   website_generate           input 6091, output 13624,
//                              cache_write 11557, cache_read 5158
//   charged 45 credits (EUR 0.90); Anthropic dashboard $0.25
//   -> reported margin 3.9x, under the guaranteed 4x.
//
// This file does the arithmetic against the REAL pricing table, the REAL
// CostAccumulator and the REAL settlement formula, then goes looking for
// the ways the guarantee can actually be broken — because the formula
// itself cannot break it:
//
//     credits = ceil(costEur * M / pricePerCredit)
//     margin  = credits * pricePerCredit / costEur
//             >= (costEur * M / price) * price / costEur = M
//
// ceil only ever rounds the charge UP, so any settled row is >= M by
// construction. A sub-4x outcome therefore cannot come from the formula;
// it can only come from a cost that never reached the formula. That is
// what sections 3-5 test.
//
// Run: node scripts/tests/website-margin-real-numbers.itest.mjs
import http from "node:http";

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
function near(name, actual, expected, tol = 1e-9) {
  check(name, Math.abs(actual - expected) < tol, true);
  if (Math.abs(actual - expected) >= tol) console.log(`        (${actual} vs ${expected})`);
}

const { loadTs } = await import("./load-ts.mjs");
const pricing = await loadTs("src/lib/billing/model-pricing.ts");
const { CostAccumulator } = await loadTs("src/lib/billing/cost-accumulator.ts");
const formula = await loadTs("src/lib/billing/credit-formula.ts");
const configMod = await loadTs("src/lib/billing/pricing-config.ts");

const MODEL = "claude-sonnet-4-6";
const config = configMod.resolvePricingConfig();

console.log("== 1. the published price of claude-sonnet-4-6 ==");
// Checked against Anthropic's pricing page: $3 / $15 per MTok, cache
// writes at 1.25x input, cache reads at 0.1x input.
const p = pricing.pricingForModel(MODEL);
check("input  $/MTok", p.inputPerMTok, 3);
check("output $/MTok", p.outputPerMTok, 15);
check("cache write is 1.25x input", p.cacheWritePerMTok, 3.75);
near("cache read is 0.1x input", p.cacheReadPerMTok, 0.3, 1e-12);
check("a web search is billed per query at $10/1000", pricing.WEB_SEARCH_USD_PER_QUERY, 0.01);

console.log("\n== 2. the three rows, priced one at a time ==");
// Step by step, so the number can be checked by hand against the log.
const rows = [
  { name: "precheck #1", input_tokens: 1213, output_tokens: 188 },
  { name: "precheck #2", input_tokens: 1083, output_tokens: 52 },
  {
    name: "generate",
    input_tokens: 6091,
    output_tokens: 13624,
    cache_creation_input_tokens: 11557,
    cache_read_input_tokens: 5158,
  },
];
//   precheck #1  1213/1e6*3  + 188/1e6*15                              = 0.006459
//   precheck #2  1083/1e6*3  +  52/1e6*15                              = 0.004029
//   generate     6091/1e6*3 + 13624/1e6*15
//                + 11557/1e6*3.75 + 5158/1e6*0.3                       = 0.26751915
const EXPECTED = [0.006459, 0.004029, 0.26751915];
rows.forEach((row, i) => {
  const b = pricing.priceUsage(row, MODEL);
  near(`${row.name} costs $${EXPECTED[i]}`, b.usdCost, EXPECTED[i], 1e-12);
});

const totalUsd = EXPECTED.reduce((a, b) => a + b, 0); // 0.27800715
near("all three together cost $0.27800715", totalUsd, 0.27800715, 1e-12);

console.log("\n== 3. every token type reaches the cost, none is dropped ==");
// The reported theory was that cache tokens were being ignored. They are
// not — but the check has to be positive, not a claim: remove each token
// type in turn and confirm the price actually falls.
const gen = rows[2];
const full = pricing.priceUsage(gen, MODEL).usdCost;
for (const [label, field, expectedDelta] of [
  ["input", "input_tokens", (6091 / 1e6) * 3],
  ["output", "output_tokens", (13624 / 1e6) * 15],
  ["cache_write", "cache_creation_input_tokens", (11557 / 1e6) * 3.75],
  ["cache_read", "cache_read_input_tokens", (5158 / 1e6) * 0.3],
]) {
  const without = pricing.priceUsage({ ...gen, [field]: 0 }, MODEL).usdCost;
  near(`${label} contributes $${expectedDelta.toFixed(8)}`, full - without, expectedDelta, 1e-12);
}
// cache_write at 11,557 tokens is $0.0433 — 16% of the whole generation.
// Dropping it silently is worth 0.6x of margin on its own, so it gets a
// named check rather than only the loop above.
near("cache_write alone is $0.04333875", (11557 / 1e6) * 3.75, 0.04333875, 1e-12);

console.log("\n== 4. the accumulator sums all three calls, not just the last ==");
const costs = new CostAccumulator();
costs.record("classification", rows[0], MODEL);
costs.record("classification", rows[1], MODEL);
costs.record("generation", rows[2], MODEL);
const t = costs.totals();
check("three calls counted", costs.callCount, 3);
check("input tokens summed", t.inputTokens, 1213 + 1083 + 6091);
check("output tokens summed", t.outputTokens, 188 + 52 + 13624);
check("cache_write carried through", t.cacheWriteTokens, 11557);
check("cache_read carried through", t.cacheReadTokens, 5158);
near("total cost is the sum of the three", t.usdCost, totalUsd, 1e-12);

console.log("\n== 5. what those rows should have been charged ==");
//   $0.27800715 * 0.92          = EUR 0.2557665...
//   EUR 0.2557665 * 4 / 0.02    = 51.153...  -> ceil -> 52 credits
const eur = t.usdCost * config.usdToEurRate;
near("EUR 0.25576658", eur, 0.27800715 * 0.92, 1e-12);
const credits = formula.creditsForRealCostOnAccount(eur, null, null, config);
check("52 credits on the list rate", credits, 52);
const achieved = formula.achievedMarginOnAccount(credits, eur, null, null, config);
checkTrue(`achieved margin ${achieved.toFixed(4)}x is >= 4`, achieved >= 4);
// Settled per-call instead of as one action it comes to 53 (2 + 1 + 50);
// either way it is above the 45 that was reported, so the 45 did not come
// from these three rows priced by this code at the default FX rate.
const separately = [rows[0], rows[1], rows[2]]
  .map((r) => formula.creditsForRealCostOnAccount(pricing.priceUsage(r, MODEL).usdCost * config.usdToEurRate, null, null, config))
  .reduce((a, b) => a + b, 0);
check("settled as three separate actions it is 53", separately, 53);
checkTrue("both figures exceed the 45 that was reported", credits > 45 && separately > 45);

console.log("\n== 6. the guarantee is structural, not a coincidence of these numbers ==");
// If ceil ever failed to hold the multiplier, this is where it would show.
// Deterministic pseudo-random usages, so a failure is reproducible.
let seed = 20260806;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
let worst = Infinity,
  worstAt = null;
for (let i = 0; i < 20000; i++) {
  const usage = {
    input_tokens: Math.floor(rnd() * 200000),
    output_tokens: Math.floor(rnd() * 128000),
    cache_creation_input_tokens: Math.floor(rnd() * 200000),
    cache_read_input_tokens: Math.floor(rnd() * 1000000),
    server_tool_use: { web_search_requests: Math.floor(rnd() * 4) },
  };
  const costEur = pricing.priceUsage(usage, MODEL).usdCost * config.usdToEurRate;
  if (costEur <= 0) continue;
  const c = formula.creditsForRealCostOnAccount(costEur, null, null, config);
  const m = formula.achievedMarginOnAccount(c, costEur, null, null, config);
  if (m < worst) {
    worst = m;
    worstAt = usage;
  }
}
checkTrue(`worst margin over 20,000 random usages is ${worst.toFixed(6)}x, still >= 4`, worst >= 4);
if (worst < 4) console.log("        at", JSON.stringify(worstAt));

console.log("\n== 7. a discounted plan or credit pack cannot dilute it either ==");
// The multiplier is only real if it divides by what a credit actually
// sold for. These are the cheapest real rates in the product.
for (const [label, plan, pack] of [
  ["list price", null, null],
  ["Ultimate plan", { price: 199, monthlyCredits: 40000 }, null],
  ["EUR 100 / 8,000 pack", null, 100 / 8000],
  ["Ultimate + pack", { price: 199, monthlyCredits: 40000 }, 100 / 8000],
]) {
  const c = formula.creditsForRealCostOnAccount(eur, plan, pack, config);
  const m = formula.achievedMarginOnAccount(c, eur, plan, pack, config);
  checkTrue(`${label}: ${c} credits, ${m.toFixed(4)}x >= 4`, m >= 4);
}

console.log("\n== 8. web searches are billed, and are read off the real stream ==");
// $0.01 per search against a ~$0.25 generation: three searches is 12% of
// the cost. Counting the tokens a search adds but not the search itself
// would put a searching generation under 4x while every unit test on the
// formula still passed — so this is checked end to end, off a real
// streamed response, not by calling priceUsage directly.
const priced = pricing.priceUsage({ ...gen, server_tool_use: { web_search_requests: 3 } }, MODEL);
near("three searches add $0.03", priced.usdCost - full, 0.03, 1e-12);
check("and are reported as 3", priced.webSearches, 3);

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = (e, d) => res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`);
    send("message_start", {
      type: "message_start",
      message: {
        id: "m",
        type: "message",
        role: "assistant",
        model: MODEL,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 6091,
          output_tokens: 1,
          cache_creation_input_tokens: 11557,
          cache_read_input_tokens: 5158,
          server_tool_use: { web_search_requests: 3 },
        },
      },
    });
    send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    send("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: HTML },
    });
    send("content_block_stop", { type: "content_block_stop", index: 0 });
    send("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 13624, server_tool_use: { web_search_requests: 3 } },
    });
    send("message_stop", { type: "message_stop" });
    res.end();
  });
});
const HTML =
  '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8"><title>Bakery</title><style>body{margin:0}</style></head>\n<body><h1>Corner Bakery</h1><p>Fresh bread every morning, baked on site.</p></body>\n</html>';

await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
const { loadTsWithDeps } = await import("./load-ts.mjs");
const wb = await loadTsWithDeps("src/lib/website-builder.ts");
const streamed = new CostAccumulator();
await wb.generateWebsiteHtml("sk-ant-test", "A bakery", undefined, () => {}, undefined, streamed);
const st = streamed.totals();
server.close();
check("the searches survive the stream into the cost log", st.webSearches, 3);
near("and into the money", st.usdCost, full + 0.03, 1e-9);
const searchEur = st.usdCost * config.usdToEurRate;
const searchCredits = formula.creditsForRealCostOnAccount(searchEur, null, null, config);
checkTrue(
  `a searching generation still clears 4x (${formula.achievedMarginOnAccount(searchCredits, searchEur, null, null, config).toFixed(4)}x)`,
  formula.achievedMarginOnAccount(searchCredits, searchEur, null, null, config) >= 4
);

console.log("\n== 9. where 45 credits can actually come from ==");
// 45 is not reachable from these rows at the default rate, on any plan,
// with any credit pack. Solving the formula backwards, it needs
// realCostEur in (0.2200, 0.2250], i.e. an FX rate in (0.7913, 0.8093].
// USD_TO_EUR_RATE=0.80 lands exactly on 45 — 0.79 gives 44, 0.81 gives
// 46 — so the value is pinned, not merely consistent.
const bad = configMod.parsePricingConfig({ USD_TO_EUR_RATE: "0.80" });
const at80 = { ...config, usdToEurRate: 0.8 };
check(
  "at a rate of 0.80 the formula charges exactly the 45 that was reported",
  formula.creditsForRealCostOnAccount(totalUsd * 0.8, null, null, at80),
  45
);
check("0.79 gives 44", formula.creditsForRealCostOnAccount(totalUsd * 0.79, null, null, at80), 44);
check("0.81 gives 46", formula.creditsForRealCostOnAccount(totalUsd * 0.81, null, null, at80), 46);
// And the damage is invisible from the settled row: the stored margin is
// measured against the same understated euros, so it still reads >= 4x
// while the real margin against the dollars we paid is 3.5x.
const fakeMargin = formula.achievedMarginOnAccount(45, totalUsd * 0.8, null, null, at80);
checkTrue(`the row would still claim ${fakeMargin.toFixed(3)}x`, fakeMargin >= 4);
const realMargin = (45 * config.creditPriceEur) / (totalUsd * 0.92);
checkTrue(`while the real margin was ${realMargin.toFixed(3)}x`, realMargin < 4);

console.log("\n== 10. so the FX rate now has a floor, like the multiplier already did ==");
// CREDIT_MARGIN_MULTIPLIER has had a floor of 4 since it shipped, for
// precisely this reason. USD_TO_EUR_RATE sat in front of it with no floor
// at all, which let a single env var undo the guarantee the floor exists
// to provide.
check("0.80 is rejected", bad.config.usdToEurRate, configMod.DEFAULTS.usdToEurRate);
check("and it says why", bad.warnings.length, 1);
check("naming the variable", bad.warnings[0].variable, "USD_TO_EUR_RATE");
checkTrue("and the consequence", /margin/i.test(bad.warnings[0].reason));
for (const [value, expected] of [
  ["0.5", configMod.DEFAULTS.usdToEurRate],
  ["0.84", configMod.DEFAULTS.usdToEurRate],
  ["0.85", 0.85],
  ["0.92", 0.92],
  ["1.05", 1.05],
  ["9", configMod.DEFAULTS.usdToEurRate],
]) {
  check(`USD_TO_EUR_RATE=${value}`, configMod.parsePricingConfig({ USD_TO_EUR_RATE: value }).config.usdToEurRate, expected);
}
// The floor is a floor, not a clamp: a rejected value falls back to the
// default so the misconfiguration shows up in the logs instead of quietly
// half-working.
check("rejection is a fallback, not a clamp to the floor", configMod.parsePricingConfig({ USD_TO_EUR_RATE: "0.5" }).config.usdToEurRate, 0.92);
// Any rate the floor still admits has to keep the real guarantee.
for (const rate of [0.85, 0.9, 0.92, 1.0, 1.5]) {
  const c = formula.creditsForRealCostOnAccount(totalUsd * rate, null, null, { ...config, usdToEurRate: rate });
  checkTrue(`rate ${rate}: ${c} credits still clears 4x on the real cost`, (c * config.creditPriceEur) / (totalUsd * rate) >= 4);
}
check("the multiplier floor is unchanged", configMod.parsePricingConfig({ CREDIT_MARGIN_MULTIPLIER: "2" }).config.marginMultiplier, 4);

console.log("\n== 11. the only remaining margin leak: work we pay for and never bill ==");
// A generation that fails releases the hold and charges nothing, which is
// right for the user and is 0x for us. That — not the formula — is what
// turns AI spend into loss, and it is exactly what the max_tokens /
// pause_turn failure was doing on every cut-off generation.
const lostEur = totalUsd * config.usdToEurRate;
check("a released reservation charges nothing", formula.creditsForRealCostOnAccount(0, null, null, config), 0);
checkTrue(
  `so one failed generation is EUR ${lostEur.toFixed(4)} of pure loss`,
  lostEur > 0.25
);
// The guard against it is that a cut-off generation now recovers instead
// of being thrown away — see website-continuation.test.mjs.
const { readFileSync } = await import("node:fs");
const src = readFileSync("src/lib/website-builder.ts", "utf8");
checkTrue("pause_turn is handled rather than treated as success", /stopReason === "pause_turn"/.test(src));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
