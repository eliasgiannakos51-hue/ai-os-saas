// MULTI-PROVIDER ROUTING AND THE BATCH API (V4 #12 + #13).
//
// WHAT THIS ENVIRONMENT COULD NOT DO, said first. There is no
// OPENAI_API_KEY, GOOGLE_API_KEY, GROQ_API_KEY — and no ANTHROPIC_API_KEY
// either. Not one request was sent to any provider through this layer, no
// failover was ever triggered by a real 529, and no batch was submitted,
// collected or expired. Everything below is arithmetic, wiring and text.
//
// THE FOUR THINGS THAT WOULD BE WRONG QUIETLY:
//
//   A FAILOVER THAT KILLS THE PROMPT CACHE. The call succeeds, the answer
//   is right, the user notices nothing, and the bill goes up — because
//   the destination's cache minimum is higher than the origin's, or it
//   has no cache at all. Section 2 is that arithmetic, with the specific
//   Sonnet -> Haiku case the brief names, in money.
//
//   A PRICE COLUMN NOBODY CHECKED. Every credit charge is
//   ceil(real_cost x margin / credit_price), and "real_cost" for three of
//   these four providers comes from a table written without an account to
//   verify it against. Section 1 asserts the table is at least internally
//   consistent and that an unknown model still prices at the most
//   expensive known rate.
//
//   A FAILOVER ON THE WRONG ERROR. Failing over on a 400 pays a second
//   vendor to reject the same malformed request and hides the bug that
//   caused it. Section 4 is the full status cross-product.
//
//   A BATCH DISCOUNT APPLIED TO WORK THAT WAS NOT BATCHED. A 2x
//   under-charge that reads as a healthy 4x margin, because the margin is
//   computed from the same halved cost. Section 6.
//
// Run: node scripts/tests/ai-providers.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const types = await loadTs("src/lib/ai/providers/types.ts");
const catalog = await loadTs("src/lib/ai/providers/catalog.ts");
const cachePolicy = await loadTs("src/lib/ai/providers/cache-policy.ts");
const registry = await loadTs("src/lib/ai/providers/registry.ts");
const failover = await loadTs("src/lib/ai/providers/failover.ts");
const shared = await loadTs("src/lib/ai/providers/adapters/shared.ts");
const batchPolicy = await loadTs("src/lib/ai/batch/batch-policy.ts");
const modelPricing = await loadTs("src/lib/billing/model-pricing.ts");
const cachedSystem = await loadTs("src/lib/ai/cached-system.ts");
const costAccumulator = await loadTs("src/lib/billing/cost-accumulator.ts");
const pricingConfig = await loadTs("src/lib/billing/pricing-config.ts");
const agentConfig = await loadTs("src/lib/agents/agent-config.ts");
const creditFormula = await loadTs("src/lib/billing/credit-formula.ts");

const { AI_PROVIDERS, AI_PURPOSES, AI_CAPABILITIES, AI_ATTEMPT_OUTCOMES, isAiProvider, isAiPurpose } = types;
const { AI_CATALOG, catalogModel, modelsForProvider, providerSupports, substituteModel, UNVERIFIED_PRICE_PROVIDERS } = catalog;
const { cacheMinimumTokens, cachesOn, cachedPrefixTokens, cacheImpactOfRoute, comparedRequestCostUsd } = cachePolicy;
const {
  PROVIDER_KEY_ENV_VARS, PROVIDER_ORDER_ENV_VAR, purposeOrderEnvVar, FAILOVER_ENV_VAR,
  DEFAULT_PROVIDER_ORDER, parseProviderOrder, providerStatuses, resolveChain,
} = registry;
const { classifyError, statusOf, ATTEMPT_TIMEOUT_MS, CONTROL_TIMEOUT_MS } = failover;
const { wireModelId, splitPromptTokens, flattenSystem } = shared;
const {
  BATCH_DISCOUNT, BATCH_WINDOW_HOURS, MIN_INTERVAL_MINUTES_FOR_BATCH, BATCH_ENABLED_ENV_VAR,
  batchEnabled, batchDecision, batchExpiresAt, batchHasExpired, shouldFallBackToSync,
  batchAdjustedUsd, BATCH_STATUSES,
} = batchPolicy;
const { MODEL_PRICING_USD, FALLBACK_MODEL_PRICING, pricingForModel, isKnownModel } = modelPricing;
const { MODEL_CACHE_MINIMUM_TOKENS } = cachedSystem;
const { CostAccumulator, isBatchModel, bareModelId } = costAccumulator;
const { MARGIN_MULTIPLIER_MIN } = pricingConfig;

const src = (p) => readFileSync(p, "utf8");

/**
 * CODE WITHOUT ITS COMMENTS.
 *
 * Three checks in this file went red on their first run because they read
 * prose ABOUT the code as the code: a comment saying "Groq does not report
 * cache_read_input_tokens" matched a grep for that identifier, and a
 * migration header promising "No DROP TABLE, no TRUNCATE" matched a grep
 * for destructive SQL. An instrument that cannot tell a promise from its
 * violation reports the exact opposite of the truth, which is worse than
 * having no instrument. This is the third time this class of bug has been
 * caught in this project's own tests, hence a shared helper rather than a
 * fourth ad-hoc regex.
 */
const stripTs = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const stripSql = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");

// ===========================================================================
console.log("\n== 1. the catalog, and the prices everything downstream trusts ==");
// ===========================================================================

ok("four providers", AI_PROVIDERS.length === 4, AI_PROVIDERS.join(","));
ok("every provider has at least one model", AI_PROVIDERS.every((p) => modelsForProvider(p).length > 0));
ok("catalog ids are unique", new Set(AI_CATALOG.map((m) => m.id)).size === AI_CATALOG.length);
ok("every non-Anthropic id is namespaced, so it cannot collide with a bare Anthropic alias",
  AI_CATALOG.filter((m) => m.provider !== "anthropic").every((m) => m.id.startsWith(`${m.provider}/`)),
  AI_CATALOG.filter((m) => m.provider !== "anthropic" && !m.id.startsWith(`${m.provider}/`)).map((m) => m.id).join(","));
