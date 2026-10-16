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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

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
console.log("== 0b. THE ROUTING RULES CARRY NO PATH TO A VENDOR PACKAGE ==");
// ===========================================================================
//
// WHAT THIS BUYS, and it is not tidiness. scripts/tests/load-ts.mjs
// refuses to load a module whose import graph reaches a node_modules
// package — deliberately, because "a silent stub would be a lie". So
// the moment runCompletion's graph contains one, EVERY gate that loads
// a module which calls runCompletion stops being able to load it, and
// that is most of them. It happened (ΛΘ-17): the first call site to
// move onto the router took its own suite down with it, through the
// Anthropic SDK in the adapter and the Supabase client in the provider
// log.
//
// Both are now imported where they are used rather than at the top, so
// a reader of the rules never reaches either. This check walks the
// graph instead of naming those two files, because the next one will
// be added by somebody who has not read this comment.
{
  const resolveLocal = (spec) => {
    if (!spec.startsWith("@/")) return null;
    const base = `src/${spec.slice(2)}`;
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (existsSync(candidate)) return candidate;
    }
    return null;
  };
  // The same three exemptions load-ts.mjs makes: a side-effect marker
  // package, and anything from node:.
  const MARKER_ONLY = new Set(["server-only", "client-only"]);
  const walked = new Set();
  /** Every import the walk read, so the offender list below has a
   *  population to be empty OF. A walk that resolved nothing finds no
   *  packages and would otherwise pass. */
  const imports = [];
  const queue = ["src/lib/ai/providers/complete.ts"];
  while (queue.length > 0) {
    const file = queue.pop();
    if (walked.has(file) || !existsSync(file)) continue;
    walked.add(file);
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      const sideEffect = /^import\s+["']([^"']+)["'];?$/.exec(trimmed);
      if (sideEffect) {
        const spec = sideEffect[1];
        imports.push({ file, spec });
        continue;
      }
      const from = /^(?:import|export)\s.*from\s+["']([^"']+)["'];?$/.exec(trimmed);
      if (!from) continue;
      const spec = from[1];
      imports.push({ file, spec });
      if (spec.startsWith("@/")) {
        const local = resolveLocal(spec);
        if (local) queue.push(local);
      }
    }
  }
  // A FLOOR ON THE WALK. "no offenders" is also what a walk that
  // resolved nothing prints, and it prints it green.
  ok(`the router's graph was walked (${walked.size} modules, ${imports.length} imports)`,
    walked.size >= 8 && imports.length >= 18,
    "a walk that stopped at the first file would find no packages and pass on nothing");
  const isVendor = ({ spec }) =>
    !MARKER_ONLY.has(spec) && !spec.startsWith("@/") && !spec.startsWith(".") && !spec.startsWith("node:");
  ok("the vendor detector says yes to a package", isVendor({ spec: "@anthropic-ai/sdk" }));
  // A REAL LOCAL PATH IN THE FIXTURE, not a made-up one:
  // gate-import-paths.test.mjs requires every `@/` path written into a
  // gate to resolve, and a fixture is not exempt from that.
  ok("...and no to a local module, a node builtin and a marker",
    !isVendor({ spec: "@/lib/ai/providers/types" }) &&
      !isVendor({ spec: "node:crypto" }) &&
      !isVendor({ spec: "server-only" }));
  const offenders = imports.filter(isVendor).map(({ file, spec }) => `${file} -> ${spec}`);
  ok("the graph reaches no vendor package", offenders.length === 0,
    offenders.join("\n        ") + "\n        Import it where it is used, as complete.ts's ADAPTERS and provider-log.ts do.");
  // AND THE POSITIVE HALF, because "no bare specifier" is a proxy for
  // the thing that matters: can a build gate actually load this?
  const loaded = await loadTs("src/lib/ai/providers/complete.ts");
  ok("...so a gate can load runCompletion itself", typeof loaded.runCompletion === "function");
}

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

