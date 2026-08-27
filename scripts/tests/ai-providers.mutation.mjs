#!/usr/bin/env node
/*
 * CAN THE ROUTING AND BATCH GATE GO RED?
 *
 * Every defect here is silent from inside the product. The answer still
 * arrives, it still looks right, and the only trace is on an invoice:
 *
 *   A FAILOVER THAT KILLS THE PROMPT CACHE. A route to a model with a
 *   higher cache minimum — or none — re-bills the whole cached prefix at
 *   full input price on every request. Nothing errors. Nothing logs. The
 *   "cheaper" provider is the more expensive one.
 *
 *   A FAILOVER ON THE WRONG ERROR. Failing over on a 400 pays a second
 *   vendor to reject the same malformed request and removes the pressure
 *   that would have got it fixed.
 *
 *   A CACHED-TOKEN DOUBLE COUNT. OpenAI's prompt_tokens includes the
 *   cached ones; Anthropic's input_tokens does not. Copy one into the
 *   other and every cached token is billed twice, always in the same
 *   direction, with a margin that still reads a healthy 4x.
 *
 *   A BATCH DISCOUNT ON WORK THAT WAS NOT BATCHED, or on work that was
 *   batched twice. Exactly 2x wrong, invisible for the same reason.
 *
 *   A RESEARCH REQUEST ANSWERED WITHOUT SEARCHING. The most dangerous of
 *   the lot: a confident, sourced-looking report built from training data.
 *
 * Run: node scripts/tests/ai-providers.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/ai-providers.test.mjs";

const CATALOG = "src/lib/ai/providers/catalog.ts";
const CACHE = "src/lib/ai/providers/cache-policy.ts";
const REGISTRY = "src/lib/ai/providers/registry.ts";
const FAILOVER = "src/lib/ai/providers/failover.ts";
const SHARED = "src/lib/ai/providers/adapters/shared.ts";
const OPENAI = "src/lib/ai/providers/adapters/openai.ts";
const GOOGLE = "src/lib/ai/providers/adapters/google.ts";
const GROQ = "src/lib/ai/providers/adapters/groq.ts";
const ANTHROPIC = "src/lib/ai/providers/adapters/anthropic.ts";
const BATCH_POLICY = "src/lib/ai/batch/batch-policy.ts";
const ACCUMULATOR = "src/lib/billing/cost-accumulator.ts";
const AGENT_CONFIG = "src/lib/agents/agent-config.ts";
const RUNNER = "src/lib/agents/agent-runner.ts";
const RUNS_CRON = "src/app/api/cron/agent-runs/route.ts";
const BATCH_CRON = "src/app/api/cron/agent-batches/route.ts";
const LOG_SQL = "supabase/migrations/20260828000000_ai_provider_log.sql";
const BATCH_SQL = "supabase/migrations/20260829000000_agent_run_batches.sql";
const VERCEL = "vercel.json";
const WORKSPACE = "src/components/agents/agents-workspace.tsx";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE CACHE MINIMUM.
  // ------------------------------------------------------------------
  {
    name: "Haiku's cache minimum is set to Sonnet's, so routing 'down' looks free when it is not",
    file: CATALOG,
    from: "    cacheMinimumTokens: 4096,\n    tier: \"small\",",
    to: "    cacheMinimumTokens: 1024,\n    tier: \"small\",",
  },
  {
    name: "Groq is given a cache minimum of 0, so 'no cache' becomes 'everything caches'",
    file: CATALOG,
    from: "    id: \"groq/llama-3.3-70b-versatile\",\n    provider: \"groq\",\n    inputPerMTok: 0.59,\n    outputPerMTok: 0.79,\n    cacheMinimumTokens: null,",
    to: "    id: \"groq/llama-3.3-70b-versatile\",\n    provider: \"groq\",\n    inputPerMTok: 0.59,\n    outputPerMTok: 0.79,\n    cacheMinimumTokens: 0,",
  },
  {
    name: "an unknown model is assumed to cache, so a route to it looks free",
    file: CACHE,
    from: "  const model = catalogModel(modelId);\n  if (!model) return null;\n  return model.cacheMinimumTokens;",
    to: "  const model = catalogModel(modelId);\n  if (!model) return 1024;\n  return model.cacheMinimumTokens;",
  },
  {
    name: "cachesOn treats a null minimum as zero, so a provider with no cache reports one",
    file: CACHE,
    from: "  const minimum = cacheMinimumTokens(modelId);\n  if (minimum === null) return false;",
    to: "  const minimum = cacheMinimumTokens(modelId);\n  if (minimum === null) return true;",
  },
  {
    name: "the cached prefix is measured as the sum of the MARKED blocks, missing the unmarked one between them",
    file: CACHE,
    from: "    running += approximateTokens(block.text);\n    if (block.cache_control) cached = running;",
    to: "    running += approximateTokens(block.text);\n    if (block.cache_control) cached += approximateTokens(block.text);",
  },
  {
    name: "the cached prefix is measured as the WHOLE prompt, counting the deliberately-uncached tail",
    file: CACHE,
    from: "    if (block.cache_control) cached = running;",
    to: "    cached = running;",
  },
  {
    name: "the cache-read discount is applied to the destination whether or not it caches",
    file: CACHE,
    from: "  const rate = cached ? model.inputPerMTok * CACHE_READ_RATIO : model.inputPerMTok;",
    to: "  const rate = model.inputPerMTok * CACHE_READ_RATIO;\n  void cached;",
  },
  {
    name: "lostTokens is reported even when the cache survived, so every route looks like a loss",
    file: CACHE,
    from: "    lostTokens: cachedBefore && !cachedAfter ? tokens : 0,",
    to: "    lostTokens: tokens,",
  },
  {
    name: "the reason stops naming the numbers, so a log line cannot be acted on",
    file: CACHE,
    from: "      `prefix is ${tokens} tokens; ${to.id} needs ${to.cacheMinimumTokens} to cache, ` +\n      `so it stops caching on this route`",
    to: "      `caching changed on this route`",
  },
  {
    name: "the whole-request comparison ignores the cache and answers on headline rates alone",
    file: CACHE,
    from: "  const fromUsd = cost(from, cachesOn(params.cachedPrefixTokens, params.fromModel));\n  const toUsd = cost(to, cachesOn(params.cachedPrefixTokens, params.toModel));",
    to: "  const fromUsd = cost(from, false);\n  const toUsd = cost(to, false);",
  },

  // ------------------------------------------------------------------
  // THE PRICES.
  // ------------------------------------------------------------------
  {
    name: "a catalog price drifts from the billing table, so the charge stops tracking the cost",
    file: CATALOG,
    from: "    id: \"claude-sonnet-4-6\",\n    provider: \"anthropic\",\n    inputPerMTok: 3,",
    to: "    id: \"claude-sonnet-4-6\",\n    provider: \"anthropic\",\n    inputPerMTok: 1,",
  },
  {
    name: "a catalog cache minimum drifts from lib/ai/cached-system.ts",
    file: CATALOG,
    from: "    id: \"claude-sonnet-4-6\",\n    provider: \"anthropic\",\n    inputPerMTok: 3,\n    outputPerMTok: 15,\n    cacheMinimumTokens: 1024,",
    to: "    id: \"claude-sonnet-4-6\",\n    provider: \"anthropic\",\n    inputPerMTok: 3,\n    outputPerMTok: 15,\n    cacheMinimumTokens: 2048,",
  },
  {
    name: "a non-Anthropic model is left out of the pricing merge, so it prices at the fallback forever",
    file: "src/lib/billing/model-pricing.ts",
    from: "    if (model.provider === \"anthropic\") continue;",
    to: "    if (model.provider !== \"anthropic\") continue;",
  },
  {
    name: "the provenance warning is deleted from the catalog header",
    file: CATALOG,
    from: "NOT VERIFIED AGAINST A LIVE",
    to: "verified against a live",
  },
  {
    name: "Anthropic is quietly added to the verified list without anybody checking a bill",
    file: CATALOG,
    from: 'export const UNVERIFIED_PRICE_PROVIDERS: readonly AiProvider[] = ["openai", "google", "groq"];',
    to: 'export const UNVERIFIED_PRICE_PROVIDERS: readonly AiProvider[] = ["openai", "google", "groq", "anthropic"];',
  },

  // ------------------------------------------------------------------
  // THE REGISTRY.
  // ------------------------------------------------------------------
  {
    name: "every provider with a key joins the chain, so an unrelated OPENAI_API_KEY reroutes chat",
    file: REGISTRY,
    from: 'export const DEFAULT_PROVIDER_ORDER: readonly AiProvider[] = ["anthropic"];',
    to: 'export const DEFAULT_PROVIDER_ORDER: readonly AiProvider[] = ["anthropic", "openai", "google", "groq"];',
  },
  {
    name: "a typo in the order empties the chain and takes every AI feature down at once",
    file: REGISTRY,
    from: "      warnings.push({\n        envVar,\n        value: name,",
    to: "      return { order: [], warnings };\n      warnings.push({\n        envVar,\n        value: name,",
  },
  {
    name: "a missing key is no longer a clean disable — a blank string counts as configured",
    file: REGISTRY,
    from: "  return typeof value === \"string\" && value.trim().length > 0;",
    to: "  return typeof value === \"string\";",
  },
  {
    name: "capability filtering is dropped, so a research call can be routed to a provider with no search",
    file: REGISTRY,
    from: "    const missing = requires.filter((c) => !providerSupports(provider, c));",
    to: "    const missing: string[] = [];\n    void requires;",
  },
  {
    name: "the per-purpose override stops beating the global chain",
    file: REGISTRY,
    from: "  if (perPurpose.order.length > 0) {\n    configured = perPurpose.order;\n    source = purposeVar;\n  } else if (global.order.length > 0) {",
    to: "  if (false) {\n    configured = perPurpose.order;\n    source = purposeVar;\n  } else if (global.order.length > 0) {",
  },
  {
    name: "failover defaults to off, so an incident at one vendor takes the product down",
    file: REGISTRY,
    from: '  const failoverEnabled = String(env[FAILOVER_ENV_VAR] ?? "").trim().toLowerCase() !== "false";',
    to: '  const failoverEnabled = String(env[FAILOVER_ENV_VAR] ?? "").trim().toLowerCase() === "true";',
  },
  {
    name: "substituteModel is allowed to drop to a weaker tier, so a failover silently degrades the answer",
    file: CATALOG,
    from: "    .filter((m) => order.indexOf(m.tier) >= wanted)",
    to: "    .filter(() => true)",
  },

  // ------------------------------------------------------------------
  // FAILOVER CLASSIFICATION.
  // ------------------------------------------------------------------
  {
    name: "a 400 fails over, so three vendors take turns rejecting the same malformed request",
    file: FAILOVER,
    from: "  if (status >= 400) return { outcome: \"bad_request\", failover: false, status };",
    to: "  if (status >= 400) return { outcome: \"bad_request\", failover: true, status };",
  },
  {
    name: "an unreadable error fails over, spending money at a second vendor on nothing",
    file: FAILOVER,
    from: "  if (status === null) return { outcome: \"unknown_error\", failover: false, status: null };",
    to: "  if (status === null) return { outcome: \"unknown_error\", failover: true, status: null };",
  },
  {
    name: "a 529 falls through to the 4xx branch instead of being recognised as overload",
    file: FAILOVER,
    from: "  if (status === 529) return { outcome: \"overloaded\", failover: true, status };",
    to: "  if (status === 5290) return { outcome: \"overloaded\", failover: true, status };",
  },
  {
    name: "a timeout is no longer recognised, so a hung provider is an unknown error that does not fail over",
    file: FAILOVER,
    from: "  if (isAbort(err)) return { outcome: \"timeout\", failover: true, status: null };",
    to: "  if (false) return { outcome: \"timeout\", failover: true, status: null };",
  },
  {
    name: "a network failure is classified as unknown, so it does not fail over either",
    file: FAILOVER,
    from: "  return named.name === \"TypeError\" && typeof named.message === \"string\" && /fetch failed/i.test(named.message);",
    to: "  return false;",
  },
  {
    name: "a 401 stops failing over, so one revoked key takes down a product with three providers configured",
    file: FAILOVER,
    from: "  if (status === 401 || status === 403) return { outcome: \"auth_error\", failover: true, status };",
    to: "  if (status === 401 || status === 403) return { outcome: \"auth_error\", failover: false, status };",
  },
  {
    name: "one attempt budget is shared across the chain, so the last provider gets no time at all",
    file: FAILOVER,
    from: "export const ATTEMPT_TIMEOUT_MS = 120_000;",
    to: "export const ATTEMPT_TIMEOUT_MS = 900;",
  },

  // ------------------------------------------------------------------
  // THE ADAPTERS.
  // ------------------------------------------------------------------
  {
    name: "cached tokens are counted TWICE — once at full input price and once as a cache read",
    file: SHARED,
    from: "    input_tokens: Math.max(0, total - cached),",
    to: "    input_tokens: total,",
  },
  {
    name: "a provider reporting nonsense produces a NEGATIVE input count, which prices as a credit",
    file: SHARED,
    from: "  const cached = Math.max(0, Math.round(cachedTokens || 0));\n  const total = Math.max(0, Math.round(totalPromptTokens || 0));",
    to: "  const cached = Math.round(cachedTokens || 0);\n  const total = Math.round(totalPromptTokens || 0);",
  },
  {
    name: "the cache read is not clamped to the total, so more is discounted than was ever sent",
    file: SHARED,
    from: "    cache_read_input_tokens: Math.min(cached, total),",
    to: "    cache_read_input_tokens: cached,",
  },
  {
    name: "OpenAI answers a research request without searching, from training data",
    file: OPENAI,
    from: '  refuseUnsupported("openai", request);',
    to: "  void request;",
  },
  {
    name: "Google does the same",
    file: GOOGLE,
    from: '  refuseUnsupported("google", request);',
    to: "  void request;",
  },
  {
    name: "Groq does the same",
    file: GROQ,
    from: '  refuseUnsupported("groq", request);',
    to: "  void request;",
  },
  {
    name: "the refusal becomes a 500, which DOES fail over — so the next provider answers unsourced instead",
    file: SHARED,
    from: "    throw new ProviderHttpError(\n      400,",
    to: "    throw new ProviderHttpError(\n      503,",
  },
  {
    name: "Google is sent the assistant role it rejects, turning every second turn into a dead 400",
    file: GOOGLE,
    from: '      role: m.role === "assistant" ? "model" : "user",',
    to: "      role: m.role,",
  },
  {
    name: "Google's key is sent as a bearer token, which it does not accept",
    file: GOOGLE,
    from: '    headers: { "x-goog-api-key": call.apiKey },',
    to: "    headers: { Authorization: `Bearer ${call.apiKey}` },",
  },
  {
    name: "Groq claims a cache read it cannot have, so a cache loss becomes invisible in the cost log",
    file: GROQ,
    from: "      input_tokens: raw.usage?.prompt_tokens ?? 0,\n      output_tokens: raw.usage?.completion_tokens ?? 0,\n    },",
    to: "      input_tokens: raw.usage?.prompt_tokens ?? 0,\n      output_tokens: raw.usage?.completion_tokens ?? 0,\n      cache_read_input_tokens: 0,\n    },",
  },
  {
    name: "the Anthropic adapter stops sending the web search tool, so research answers from memory",
    file: ANTHROPIC,
    from: "                  type: \"web_search_20250305\" as const,",
    to: "                  type: \"web_search_disabled\" as const,",
  },
  {
    name: "the namespace is not stripped, so every non-Anthropic request asks for a model id that does not exist",
    file: SHARED,
    from: "  return slash === -1 ? catalogId : catalogId.slice(slash + 1);",
    to: "  return catalogId;",
  },

  // ------------------------------------------------------------------
  // THE BATCH.
  // ------------------------------------------------------------------
  {
    name: "batching defaults to ON, changing when every scheduled result arrives without anybody deciding",
    file: BATCH_POLICY,
    from: '  return String(env[BATCH_ENABLED_ENV_VAR] ?? "").trim().toLowerCase() === "true";',
    to: '  return String(env[BATCH_ENABLED_ENV_VAR] ?? "true").trim().toLowerCase() === "true";',
  },
  {
    name: "a manual run is batched, so somebody watching a spinner waits up to 24 hours",
    file: BATCH_POLICY,
    from: '  if (candidate.triggerSource !== "schedule") {',
    to: "  if (false) {",
  },
  {
    name: "an agent that needs live research is batched, and answers from training data instead",
    file: BATCH_POLICY,
    from: "  if (candidate.needsWebSearch) {",
    to: "  if (false) {",
  },
  {
    name: "the interval floor is dropped, so an hourly agent piles up 24 outstanding batches",
    file: BATCH_POLICY,
    from: "  if (!Number.isFinite(candidate.intervalMinutes) || candidate.intervalMinutes < MIN_INTERVAL_MINUTES_FOR_BATCH) {",
    to: "  if (false) {",
  },
  {
    name: "the outstanding-batch guard is dropped in the policy",
    file: BATCH_POLICY,
    from: "  if (candidate.hasOutstandingBatch) {",
    to: "  if (false) {",
  },
  {
    name: "the per-agent opt-out is ignored",
    file: BATCH_POLICY,
    from: "  if (candidate.batchOptOut === true) {",
    to: "  if (false) {",
  },
  {
    name: "the discount becomes 25%, so every batched run is charged half what it cost",
    file: BATCH_POLICY,
    from: "export const BATCH_DISCOUNT = 0.5;",
    to: "export const BATCH_DISCOUNT = 0.25;",
  },
  {
    name: "an expired batch is not treated as a fallback, so the user is simply never told",
    file: BATCH_POLICY,
    from: '  return status === "errored" || status === "canceled" || status === "expired";',
    to: '  return status === "errored";',
  },
  {
    name: "expiry is computed from the wrong window, so batches are abandoned after an hour",
    file: BATCH_POLICY,
    from: "export const BATCH_WINDOW_HOURS = 24;",
    to: "export const BATCH_WINDOW_HOURS = 1;",
  },
  {
    name: "the batch discount is applied without a batch id, so any call can claim it",
    file: ACCUMULATOR,
    from: "    if (!batchId) {",
    to: "    if (false) {",
  },
  {
    name: "the batch discount halves the TOKEN COUNTS as well as the price",
    file: ACCUMULATOR,
    from: "      usage: { ...priced, usdCost: batchAdjustedUsd(priced.usdCost) },",
    to: "      usage: { ...priced, inputTokens: Math.round(priced.inputTokens / 2), usdCost: batchAdjustedUsd(priced.usdCost) },",
  },
  {
    name: "the batch discount is applied twice, charging a quarter of the real cost",
    file: ACCUMULATOR,
    from: "      usage: { ...priced, usdCost: batchAdjustedUsd(priced.usdCost) },",
    to: "      usage: { ...priced, usdCost: batchAdjustedUsd(batchAdjustedUsd(priced.usdCost)) },",
  },
  {
    name: "a batch entry is flagged as an unknown model, raising an incident on every batched run forever",
    file: ACCUMULATOR,
    from: "    if (!isExternalModel(model) && !isBatchModel(model) && !isKnownModel(model)) {",
    to: "    if (!isExternalModel(model) && !isKnownModel(model)) {",
  },
  {
    name: "the opt-out reads a truthy jsonb string, so config {batchOptOut: \"false\"} opts out",
    file: AGENT_CONFIG,
    from: "    batchOptOut: source.batchOptOut === true,",
    to: "    batchOptOut: Boolean(source.batchOptOut),",
  },

  // ------------------------------------------------------------------
  // THE SQL AND THE WIRING.
  // ------------------------------------------------------------------
  {
    name: "the log's outcome check drops a state the classifier can produce, so those rows are rejected",
    file: LOG_SQL,
    from: "'network_error', 'bad_request', 'auth_error', 'overloaded', 'unknown_error'",
    to: "'network_error', 'bad_request', 'auth_error', 'overloaded'",
  },
  {
    name: "the log gains a column that could hold a prompt",
    file: LOG_SQL,
    from: "  reason text not null default '',",
    to: "  reason text not null default '',\n  prompt text,",
  },
  {
    name: "the log's cache_kept column is removed — the only trace a silent failover leaves",
    file: LOG_SQL,
    from: "  cache_kept boolean\n);",
    to: "  cache_kept_removed boolean\n);",
  },
  {
    name: "the log becomes writable by any signed-in user, who can then fabricate the routing record",
    file: LOG_SQL,
    from: "revoke insert, update, delete on public.ai_provider_log from authenticated;",
    to: "grant insert on public.ai_provider_log to authenticated;",
  },
  {
    name: "'queued' is dropped from the status check, so every batched run fails to be written",
    file: BATCH_SQL,
    from: "check (status in ('running', 'queued', 'success', 'failed'));",
    to: "check (status in ('running', 'success', 'failed'));",
  },
  {
    name: "the one-outstanding-batch index loses its WHERE, so an agent can only ever have one run",
    file: BATCH_SQL,
    from: "  on public.agent_runs (agent_id)\n  where status = 'queued';",
    to: "  on public.agent_runs (agent_id);",
  },
  {
    name: "the pile-up guard becomes a non-unique index, losing the race it exists to win",
    file: BATCH_SQL,
    from: "create unique index if not exists agent_runs_one_outstanding_batch_idx",
    to: "create index if not exists agent_runs_one_outstanding_batch_idx",
  },
  {
    name: "the stuck-run sweeper widens to anything unfinished, closing every outstanding batch an hour in",
    file: RUNS_CRON,
    from: '      .eq("status", "running")\n      .lt("started_at", stuckCutoff);',
    to: '      .neq("status", "success")\n      .lt("started_at", stuckCutoff);',
  },
  {
    name: "the collector stops running when batching is disabled, stranding every queued row",
    file: BATCH_CRON,
    from: "    const admin = createAdminClient();\n    const summary = await collectAgentBatches({ admin, apiKey });",
    to: "    if (!batchEnabled(process.env)) return NextResponse.json({ ok: true, skipped: true });\n    const admin = createAdminClient();\n    const summary = await collectAgentBatches({ admin, apiKey });",
  },
  {
    name: "the collector cron is unregistered, so nothing ever collects a batch",
    file: VERCEL,
    from: '"/api/cron/agent-batches"',
    to: '"/api/cron/agent-batches-disabled"',
  },
  {
    name: "the collector loses its CRON_SECRET guard, so anyone can settle charges against any account",
    file: BATCH_CRON,
    from: "    const auth = checkCronAuth(request);",
    to: "    const auth = { ok: true } as { ok: true; error?: string; status?: number };",
  },
  {
    name: "a queued run is shown to the user as Running for up to 24 hours",
    file: WORKSPACE,
    from: '                              : run.status === "queued"\n                                  ? t("runQueued")',
    to: '                              : run.status === "queued_never"\n                                  ? t("runQueued")',
  },
  {
    name: "the agent runner leaks which provider failed into the sentence the user reads",
    file: RUNNER,
    from: '      failure: { kind: "api_error", message: "The AI service could not be reached." },\n    };\n  }\n\n  // reportedModel',
    to: '      failure: { kind: "api_error", message: `The AI service could not be reached (${outcome.detail}).` },\n    };\n  }\n\n  // reportedModel',
  },
  {
    name: "the runner prices the model it ASKED for rather than the one that answered",
    file: RUNNER,
    from: "  costs.record(\"generation\", outcome.usage, outcome.reportedModel || outcome.model);",
    to: "  costs.record(\"generation\", outcome.usage, spec.model);",
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  let mutated = original;
  for (const e of edits) mutated = mutated.replace(e.from, e.to);
  if (mutated === original) {
    missed.push({ ...m, why: "the mutation left the file byte-identical — it is not a defect" });
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  // DECIDED BY THE EXIT CODE, never by grepping stdout for FAIL: a gate
  // that dies on a syntax error and prints nothing has still gone red.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

try {
  execFileSync("node", [GATE], { stdio: "pipe" });
  console.log("\nbaseline: the gate is green on the unmutated tree");
} catch {
  console.log("\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
  process.exit(1);
}
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