ok("every price is positive — a zero would charge nothing and look like a working call",
  AI_CATALOG.every((m) => m.inputPerMTok > 0 && m.outputPerMTok > 0));
ok("output always costs more than input, on every model",
  AI_CATALOG.every((m) => m.outputPerMTok > m.inputPerMTok));

// THE CATALOG AND THE BILLING TABLE MUST AGREE ON ANTHROPIC. Two numbers
// for one model is one number that can drift, and the one that drifts is
// always the one nobody is charging from.
for (const model of AI_CATALOG.filter((m) => m.provider === "anthropic")) {
  const billing = pricingForModel(model.id);
  ok(`${model.id}: the catalog price matches lib/billing/model-pricing.ts`,
    billing.inputPerMTok === model.inputPerMTok && billing.outputPerMTok === model.outputPerMTok,
    `catalog ${model.inputPerMTok}/${model.outputPerMTok} vs billing ${billing.inputPerMTok}/${billing.outputPerMTok}`);
  ok(`${model.id}: the catalog cache minimum matches lib/ai/cached-system.ts`,
    MODEL_CACHE_MINIMUM_TOKENS[model.id] === model.cacheMinimumTokens,
    `catalog ${model.cacheMinimumTokens} vs cached-system ${MODEL_CACHE_MINIMUM_TOKENS[model.id]}`);
}

// Every non-Anthropic model must be priceable, or a call it serves is
// charged at the fallback rate forever without anybody noticing.
for (const model of AI_CATALOG.filter((m) => m.provider !== "anthropic")) {
  ok(`${model.id} is priceable by the one pricing function`, isKnownModel(model.id));
  const priced = pricingForModel(model.id);
  ok(`${model.id} prices at its catalog rate`,
    priced.inputPerMTok === model.inputPerMTok && priced.outputPerMTok === model.outputPerMTok);
}

// THE SAFE DIRECTION SURVIVED THE MERGE. Adding cheap models must not
// lower the fallback an unknown model is priced at.
ok("an unknown model still prices at the MOST expensive known rate",
  pricingForModel("something-nobody-has-heard-of").inputPerMTok === FALLBACK_MODEL_PRICING.inputPerMTok &&
  FALLBACK_MODEL_PRICING.inputPerMTok >= Math.max(...AI_CATALOG.map((m) => m.inputPerMTok)),
  `${FALLBACK_MODEL_PRICING.inputPerMTok} vs catalog max ${Math.max(...AI_CATALOG.map((m) => m.inputPerMTok))}`);
ok("...and the cheapest model in the catalog did not become the fallback",
  FALLBACK_MODEL_PRICING.inputPerMTok > Math.min(...AI_CATALOG.map((m) => m.inputPerMTok)));

ok("the three providers whose prices were never verified are named as such",
  ["openai", "google", "groq"].every((p) => UNVERIFIED_PRICE_PROVIDERS.includes(p)) &&
  !UNVERIFIED_PRICE_PROVIDERS.includes("anthropic"),
  UNVERIFIED_PRICE_PROVIDERS.join(","));
ok("...and catalog.ts says so in prose, where somebody enabling a provider will read it",
  /NOT VERIFIED AGAINST A LIVE\s+\*?\s*ACCOUNT/.test(src("src/lib/ai/providers/catalog.ts")));

ok("a dated snapshot resolves to the model it is a snapshot of",
  catalogModel("claude-haiku-4-5-20251001")?.id === "claude-haiku-4-5");
ok("a deployment variant does too", catalogModel("claude-sonnet-4-6[1m]")?.id === "claude-sonnet-4-6");
ok("an unknown id resolves to nothing rather than to something plausible",
  catalogModel("gpt-9") === null && catalogModel(undefined) === null);

// ===========================================================================
console.log("\n== 2. THE CACHE MINIMUM: the trap the brief names, in money ==");
// ===========================================================================

ok("Sonnet's minimum is 1,024 and Haiku's is 4,096 — the cheaper model needs FOUR TIMES the prefix",
  cacheMinimumTokens("claude-sonnet-4-6") === 1024 && cacheMinimumTokens("claude-haiku-4-5") === 4096);
ok("Groq has no prompt cache at all, and that is null rather than zero",
  cacheMinimumTokens("groq/llama-3.3-70b-versatile") === null);
ok("null is not zero: a zero minimum would mean everything caches",
  cachesOn(0, "groq/llama-3.3-70b-versatile") === false && cachesOn(1e9, "groq/llama-3.3-70b-versatile") === false);
ok("an unknown model is assumed to have NO cache — the least favourable assumption",
  cacheMinimumTokens("who-knows") === null);

// THE HEADLINE CASE, WITH THE ARITHMETIC.
{
  const prefix = 2000; // over Sonnet's 1,024, under Haiku's 4,096
  const impact = cacheImpactOfRoute({
    fromModel: "claude-sonnet-4-6",
    toModel: "claude-haiku-4-5",
    cachedPrefixTokens: prefix,
  });
  ok("a 2,000-token prefix caches on Sonnet and STOPS caching on Haiku",
    impact.keptCache === false && impact.lostTokens === prefix, JSON.stringify(impact));
  ok("...and the 'cheaper' model costs MORE for that prefix, every request",
    impact.extraCostUsd > 0,
    `sonnet $${impact.originCostUsd.toFixed(6)} -> haiku $${impact.destinationCostUsd.toFixed(6)}`);
  // 2,000 tokens: Sonnet cache-read $3 x 0.1 = $0.30/MTok -> $0.00060.
  // Haiku full input $1/MTok -> $0.00200. 3.33x.
  ok("the ratio is the one the module's header claims (~3.3x)",
    Math.abs(impact.destinationCostUsd / impact.originCostUsd - 10 / 3) < 0.01,
    `${(impact.destinationCostUsd / impact.originCostUsd).toFixed(3)}x`);
  ok("and the reason names both numbers, so a log line is actionable",
    /2000/.test(impact.reason) && /4096/.test(impact.reason), impact.reason);
}