// ===========================================================================
// HOW MUCH OF THE PRODUCT ACTUALLY GOES THROUGH THE ROUTER — PRINTED,
// NOT GATED.
//
// ΛΘ-2 says "a router that does not run, and a page that says it does",
// and half of it is fixed: the router runs. The other half is this
// number, and until now nothing produced it, so every statement about it
// was somebody's recollection. The owner was told "about half" more than
// once; it is not half.
//
// REPORTED, NOT GATED, and the reason is the same one mutation-coverage
// gives: a ratio with a ratchet on it buys a number that only ever goes
// up by one, and what is wanted here is the list of what is left. Three
// of the remaining call sites cannot move until AiRequest can carry a
// stream and an image — see the breakdown this prints.
//
// WHERE IT IS VISIBLE, said exactly: when this file is run on its own
// (`node scripts/tests/ai-providers.test.mjs`). `npm run gates` runs it
// too, but folds a green gate's whole output into one `ok` line, so the
// number does not appear there — the same is true of
// mutation-coverage's ratio, and saying otherwise would be one more
// claim a reader could follow to nothing.
{
  const tsFiles = readdirSync("src", { recursive: true })
    .filter((f) => typeof f === "string" && (f.endsWith(".ts") || f.endsWith(".tsx")))
    .map((f) => join("src", f))
    .filter((f) => statSync(f).isFile() && !f.includes("providers/adapters"));
  ok(`the tree was walked (${tsFiles.length} files)`, tsFiles.length >= 400,
    "an empty walk would print 0 of 0 and read as perfect coverage");

  let direct = 0;
  let routed = 0;
  const blockedBy = { stream: new Set(), image: new Set() };
  const directFiles = [];
  for (const f of tsFiles) {
    const text = stripComments(readFileSync(f, "utf8"));
    const here = (text.match(/\.messages\.(?:create|stream)\(/g) ?? []).length;
    const through = (text.match(/\brunCompletion\(/g) ?? []).length;
    routed += through;
    if (here === 0) continue;
    direct += here;
    directFiles.push(f);
    if (/\.messages\.stream\(|stream:\s*true/.test(text)) blockedBy.stream.add(f);
    if (/type:\s*"(?:image|document)"/.test(text)) blockedBy.image.add(f);
  }
  const total = direct + routed;
  const pct = total === 0 ? 0 : Math.round((routed / total) * 1000) / 10;
  console.log(`        ROUTER COVERAGE: ${routed} of ${total} model call sites = ${pct}%   (${directFiles.length} files still call the SDK directly)`);
  console.log(`        of those files, ${blockedBy.stream.size} need streaming and ${blockedBy.image.size} need an image or a PDF in a message — neither is expressible in AiRequest today`);
  ok(`the scan sees both sides (${routed} routed, ${direct} direct)`, routed > 0 && direct > 0,
    "a scan that saw one side only would print a ratio of 0% or 100% and mean nothing either way");
}

// THE USER NEVER SEES ANY OF THIS.
{
  const componentFiles = readdirSync("src/components", { recursive: true })
    .filter((f) => typeof f === "string" && f.endsWith(".tsx"))
    .map((f) => join("src/components", f))
    .filter((f) => statSync(f).isFile());
  ok(`the componentFiles scan found ${componentFiles.length}`, componentFiles.length >= 200, "a filter of an empty list is empty, and every check below it would pass");
  // COMMENTS ARE NOT IMPORTS, and this line read them as such. The check
  // is about a component IMPORTING the provider layer — that is how a
  // provider name would reach a rendered string — and it matched the raw
  // file, so a component whose header PROSE explained where a number came
  // from ("lib/ai/providers/registry.ts computes disabledReason...")
  // failed a check about imports. Stripping first makes the assertion the
  // one the sentence beside it claims.
  //
  // It is also strictly stronger in the direction that matters: the
  // pattern now has to appear in code, so a comment can no longer satisfy
  // it either — a file could previously have been "clean" of an import
  // and dirty of a mention, and this could not tell the two apart in
  // either direction.
  const leaking = componentFiles.filter((f) =>
    /ai\/providers|ai\/batch/.test(stripComments(readFileSync(f, "utf8")))
  );
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
// ===========================================================================
console.log("\n== 5c. \"IT RAN OUT OF ROOM\" MEANS THE SAME THING FROM ALL FOUR ==");
// ===========================================================================
//
// WHAT WAS WRONG, and it was live before any call site migrated.
// lib/verification/truncation.ts decides `truncated` by comparing the
// stop reason to Anthropic's "max_tokens", and the three fetch adapters
// handed their provider's own word straight on: OpenAI and Groq report
// finish_reason "length", Gemini reports finishReason "MAX_TOKENS". So
// an answer cut off at the ceiling by any provider but Anthropic came
// back truncated: false — delivered whole, unmarked, reading as a short
// answer. lib/agents/agent-runner.ts already routes, so this was
// reachable the day a second key was set.
//
// DRIVEN, like §5b: each adapter is called with a stubbed fetch that
// replies with that vendor's own truncation word, and the stopReason it
// RETURNS is asserted.
{
  const { normaliseStopReason } = await loadTs("src/lib/ai/providers/adapters/shared.ts");
  const { AI_TRUNCATED_STOP_REASON } = await loadTs("src/lib/ai/providers/types.ts");
  ok(`the canonical word is Anthropic's ("${AI_TRUNCATED_STOP_REASON}")`, AI_TRUNCATED_STOP_REASON === "max_tokens");
  const truncation = await loadTs("src/lib/verification/truncation.ts");
  ok("...and lib/verification/truncation.ts uses that same one, not a copy",
    truncation.TRUNCATION_STOP_REASON === AI_TRUNCATED_STOP_REASON);
  for (const word of ["length", "MAX_TOKENS", "max_tokens"]) {
    ok(`"${word}" normalises to the canonical word`, normaliseStopReason(word) === AI_TRUNCATED_STOP_REASON);
  }
  // NOT EVERYTHING, which is the half that makes the above mean
  // something: a normaliser that answered "max_tokens" to every input
  // would pass all three lines above and mark every answer truncated.
  for (const word of ["stop", "STOP", "tool_calls", "end_turn", "content_filter"]) {
    ok(`"${word}" is left alone`, normaliseStopReason(word) === word);
  }
  ok("and a missing reason stays missing", normaliseStopReason(null) === null && normaliseStopReason(undefined) === null);

  const CUT = [
    ["google", "src/lib/ai/providers/adapters/google.ts", "callGoogle", "google/gemini-2.5-flash",
      { candidates: [{ content: { parts: [{ text: "half an ans" }] }, finishReason: "MAX_TOKENS" }], usageMetadata: {} }],
    ["openai", "src/lib/ai/providers/adapters/openai.ts", "callOpenAi", "openai/gpt-5",
      { choices: [{ message: { content: "half an ans" }, finish_reason: "length" }], usage: {} }],
    ["groq", "src/lib/ai/providers/adapters/groq.ts", "callGroq", "groq/llama-3.3-70b-versatile",
      { choices: [{ message: { content: "half an ans" }, finish_reason: "length" }], usage: {} }],
  ];
  for (const [name, file, exportName, model, reply] of CUT) {
    const mod = await loadTs(file);
    const real = globalThis.fetch;
    let out;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
    try {
      out = await mod[exportName]({
        apiKey: "k",
        model,
        signal: AbortSignal.timeout(5_000),
        request: {
          purpose: "chat",
          system: [{ type: "text", text: "s" }],
          messages: [{ role: "user", content: "u" }],
          maxTokens: 8,
        },
      });
    } finally {
      globalThis.fetch = real;
    }
    ok(`${name}: a reply cut at the ceiling says so in our word`,
      out?.stopReason === AI_TRUNCATED_STOP_REASON, JSON.stringify(out?.stopReason));
    ok(`${name}: ...so modelTextFrom calls it truncated`,
      truncation.modelTextFrom({ text: out?.text ?? "", stopReason: out?.stopReason ?? null }).truncated === true);
  }
}

// ===========================================================================
console.log("\n== 5b. FORCING A TOOL: the field 21 call sites depend on ==");
// ===========================================================================
//
// WHY THIS IS NOT A CONVENIENCE. Twenty-one of this repository's model
// calls give the model one tool and force it, because the tool's input
// schema IS the answer: the caller reads toolCalls[0].input and parses
// nothing. If a provider is handed the tools and not the choice, the
// model may answer in prose instead — toolCalls comes back empty, the
// caller has nothing to read, and the account has been charged for a
// call that produced no usable output. That is the same shape as the
// dropped web search refuseUnsupported exists for: a failure that looks
// like a success.
//
// DRIVEN, NOT READ, for the three fetch adapters. Each one is called
// with a stubbed fetch and the BYTES IT SENT are asserted — a field
// written into the source and spelled wrong, or assembled into an object
// the body never receives, passes a grep and fails here. Anthropic's
// adapter goes through the vendor SDK, which load-ts.mjs will not load,
// so that one is read as source and says so.
{
  const { openAiToolChoice } = await loadTs("src/lib/ai/providers/adapters/shared.ts");
  const withTools = (extra) => ({
    purpose: "classification",
    system: [{ type: "text", text: "s" }],
    messages: [{ role: "user", content: "u" }],
    maxTokens: 64,
    tools: [{ name: "answer", description: "d", inputSchema: { type: "object" } }],
    ...extra,
  });

  ok("openAiToolChoice: auto", openAiToolChoice(withTools({ toolChoice: { type: "auto" } })) === "auto");
  ok("openAiToolChoice: any becomes OpenAI's 'required'",
    openAiToolChoice(withTools({ toolChoice: { type: "any" } })) === "required");
  ok("openAiToolChoice: a named tool",
    JSON.stringify(openAiToolChoice(withTools({ toolChoice: { type: "tool", name: "answer" } }))) ===
      JSON.stringify({ type: "function", function: { name: "answer" } }));
  ok("openAiToolChoice: nothing to send when no choice was made",
    openAiToolChoice(withTools({})) === undefined);
  // BOTH APIs REJECT A CHOICE WITH NO TOOLS, and a 400 from that is
  // classified bad_request, which does not fail over — so a request that
  // was fine would stop the chain.
  ok("openAiToolChoice: nothing to send when there are no tools",
    openAiToolChoice({ purpose: "chat", system: [], messages: [], maxTokens: 1, toolChoice: { type: "any" } }) ===
      undefined);

  // --- the bytes each fetch adapter actually sends -----------------------
  const ADAPTERS = [
    ["google", "src/lib/ai/providers/adapters/google.ts", "callGoogle", "google/gemini-2.5-flash",
      { candidates: [{ content: { parts: [{ text: "hi" }] } }], usageMetadata: {} }],
    ["openai", "src/lib/ai/providers/adapters/openai.ts", "callOpenAi", "openai/gpt-5",
      { choices: [{ message: { content: "hi" } }], usage: {} }],
    ["groq", "src/lib/ai/providers/adapters/groq.ts", "callGroq", "groq/llama-3.3-70b-versatile",
      { choices: [{ message: { content: "hi" } }], usage: {} }],
  ];

  /** Call an adapter with fetch stubbed; give back the body it posted. */
  async function bodySentBy(file, exportName, model, reply, request) {
    const mod = await loadTs(file);
    const real = globalThis.fetch;
    let body = null;
    globalThis.fetch = async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
      await mod[exportName]({ apiKey: "k", model, signal: AbortSignal.timeout(5_000), request });
    } finally {
      globalThis.fetch = real;
    }
    return body;
  }

  for (const [name, file, exportName, model, reply] of ADAPTERS) {
    const forced = await bodySentBy(file, exportName, model, reply,
      withTools({ toolChoice: { type: "tool", name: "answer" } }));
    // A FLOOR ON THE PROBE. An adapter that never called fetch would
    // leave `body` null, and every "the body does not contain X" below
    // would pass on nothing.
    ok(`${name}: the probe captured a request body`, forced !== null && typeof forced === "object",
      "the adapter did not call fetch — every assertion below it would pass on nothing");

    if (name === "google") {
      ok("google: a named tool becomes mode ANY plus allowedFunctionNames",
        JSON.stringify(forced?.toolConfig) ===
          JSON.stringify({ functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["answer"] } }),
        JSON.stringify(forced?.toolConfig));
      const any = await bodySentBy(file, exportName, model, reply, withTools({ toolChoice: { type: "any" } }));
      ok("google: any is ANY with no name list",
        JSON.stringify(any?.toolConfig) === JSON.stringify({ functionCallingConfig: { mode: "ANY" } }),
        JSON.stringify(any?.toolConfig));
      const auto = await bodySentBy(file, exportName, model, reply, withTools({ toolChoice: { type: "auto" } }));
      ok("google: auto is AUTO",
        JSON.stringify(auto?.toolConfig) === JSON.stringify({ functionCallingConfig: { mode: "AUTO" } }),
        JSON.stringify(auto?.toolConfig));
    } else {
      ok(`${name}: a named tool is sent as OpenAI's tool_choice`,
        JSON.stringify(forced?.tool_choice) ===
          JSON.stringify({ type: "function", function: { name: "answer" } }),
        JSON.stringify(forced?.tool_choice));
      const any = await bodySentBy(file, exportName, model, reply, withTools({ toolChoice: { type: "any" } }));
      ok(`${name}: any is 'required'`, any?.tool_choice === "required", JSON.stringify(any?.tool_choice));
    }

    // And the two cases where nothing may be sent.
    const noChoice = await bodySentBy(file, exportName, model, reply, withTools({}));
    ok(`${name}: no choice made, nothing sent`,
      noChoice?.tool_choice === undefined && noChoice?.toolConfig === undefined,
      JSON.stringify({ tool_choice: noChoice?.tool_choice, toolConfig: noChoice?.toolConfig }));
    const noTools = await bodySentBy(file, exportName, model, reply, {
      purpose: "chat",
      system: [{ type: "text", text: "s" }],
      messages: [{ role: "user", content: "u" }],
      maxTokens: 64,
      toolChoice: { type: "any" },
    });
    ok(`${name}: a choice with no tools is not sent`,
      noTools?.tool_choice === undefined && noTools?.toolConfig === undefined,
      JSON.stringify({ tool_choice: noTools?.tool_choice, toolConfig: noTools?.toolConfig }));
  }

  // --- anthropic, by source, because the SDK cannot be loaded here -------
  const anthropicSrc = stripTs(src("src/lib/ai/providers/adapters/anthropic.ts"));
  ok("anthropic: the choice is forwarded", /tool_choice: request\.toolChoice/.test(anthropicSrc), anthropicSrc.slice(0, 0));
  ok("anthropic: ...only alongside tools",
    /if \(!tools\.length\) return \{\};/.test(anthropicSrc) &&
      anthropicSrc.indexOf("if (!tools.length) return {};") < anthropicSrc.indexOf("tool_choice: request.toolChoice"),
    "a tool_choice with no tools is a 400 Anthropic classifies as bad_request, which does not fail over");

  // EVERY ADAPTER, RANGED OVER — not the four this section names. A
  // fifth provider added without forwarding the choice would send the
  // tools and let the model decide, which is the silent failure above.
  //
  // THIS IS A TRIPWIRE, NOT THE PROOF. The proof is the driven probes
  // above, which read the bytes; this only answers "does this adapter
  // deal with a tool choice at all", so a new file that ignores the
  // field cannot slip in unnoticed. Case-insensitive on purpose: two of
  // them reach it through openAiToolChoice() and never write the field
  // name, and a detector that missed those would be a tripwire across
  // half the doorway.
  const DEALS_WITH_CHOICE = /toolchoice/i;
  ok("the tripwire says yes to the field by name", DEALS_WITH_CHOICE.test("tool_choice: request.toolChoice"));
  ok("...yes to reaching it through the shared mapping",
    DEALS_WITH_CHOICE.test("const choice = openAiToolChoice(request);"));
  ok("...and no to an adapter that only sends tools",
    !DEALS_WITH_CHOICE.test("if (request.tools?.length) body.tools = request.tools.map(toWire);"));
  const adapterFiles = readdirSync("src/lib/ai/providers/adapters")
    .filter((f) => f.endsWith(".ts") && f !== "shared.ts")
    .map((f) => `src/lib/ai/providers/adapters/${f}`);
  ok(`the adapter directory was read (${adapterFiles.length})`, adapterFiles.length >= 4,
    "an empty list makes the next check pass on nothing");
  const silent = adapterFiles.filter((f) => !DEALS_WITH_CHOICE.test(stripTs(src(f))));
  ok("every adapter deals with the tool choice", silent.length === 0, silent.join(", "));
}

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
