// Model coverage (V3 model tiers).
//
// THE RULE THIS ENFORCES: a model change and its price change happen in
// the same commit. If a model string is used anywhere in src/ without an
// entry in MODEL_PRICING_USD, the margin system prices it at the
// most-expensive-known fallback — which protects margin but overcharges
// users — and nobody notices, because achieved_margin still LOOKS right.
// So an unpriced model is a build failure, not a runtime surprise.
//
// It also pins the two Fable-shaped hazards: settlement must price the
// model the RESPONSE names (safety routing can serve a request from a
// different model than requested), and no call site may configure
// temperature or a thinking budget (Fable rejects both).
//
// Run: node scripts/tests/model-coverage.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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
  if (!cond && detail) console.log(`        ${detail}`);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const { loadTs } = await import("./load-ts.mjs");
const models = await loadTs("src/lib/ai/models.ts");
const pricing = await loadTs("src/lib/billing/model-pricing.ts");

console.log("== 1. every model string used in src/ is priced ==");
const files = walk("src");
const used = new Set();
for (const f of files) {
  const src = stripComments(readFileSync(f, "utf8"));
  for (const m of src.matchAll(/"(claude-[a-z0-9.-]+)"/g)) used.add(m[1]);
}
checkTrue(`model strings found in src (${[...used].join(", ")})`, used.size >= 4);
for (const id of used) {
  checkTrue(`${id} has a pricing entry`, id in pricing.MODEL_PRICING_USD);
}

console.log("\n== 2. the four tier defaults are priced, with sane prices ==");
const tiers = {
  max: models.DEFAULT_MODEL_MAX,
  premium: models.DEFAULT_MODEL_PREMIUM,
  standard: models.DEFAULT_MODEL_STANDARD,
  fast: models.DEFAULT_MODEL_FAST,
};
for (const [tier, id] of Object.entries(tiers)) {
  const p = pricing.MODEL_PRICING_USD[id];
  checkTrue(`${tier} (${id}) is priced`, Boolean(p));
  if (p) {
    checkTrue(`  ${id}: output >= input (every Claude model prices this way)`, p.outputPerMTok >= p.inputPerMTok);
    checkTrue(`  ${id}: cache write is 1.25x input`, Math.abs(p.cacheWritePerMTok - p.inputPerMTok * 1.25) < 1e-9);
    checkTrue(`  ${id}: cache read is 0.1x input`, Math.abs(p.cacheReadPerMTok - p.inputPerMTok * 0.1) < 1e-9);
  }
}
// The tiers must actually be ordered by price, or "escalate to MAX" is
// an accidental discount.
const price = (id) => pricing.MODEL_PRICING_USD[id]?.outputPerMTok ?? 0;
checkTrue("max >= premium >= standard >= fast, by price",
  price(tiers.max) >= price(tiers.premium) &&
  price(tiers.premium) >= price(tiers.standard) &&
  price(tiers.standard) > price(tiers.fast));
// Fable's refusal fallback target must be priced even though no code
// requests it — the RESPONSE names it.
checkTrue("claude-opus-4-8 (Fable's fallback target) is priced", "claude-opus-4-8" in pricing.MODEL_PRICING_USD);
// The pricing file must carry its verification date, so the next update
// has a baseline to argue with.
checkTrue("pricing file records its verification date",
  /verified against Anthropic'?s published/i.test(readFileSync("src/lib/billing/model-pricing.ts", "utf8")));

console.log("\n== 3. env overrides resolve, defaults hold ==");
check("default max", models.modelForTier("max", {}), models.DEFAULT_MODEL_MAX);
check("override wins", models.modelForTier("max", { ANTHROPIC_MODEL_MAX: "claude-opus-5" }), "claude-opus-5");
check("blank override falls back", models.modelForTier("fast", { ANTHROPIC_MODEL_FAST: "  " }), models.DEFAULT_MODEL_FAST);

console.log("\n== 4. the complexity rule ==");
const web = (d, i) => models.selectWebsiteBuilderModel({ descriptionChars: d, imageCount: i }).tier;
check("a short brief runs premium", web(300, 0), "premium");
check("at the char threshold it is still premium", web(2500, 0), "premium");
check("past the char threshold it runs max", web(2501, 0), "max");
check("two images stay premium", web(300, 2), "premium");
check("three images run max", web(300, 3), "max");
const mission = (g) => models.selectMissionPlannerModel({ goalChars: g }).tier;
check("a short goal plans on premium", mission(80), "premium");
check("a long goal plans on max", mission(601), "max");

console.log("\n== 5. settlement prices what RAN, not what was asked ==");
// Every costs.record / params.costs.record call must derive its model
// from the response (response.model ?? FALLBACK). Under Fable's safety
// routing a response can come from another model; pricing the requested
// constant charges the wrong rate invisibly.
for (const f of files) {
  const src = stripComments(readFileSync(f, "utf8"));
  const calls = [...src.matchAll(/costs\??\.record\(\s*("[^"]+"|\w+)\s*,\s*([^,]+),\s*([^)]+)\)/g)];
  for (const call of calls) {
    const modelArg = call[3].trim();
    checkTrue(
      `${f.replace(/\\/g, "/")}: record(..., ${modelArg.slice(0, 50)}) reads the response`,
      /\.model\s*\?\?/.test(modelArg),
      "pass response.model ?? <requested>, never the requested constant alone"
    );
  }
}

console.log("\n== 6. no call site fights Fable's API surface ==");
// temperature and thinking budgets are rejected by the MAX/PREMIUM
// models; a call site that adds one turns a working feature into a 400.
for (const f of files) {
  const src = stripComments(readFileSync(f, "utf8"));
  if (/anthropic\.messages\.(create|stream)/.test(src) || /\.messages\.stream\(/.test(src)) {
    checkTrue(`${f.replace(/\\/g, "/")}: no temperature`, !/temperature\s*:/.test(src));
    checkTrue(`${f.replace(/\\/g, "/")}: no thinking budget`, !/budget_tokens/.test(src));
  }
}

console.log("\n== 7. the MAX call sites handle refusal ==");
// Fable can decline with stop_reason "refusal" (HTTP 200). The features
// that run on MAX must fall back rather than fail: research wraps every
// call, the mission planner and website generator retry on premium.
const research = readFileSync("src/lib/research/research.ts", "utf8");
checkTrue("research wraps its calls in the refusal fallback", /createWithRefusalFallback/.test(research));
const missions = readFileSync("src/lib/mission-agents.ts", "utf8");
checkTrue("the mission planner retries on refusal", /stop_reason === "refusal"/.test(missions));
const builder = readFileSync("src/lib/website-builder.ts", "utf8");
checkTrue("the website generator retries on refusal", /stopReason === "refusal"/.test(builder));

console.log(
  fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`
);
process.exit(fail === 0 ? 0 : 1);