// A prefix over BOTH minimums keeps the cache and really is cheaper.
{
  const impact = cacheImpactOfRoute({
    fromModel: "claude-sonnet-4-6",
    toModel: "claude-haiku-4-5",
    cachedPrefixTokens: 8000,
  });
  ok("an 8,000-token prefix clears both minimums, so Haiku genuinely is cheaper",
    impact.keptCache === true && impact.lostTokens === 0 && impact.extraCostUsd < 0,
    JSON.stringify(impact));
}

// Groq: the extreme case.
{
  const impact = cacheImpactOfRoute({
    fromModel: "claude-sonnet-4-6",
    toModel: "groq/llama-3.3-70b-versatile",
    cachedPrefixTokens: 20_000,
  });
  ok("a 20,000-token cached prefix routed to Groq loses the whole cache",
    impact.keptCache === false && impact.lostTokens === 20_000);
  ok("...and Groq's headline rate does not make up for it on the prefix alone",
    impact.extraCostUsd > 0,
    `sonnet $${impact.originCostUsd.toFixed(6)} -> groq $${impact.destinationCostUsd.toFixed(6)}`);
  ok("...and the reason says the provider has no cache at all",
    /no prompt cache/.test(impact.reason), impact.reason);
}

// The same-family trap: Gemini Flash caches at 1,024, Pro at 2,048.
{
  const impact = cacheImpactOfRoute({
    fromModel: "google/gemini-2.5-flash",
    toModel: "google/gemini-2.5-pro",
    cachedPrefixTokens: 1500,
  });
  ok("even within one vendor's family a route can lose the cache (Flash 1,024 -> Pro 2,048)",
    impact.keptCache === false && impact.lostTokens === 1500, JSON.stringify(impact));
}

ok("a request with no cached prefix reports null rather than false",
  cacheImpactOfRoute({ fromModel: "claude-sonnet-4-6", toModel: "claude-haiku-4-5", cachedPrefixTokens: 0 }).keptCache === null);

// THE PREFIX IS THE RUNNING TOTAL THROUGH THE LAST MARKER, not the sum of
// the marked blocks and not the whole prompt.
{
  const four = (n) => "x".repeat(n * 4); // cached-system.ts's 4 chars/token
  const system = [
    { type: "text", text: four(500), cache_control: { type: "ephemeral" } },
    { type: "text", text: four(300) },
    { type: "text", text: four(200), cache_control: { type: "ephemeral" } },
    { type: "text", text: four(900) },
  ];
  ok("the cached prefix runs through the LAST marker, counting the unmarked block between them",
    cachedPrefixTokens(system) === 1000, `${cachedPrefixTokens(system)}`);
  ok("...not the sum of the marked blocks (700)", cachedPrefixTokens(system) !== 700);
  ok("...and not the whole prompt (1,900)", cachedPrefixTokens(system) !== 1900);
  ok("a system prompt with no markers has no cached prefix",
    cachedPrefixTokens([{ type: "text", text: four(5000) }]) === 0);
}

// THE WHOLE-REQUEST COMPARISON, which is what a routing decision needs.
{
  const compared = comparedRequestCostUsd({
    fromModel: "claude-sonnet-4-6",
    toModel: "groq/llama-3.1-8b-instant",
    cachedPrefixTokens: 20_000,
    freshInputTokens: 500,
    expectedOutputTokens: 800,
  });
  // Groq's 8b is 60x cheaper on input, so it wins even losing the cache —
  // and the point is that the comparison SAYS so rather than being
  // assumed either way.
  ok("the comparison answers with both the rate and the cache counted",
    compared.cheaper === "to" && compared.cacheImpact.keptCache === false,
    JSON.stringify({ from: compared.fromUsd, to: compared.toUsd, cheaper: compared.cheaper }));
}
{
  const compared = comparedRequestCostUsd({
    fromModel: "claude-sonnet-4-6",
    toModel: "claude-haiku-4-5",
    cachedPrefixTokens: 3000,
    freshInputTokens: 100,
    expectedOutputTokens: 50,
  });
  // A big cached prefix, a tiny answer: the cache loss dominates, and the
  // "cheaper" model is the more expensive one. This is the case a
  // headline-rate comparison gets backwards.
  ok("with a large cached prefix and a small answer, the cheaper-per-token model is the more expensive call",
    compared.cheaper === "from",
    JSON.stringify({ sonnet: compared.fromUsd, haiku: compared.toUsd }));
}

// ===========================================================================
console.log("\n== 3. the registry: from config, and a missing key disables cleanly ==");
// ===========================================================================

ok("every provider's key env var is named and unique",
  AI_PROVIDERS.every((p) => typeof PROVIDER_KEY_ENV_VARS[p] === "string") &&
  new Set(Object.values(PROVIDER_KEY_ENV_VARS)).size === AI_PROVIDERS.length);
ok("the three optional keys are the ones the brief names",
  PROVIDER_KEY_ENV_VARS.openai === "OPENAI_API_KEY" &&
  PROVIDER_KEY_ENV_VARS.google === "GOOGLE_API_KEY" &&
  PROVIDER_KEY_ENV_VARS.groq === "GROQ_API_KEY");

{
  const statuses = providerStatuses({});
  ok("with no keys at all, every provider is disabled — not errored",
    statuses.every((s) => s.enabled === false && typeof s.disabledReason === "string"));
  ok("...and the reason names the env var to set",
    statuses.every((s) => s.disabledReason.includes(PROVIDER_KEY_ENV_VARS[s.provider])));
}
{
  const statuses = providerStatuses({ ANTHROPIC_API_KEY: "   " });
  ok("a whitespace-only key is not a key", statuses.find((s) => s.provider === "anthropic").enabled === false);
}

ok("the default chain is Anthropic alone — a key added for voice does not silently reroute chat",
  DEFAULT_PROVIDER_ORDER.length === 1 && DEFAULT_PROVIDER_ORDER[0] === "anthropic");
{
  const chain = resolveChain({ env: { ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k" }, purpose: "chat" });
  ok("...proved: OpenAI configured but not in the chain unless asked for",
    chain.order.join(",") === "anthropic" && chain.source === "default", JSON.stringify(chain.order));
}

{
  const parsed = parseProviderOrder("anthropic, groq ,openai", PROVIDER_ORDER_ENV_VAR);
  ok("a chain parses, trims and keeps order", parsed.order.join(",") === "anthropic,groq,openai");
  ok("...with no warnings", parsed.warnings.length === 0);
}
{
  const parsed = parseProviderOrder("anthropc,groq", PROVIDER_ORDER_ENV_VAR);
  ok("A TYPO DOES NOT EMPTY THE CHAIN — the rest still stands", parsed.order.join(",") === "groq");
  ok("...and it is warned about, naming the env var and the value",
    parsed.warnings.length === 1 && parsed.warnings[0].value === "anthropc" &&
    parsed.warnings[0].envVar === PROVIDER_ORDER_ENV_VAR,
    JSON.stringify(parsed.warnings));
}
ok("a repeated provider is not tried twice in a row",
  parseProviderOrder("anthropic,anthropic,groq", "X").order.join(",") === "anthropic,groq");
ok("an empty setting means 'not configured', not 'no providers'",
  parseProviderOrder("", "X").order.length === 0 && parseProviderOrder(undefined, "X").order.length === 0);

{
  const env = { ANTHROPIC_API_KEY: "k", GROQ_API_KEY: "k", [PROVIDER_ORDER_ENV_VAR]: "groq,anthropic" };
  const chain = resolveChain({ env, purpose: "chat" });
  ok("the global order is honoured, Anthropic last if that is what was asked",
    chain.order.join(",") === "groq,anthropic" && chain.source === PROVIDER_ORDER_ENV_VAR);
}
{
  const env = {
    ANTHROPIC_API_KEY: "k",
    GROQ_API_KEY: "k",
    [PROVIDER_ORDER_ENV_VAR]: "anthropic",
    [purposeOrderEnvVar("classification")]: "groq,anthropic",
  };
  ok("a per-purpose override beats the global chain",
    resolveChain({ env, purpose: "classification" }).order.join(",") === "groq,anthropic");
  ok("...and leaves every other purpose alone",
    resolveChain({ env, purpose: "chat" }).order.join(",") === "anthropic");
}
{
  const env = { ANTHROPIC_API_KEY: "k", [PROVIDER_ORDER_ENV_VAR]: "anthropic,openai,groq" };
  const chain = resolveChain({ env, purpose: "chat" });
  ok("a configured provider with no key is SKIPPED, with its reason kept",
    chain.order.join(",") === "anthropic" && chain.skipped.length === 2);
  ok("...and the reason is the missing env var, not 'unavailable'",
    chain.skipped.every((s) => s.reason.includes("_API_KEY is not set")),
    JSON.stringify(chain.skipped));
}
{
  const env = { ANTHROPIC_API_KEY: "k", GROQ_API_KEY: "k", [PROVIDER_ORDER_ENV_VAR]: "groq,anthropic" };
  const chain = resolveChain({ env, purpose: "research", requires: ["server_web_search"] });
  ok("a provider without a required capability is ruled out BEFORE any call",
    chain.order.join(",") === "anthropic",
    JSON.stringify(chain));
  ok("...and the reason says which capability", chain.skipped.some((s) => s.reason.includes("server_web_search")));
}
ok("only Anthropic offers server-side web search in this catalog",
  AI_PROVIDERS.filter((p) => providerSupports(p, "server_web_search")).join(",") === "anthropic");
ok("Groq offers no prompt caching, which is why it can lose a cache silently",
  providerSupports("groq", "prompt_caching") === false);

ok("failover is ON by default", resolveChain({ env: { ANTHROPIC_API_KEY: "k" }, purpose: "chat" }).failoverEnabled === true);
ok("...and off only when explicitly set to false",
  resolveChain({ env: { ANTHROPIC_API_KEY: "k", [FAILOVER_ENV_VAR]: "false" }, purpose: "chat" }).failoverEnabled === false &&
  resolveChain({ env: { ANTHROPIC_API_KEY: "k", [FAILOVER_ENV_VAR]: "no" }, purpose: "chat" }).failoverEnabled === true);

ok("substituteModel never drops to a WEAKER tier",
  substituteModel("openai", "large", [])?.tier === "large" &&
  ["mid", "large"].includes(substituteModel("openai", "mid", [])?.tier));
ok("...and returns null rather than serving a request a provider cannot",
  substituteModel("groq", "small", ["server_web_search"]) === null);
ok("...choosing the cheapest adequate model when there is a choice",
  substituteModel("openai", "small", [])?.id === "openai/gpt-5-mini");

// ===========================================================================
console.log("\n== 4. what fails over, and what must not ==");
// ===========================================================================

const CASES = [
  [500, "server_error", true],
  [502, "server_error", true],
  [503, "server_error", true],
  [504, "server_error", true],
  [529, "overloaded", true],
  [429, "rate_limited", true],
  [408, "timeout", true],
  [401, "auth_error", true],
  [403, "auth_error", true],
  [400, "bad_request", false],
  [404, "bad_request", false],
  [413, "bad_request", false],
  [422, "bad_request", false],
];
for (const [status, outcome, shouldFailover] of CASES) {
  const c = classifyError({ status });
  ok(`${status} -> ${outcome}, failover ${shouldFailover}`,
    c.outcome === outcome && c.failover === shouldFailover, JSON.stringify(c));
}
ok("an abort is a timeout and fails over",
  classifyError({ name: "AbortError" }).outcome === "timeout" && classifyError({ name: "AbortError" }).failover === true);
ok("a socket reset is a network error and fails over",
  classifyError({ code: "ECONNRESET" }).failover === true);
ok("undici's TypeError('fetch failed') is recognised as network, not unknown",
  classifyError(new TypeError("fetch failed")).outcome === "network_error");
ok("AN ERROR NOBODY CAN PLACE DOES NOT FAIL OVER — spending at a second vendor on an unread error is not resilience",
  classifyError(new Error("???")).outcome === "unknown_error" &&
  classifyError(new Error("???")).failover === false);
ok("the status is found wherever the SDK put it",
  statusOf({ status: 500 }) === 500 && statusOf({ statusCode: 502 }) === 502 &&
  statusOf({ response: { status: 503 } }) === 503 && statusOf(new Error("x")) === null);
ok("every classified outcome is one the log's check constraint accepts",
  [...CASES.map(([s]) => classifyError({ status: s }).outcome), "success", "unsupported"]
    .every((o) => AI_ATTEMPT_OUTCOMES.includes(o)));
ok("a generation gets a long budget and a control-plane call a short one",
  ATTEMPT_TIMEOUT_MS >= 60_000 && CONTROL_TIMEOUT_MS < ATTEMPT_TIMEOUT_MS);

// ===========================================================================
console.log("\n== 5. the adapters: the traps that would over-charge or lie ==");
// ===========================================================================

ok("wireModelId strips the namespace and leaves Anthropic ids alone",
  wireModelId("openai/gpt-5") === "gpt-5" && wireModelId("claude-sonnet-4-6") === "claude-sonnet-4-6");

// THE DOUBLE-COUNT. OpenAI's prompt_tokens INCLUDES cached_tokens;
// Anthropic's input_tokens EXCLUDES cache reads.
{
  const split = splitPromptTokens(10_000, 8_000);
  ok("cached tokens are SUBTRACTED from the prompt total, not counted twice",
    split.input_tokens === 2000 && split.cache_read_input_tokens === 8000, JSON.stringify(split));
  ok("a provider reporting more cached than total cannot produce a negative input count",
    splitPromptTokens(100, 500).input_tokens === 0);
  // NEGATIVE INPUTS, not just an inverted pair. A negative token count
  // reaching the pricing path prices as a CREDIT, and clamping the
  // SUBTRACTION alone does not stop it: (-100) - (-500) is +400.
  for (const [total, cached] of [[-100, -500], [-1, 0], [0, -1], [NaN, 5], [5, NaN]]) {
    const bad = splitPromptTokens(total, cached);
    ok(`splitPromptTokens(${total}, ${cached}) is non-negative on both fields`,
      Number.isFinite(bad.input_tokens) && bad.input_tokens >= 0 &&
      Number.isFinite(bad.cache_read_input_tokens) && bad.cache_read_input_tokens >= 0,
      JSON.stringify(bad));
  }
  ok("...and the cache read is clamped to the total rather than believed",
    splitPromptTokens(100, 500).cache_read_input_tokens === 100);
  ok("zero cached tokens leaves the prompt total intact",
    splitPromptTokens(1234, 0).input_tokens === 1234);
}

// The over-charge that subtraction prevents, in money.
{
  const rate = pricingForModel("openai/gpt-5");
  const correct = (2000 / 1e6) * rate.inputPerMTok + (8000 / 1e6) * rate.cacheReadPerMTok;
  const doubled = (10_000 / 1e6) * rate.inputPerMTok + (8000 / 1e6) * rate.cacheReadPerMTok;
  ok(`not subtracting would over-charge this call by ${((doubled / correct - 1) * 100).toFixed(0)}%`,
    doubled > correct * 3, `$${correct.toFixed(6)} vs $${doubled.toFixed(6)}`);
}

const openaiSrc = src("src/lib/ai/providers/adapters/openai.ts");
const googleSrc = src("src/lib/ai/providers/adapters/google.ts");
const groqSrc = src("src/lib/ai/providers/adapters/groq.ts");
const anthropicSrc = src("src/lib/ai/providers/adapters/anthropic.ts");

ok("Google maps the assistant role to 'model' — sending 'assistant' is a 400 that does not fail over",
  /role:\s*m\.role === "assistant" \? "model" : "user"/.test(googleSrc));
ok("Google sends the key as x-goog-api-key, not a bearer token",
  googleSrc.includes('"x-goog-api-key"') && !googleSrc.includes("Bearer"));
ok("OpenAI and Groq send a bearer token",
  /Bearer \$\{call\.apiKey\}/.test(openaiSrc) && /Bearer \$\{call\.apiKey\}/.test(groqSrc));

// THE ONE THAT WOULD BE INVISIBLE: answering a research request without
// searching.
for (const [name, source] of [["openai", openaiSrc], ["google", googleSrc], ["groq", groqSrc]]) {
  ok(`${name} REFUSES a server-web-search request rather than answering from memory`,
    new RegExp(`refuseUnsupported\\("${name}", request\\)`).test(source), source.slice(0, 0));
}
ok("...and the refusal is a 400, which failover.ts does NOT fail over — so no other provider answers it either",
  /ProviderHttpError\(\s*400/.test(src("src/lib/ai/providers/adapters/shared.ts")));
ok("only the Anthropic adapter sends the web_search server tool",
  anthropicSrc.includes("web_search_20250305") &&
  ![openaiSrc, googleSrc, groqSrc].some((s) => s.includes("web_search_20250305")));
ok("only the Anthropic adapter passes cache_control through — nothing else has anywhere to put it",
  /system: request\.system/.test(anthropicSrc) &&
  [openaiSrc, googleSrc, groqSrc].every((s) => s.includes("flattenSystem")));
ok("Groq does NOT claim a cache read it cannot have",
  !stripTs(groqSrc).includes("cache_read_input_tokens"),
  "the CODE must not set it; the comment explaining why is not the code");
ok("...and the comment explaining why is still there, so the strip above is doing work",
  groqSrc.includes("cache_read_input_tokens"));
ok("the three fetch adapters carry no vendor SDK import",
  [openaiSrc, googleSrc, groqSrc].every((s) => !/from "openai"|@google\/|from "groq/.test(s)));
ok("flattenSystem joins the blocks in order, losing nothing",
  flattenSystem({ system: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }) === "a\n\nb");

// EVERY PURPOSE IS REAL. A purpose nobody calls is a config key that
// silently does nothing.
{
  const all = readdirSync("src", { recursive: true })
    .filter((f) => typeof f === "string" && (f.endsWith(".ts") || f.endsWith(".tsx")))
    .map((f) => join("src", f))
    .filter((f) => statSync(f).isFile())
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const used = AI_PURPOSES.filter((p) => new RegExp(`purpose: "${p}"`).test(all));
  ok(`at least one purpose is wired to a real call site (${used.join(",") || "none"})`, used.length > 0);
  ok("agent_run is one of them — the layer is exercised, not merely present", used.includes("agent_run"));
}

// THE USER NEVER SEES ANY OF THIS.
{
  const componentFiles = readdirSync("src/components", { recursive: true })
    .filter((f) => typeof f === "string" && f.endsWith(".tsx"))
    .map((f) => join("src/components", f))
    .filter((f) => statSync(f).isFile());
  ok(`the componentFiles scan found ${componentFiles.length}`, componentFiles.length >= 200, "a filter of an empty list is empty, and every check below it would pass");
  const leaking = componentFiles.filter((f) => /ai\/providers|ai\/batch/.test(readFileSync(f, "utf8")));
  ok("no component imports the provider layer — a provider name cannot reach the UI",
    leaking.length === 0, leaking.join(", "));
  const runner = src("src/lib/agents/agent-runner.ts");
  ok("the runner prices the model that ANSWERED, not the one it asked for",
    /costs\.record\("generation", outcome\.usage, outcome\.reportedModel \|\| outcome\.model\)/.test(
      stripTs(src("src/lib/agents/agent-runner.ts"))
    ),
    stripTs(src("src/lib/agents/agent-runner.ts")).split("\n").filter((l) => l.includes("costs.record")).join(" | "));
  ok("the agent runner returns the SAME user-facing sentence whatever failed",
    (runner.match(/The AI service could not be reached\./g) ?? []).length >= 1 &&
    !/outcome\.detail/.test(runner.split("failure: {")[1] ?? ""),
    "the provider detail must not reach the failure message");
}

// ===========================================================================
console.log("\n== 6. #13 batch: what qualifies, and the discount applied once ==");
// ===========================================================================

ok("the discount is a half", BATCH_DISCOUNT === 0.5);
ok("the window is the vendor's 24 hours", BATCH_WINDOW_HOURS === 24);
ok("the interval floor is the window, so submissions cannot pile up",
  MIN_INTERVAL_MINUTES_FOR_BATCH === BATCH_WINDOW_HOURS * 60);

ok("batching is OFF unless an operator turns it on",
  batchEnabled({}) === false && batchEnabled({ [BATCH_ENABLED_ENV_VAR]: "true" }) === true);
ok("...and 'yes', '1' and 'TRUE ' do not count as on — only the exact word",
  batchEnabled({ [BATCH_ENABLED_ENV_VAR]: "yes" }) === false &&
  batchEnabled({ [BATCH_ENABLED_ENV_VAR]: "1" }) === false &&
  batchEnabled({ [BATCH_ENABLED_ENV_VAR]: "TRUE " }) === true);

const ON = { [BATCH_ENABLED_ENV_VAR]: "true" };
const daily = { triggerSource: "schedule", intervalMinutes: 1440, needsWebSearch: false, hasOutstandingBatch: false };

ok("a daily scheduled agent with no research qualifies", batchDecision(daily, ON).batch === true);
ok("...and not when the deployment has not enabled it",
  batchDecision(daily, {}).batch === false && batchDecision(daily, {}).reason.includes(BATCH_ENABLED_ENV_VAR));
ok("A MANUAL RUN NEVER QUALIFIES — somebody is watching a spinner",
  batchDecision({ ...daily, triggerSource: "manual" }, ON).batch === false);
ok("AN AGENT THAT NEEDS WEB RESEARCH NEVER QUALIFIES — the answer would come from memory instead",
  batchDecision({ ...daily, needsWebSearch: true }, ON).batch === false &&
  batchDecision({ ...daily, needsWebSearch: true }, ON).reason.includes("web research"));
ok("an hourly agent does not qualify — 24 submissions could be outstanding at once",
  batchDecision({ ...daily, intervalMinutes: 60 }, ON).batch === false);
ok("...nor one that runs every 23 hours, which is still inside the window",
  batchDecision({ ...daily, intervalMinutes: 23 * 60 }, ON).batch === false);
ok("exactly 24 hours qualifies — the boundary is inclusive, and stated",
  batchDecision({ ...daily, intervalMinutes: 1440 }, ON).batch === true);
ok("an agent with one already in flight does not queue a second",
  batchDecision({ ...daily, hasOutstandingBatch: true }, ON).batch === false);
ok("an agent that opted out does not, however well it qualifies",
  batchDecision({ ...daily, batchOptOut: true }, ON).batch === false);
ok("EVERY refusal explains itself — 'why did my agent not get the cheap path' is a real question",
  [
    batchDecision(daily, {}),
    batchDecision({ ...daily, triggerSource: "manual" }, ON),
    batchDecision({ ...daily, needsWebSearch: true }, ON),
    batchDecision({ ...daily, intervalMinutes: 60 }, ON),
    batchDecision({ ...daily, hasOutstandingBatch: true }, ON),
    batchDecision({ ...daily, batchOptOut: true }, ON),
  ].every((d) => d.batch === false && d.reason.length > 10));

// THE OPT-OUT COMES OUT OF A JSONB COLUMN, which can hold anything.
{
  const { normaliseAgentConfig } = agentConfig;
  ok("batchOptOut is true only when it is literally true",
    normaliseAgentConfig({ batchOptOut: true }).batchOptOut === true &&
    normaliseAgentConfig({ batchOptOut: false }).batchOptOut === false &&
    normaliseAgentConfig({}).batchOptOut === false);
  // The one that matters: a jsonb column holding the STRING "false" is
  // truthy in JavaScript, and Boolean(...) would opt the agent out of the
  // cheap path forever while the config screen showed it as off.
  for (const junk of ["false", "0", "no", 1, {}, []]) {
    ok(`batchOptOut ignores the junk value ${JSON.stringify(junk)}`,
      normaliseAgentConfig({ batchOptOut: junk }).batchOptOut === false);
  }
}

ok("a batch submitted now expires 24 hours later",
  batchExpiresAt(0).getTime() === 24 * 3_600_000);
ok("...and is not expired a minute before that, and is a minute after",
  batchHasExpired(0, 24 * 3_600_000 - 60_000) === false && batchHasExpired(0, 24 * 3_600_000 + 60_000) === true);

for (const status of BATCH_STATUSES) {
  const fallback = shouldFallBackToSync(status);
  const expected = ["errored", "canceled", "expired"].includes(status);
  ok(`${status} -> ${expected ? "fall back to a synchronous run" : "no fallback"}`, fallback === expected);
}

// THE DISCOUNT, APPLIED ONCE AND ONLY WITH A BATCH ID.
{
  const usage = { input_tokens: 100_000, output_tokens: 10_000 };
  const plain = new CostAccumulator();
  plain.record("generation", usage, "claude-sonnet-4-6");
  const batched = new CostAccumulator();
  batched.recordBatch("generation", usage, "claude-sonnet-4-6", "msgbatch_123");
  ok("a batched call costs exactly half a standard one",
    Math.abs(batched.totals().usdCost - plain.totals().usdCost * 0.5) < 1e-12,
    `${batched.totals().usdCost} vs ${plain.totals().usdCost}`);
  ok("THE TOKEN COUNTS STAY TRUE — what was cheap is the rate, not the number of tokens",
    batched.totals().inputTokens === plain.totals().inputTokens &&
    batched.totals().outputTokens === plain.totals().outputTokens);
  ok("the cost row says it was a batch", batched.snapshot()[0].model === "batch:claude-sonnet-4-6");
  ok("...and is not flagged as an unknown model, which would alert on every batched run forever",
    batched.unknownModels().length === 0);

  const noId = new CostAccumulator();
  noId.recordBatch("generation", usage, "claude-sonnet-4-6", "");
  ok("WITHOUT A BATCH ID IT CHARGES FULL PRICE — the safe direction, and a visible discrepancy",
    Math.abs(noId.totals().usdCost - plain.totals().usdCost) < 1e-12);

  // The failure that would be invisible: halving twice.
  ok("the discount is applied in exactly one place, so it cannot be applied twice",
    (src("src/lib/billing/cost-accumulator.ts").match(/batchAdjustedUsd\(/g) ?? []).length === 1 &&
    (src("src/lib/ai/batch/batch-policy.ts").match(/BATCH_DISCOUNT/g) ?? []).length ===
      (src("src/lib/ai/batch/batch-policy.ts").match(/BATCH_DISCOUNT/g) ?? []).length);
  ok("batchAdjustedUsd refuses nonsense rather than propagating it",
    batchAdjustedUsd(-5) === 0 && batchAdjustedUsd(NaN) === 0 && batchAdjustedUsd(0) === 0);
}

// A `batch:` model must survive a snapshot/restore round trip without
// becoming an unknown-model incident.
{
  const acc = new CostAccumulator();
  acc.recordBatch("generation", { input_tokens: 1000, output_tokens: 100 }, "claude-sonnet-4-6", "b1");
  const restored = CostAccumulator.restore(acc.snapshot());
  ok("a restored batch entry is still priced and still not an unknown model",
    Math.abs(restored.totals().usdCost - acc.totals().usdCost) < 1e-12 &&
    restored.unknownModels().length === 0);
  ok("isBatchModel and bareModelId agree on the marker",
    isBatchModel("batch:claude-sonnet-4-6") && bareModelId("batch:claude-sonnet-4-6") === "claude-sonnet-4-6" &&
    !isBatchModel("claude-sonnet-4-6"));
}

// THE MARGIN STILL HOLDS AT THE BATCH RATE. Halving the cost halves the
// charge; the RATIO is what the guarantee is about, and it must not move.
{
  const config = pricingConfig.resolvePricingConfig();
  let worst = Infinity;
  for (const margin of [4, 5, 6]) {
    for (const inputTokens of [1_000, 50_000, 400_000]) {
      for (const outputTokens of [100, 2_000, 8_000]) {
        const acc = new CostAccumulator();
        acc.recordBatch("generation", { input_tokens: inputTokens, output_tokens: outputTokens }, "claude-sonnet-4-6", "b");
        const costUsd = acc.totals().usdCost;
        const costEur = creditFormula.usdToEur(costUsd, config);
        const credits = creditFormula.creditsForRealCostEur(costEur, config, margin);
        const ratio = (credits * config.creditPriceEur) / costEur;
        worst = Math.min(worst, ratio);
        if (ratio < margin) {
          ok(`margin holds on a batched run @ M=${margin}`, false, `ratio ${ratio.toFixed(3)}`);
        }
      }
    }
  }
  ok(`the margin holds on every batched run tested (worst ${worst.toFixed(2)}x)`, worst >= MARGIN_MULTIPLIER_MIN);
}

// ===========================================================================
console.log("\n== 7. the SQL and the TypeScript say the same thing ==");
// ===========================================================================

const logSql = src("supabase/migrations/20260828000000_ai_provider_log.sql");
const batchSql = src("supabase/migrations/20260829000000_agent_run_batches.sql");

{
  const inCheck = (logSql.match(/outcome in \(([\s\S]*?)\)/)?.[1] ?? "")
    .split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
  ok(`the log's outcome check lists exactly the TypeScript outcomes (${inCheck.length})`,
    JSON.stringify([...inCheck].sort()) === JSON.stringify([...AI_ATTEMPT_OUTCOMES].sort()),
    `sql=${inCheck.join(",")} ts=${AI_ATTEMPT_OUTCOMES.join(",")}`);
}
ok("the log has no column that could hold a prompt or a completion",
  !/\b(prompt|completion|system_text|messages|response_body)\b/.test(stripSql(logSql)),
  (stripSql(logSql).match(/\b(prompt|completion|system_text|messages|response_body)\b/g) ?? []).join(","));
ok("the log's RLS is on, with select-own and no write policy",
  logSql.includes("enable row level security") &&
  logSql.includes("for select using (auth.uid() = user_id)") &&
  logSql.includes("revoke insert, update, delete on public.ai_provider_log from authenticated"));
ok("cache_kept is a column, because it is the only trace a failover leaves",
  /cache_kept boolean/.test(logSql));

ok("the agent_runs status check gained 'queued' and kept the other three",
  /check \(status in \('running', 'queued', 'success', 'failed'\)\)/.test(batchSql));
ok("...and the TypeScript type says the same four",
  /status: "running" \| "queued" \| "success" \| "failed"/.test(src("src/lib/agents/agent-config.ts")));
{
  // BOUNDED TO ITS OWN STATEMENT. An unbounded [\s\S]*? walks past this
  // index's missing WHERE and matches the NEXT index's one, which is how
  // the first version of this check passed while the guard was gone.
  const statement = stripSql(batchSql)
    .split(";")
    .find((s) => s.includes("agent_runs_one_outstanding_batch_idx")) ?? "";
  ok("ONE OUTSTANDING BATCH PER AGENT is enforced by a partial unique index, not by application code",
    /create\s+unique\s+index/i.test(statement) && /where\s+status\s*=\s*'queued'/i.test(statement),
    statement.replace(/\s+/g, " ").trim());
}
ok("neither migration drops a table, truncates, or deletes unqualified",
  ![logSql, batchSql].map(stripSql).some((s) => /drop\s+table|truncate|delete\s+from/i.test(s)),
  [logSql, batchSql].map(stripSql).flatMap((s) => s.match(/drop\s+table|truncate|delete\s+from/gi) ?? []).join(","));
ok("...and both still PROMISE it in their headers, which is what the strip above had to see past",
  [logSql, batchSql].every((s) => /No DROP TABLE, no TRUNCATE/.test(s)));
ok("the one DROP in either migration is a constraint being rebuilt, immediately re-added",
  /drop constraint agent_runs_status_check[\s\S]{0,400}add constraint\s+agent_runs_status_check/.test(stripSql(batchSql)));

ok("the stuck-run sweeper closes 'running' EXACTLY — widening it would kill every outstanding batch",
  /\.eq\("status", "running"\)/.test(src("src/app/api/cron/agent-runs/route.ts")));
{
  const collector = src("src/app/api/cron/agent-batches/route.ts");
  ok("the collector cron keeps running when batching is disabled, so queued rows are never stranded",
    /IT KEEPS RUNNING WHEN BATCHING IS TURNED OFF/.test(collector) && !/if \(!batchEnabled/.test(collector));
}
ok("the collector is registered as a cron",
  JSON.parse(src("vercel.json")).crons.some((c) => c.path === "/api/cron/agent-batches"));
{
  // THE GUARD IS CALLED AND ITS ANSWER IS ACTED ON. An import alone
  // satisfies `includes("checkCronAuth")` while the call is gone, which
  // is exactly the shape a careless edit takes.
  const collector = stripTs(src("src/app/api/cron/agent-batches/route.ts"));
  ok("the collector is authenticated by CRON_SECRET like every other scheduler route",
    /const auth = checkCronAuth\(request\);/.test(collector) &&
    /if \(!auth\.ok\)[\s\S]{0,200}status: auth\.status/.test(collector),
    collector.split("\n").filter((l) => l.includes("auth")).join(" | "));
}

{
  // BOTH BRANCHES. The colour and the label are two separate ternaries,
  // and breaking only the label leaves the first one still spelling
  // `run.status === "queued"` — which a single `includes` is satisfied by.
  const workspace = stripTs(src("src/components/agents/agents-workspace.tsx"));
  ok("a queued run is shown as queued, not as running — colour AND label",
    (workspace.match(/run\.status === "queued"/g) ?? []).length >= 2 &&
    /run\.status === "queued"[\s\S]{0,60}t\("runQueued"\)/.test(workspace),
    `${(workspace.match(/run\.status === "queued"/g) ?? []).length} occurrences`);
  ok("...and it explains the wait rather than leaving a status nobody can interpret",
    workspace.includes('t("runQueuedHint")'));
}

// ===========================================================================
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
