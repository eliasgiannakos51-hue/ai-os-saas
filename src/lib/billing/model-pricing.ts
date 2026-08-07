// Anthropic list prices, in USD, for every model and billable server tool
// this app actually calls. Everything downstream (cost accumulation,
// credit charging, margin reporting) derives from these numbers, so this
// is the single place to update when Anthropic changes pricing.
//
// Prices are per MILLION tokens, matching how Anthropic publishes them,
// and are converted to per-token at the point of use rather than being
// pre-divided here — keeping the published figure literally in the source
// makes it checkable against the pricing page at a glance.

export type ModelPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Writing to the prompt cache costs more than a normal input token. */
  cacheWritePerMTok: number;
  /** Reading from it costs far less — this is the whole point of caching. */
  cacheReadPerMTok: number;
};

// Prices verified against Anthropic's published model pricing
// (platform.claude.com/docs/en/about-claude/models) on 2026-08-07, the
// same commit that introduced the four-tier model system in
// lib/ai/models.ts. Cache write is the 5-minute-TTL rate (1.25x input —
// the only TTL this app uses); cache read is 0.1x input.
//
// Sonnet 5 has introductory pricing ($2/$10) through 2026-08-31; the
// STICKER price is recorded here deliberately, because charging users
// against a price that expires in weeks would silently halve the margin
// on 2026-09-01 without any code change.
export const MODEL_PRICING_USD: Record<string, ModelPricing> = {
  // Tier MAX (lib/ai/models.ts) — Deep Research, complex missions,
  // complex website builds.
  "claude-fable-5": {
    inputPerMTok: 10,
    outputPerMTok: 50,
    cacheWritePerMTok: 12.5,
    cacheReadPerMTok: 1,
  },
  // Tier PREMIUM — Website Builder, Presentations, Agents, live editing.
  "claude-opus-5": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWritePerMTok: 6.25,
    cacheReadPerMTok: 0.5,
  },
  // Fable's refusal-fallback target: when Fable's safety classifiers
  // decline a request, the retry runs on Opus 4.8 and the response names
  // it — so its price must be known even though no code requests it.
  "claude-opus-4-8": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWritePerMTok: 6.25,
    cacheReadPerMTok: 0.5,
  },
  // Tier STANDARD — Chat, Create Anything, File/module Q&A.
  "claude-sonnet-5": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  // Tier FAST — classification, extraction, clarifying checks, support.
  "claude-haiku-4-5-20251001": {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheWritePerMTok: 1.25,
    cacheReadPerMTok: 0.1,
  },
  // The previous single model for every feature. Kept so that any
  // remaining call site — and any historical cost-log analysis — prices
  // correctly rather than falling through to the most-expensive-known
  // fallback.
  "claude-sonnet-4-6": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
};

// Used when a response reports a model this table doesn't know — which
// happens if a model id is changed in code without updating this file.
// Deliberately the MOST expensive known model rather than an average or a
// zero: an unknown model must never make an action look cheaper than it
// is, because that would silently under-charge and destroy the margin
// guarantee. Over-charging slightly on an unrecognised model is the safe
// direction to fail in.
export const FALLBACK_MODEL_PRICING: ModelPricing = Object.values(MODEL_PRICING_USD).reduce(
  (worst, p) => ({
    inputPerMTok: Math.max(worst.inputPerMTok, p.inputPerMTok),
    outputPerMTok: Math.max(worst.outputPerMTok, p.outputPerMTok),
    cacheWritePerMTok: Math.max(worst.cacheWritePerMTok, p.cacheWritePerMTok),
    cacheReadPerMTok: Math.max(worst.cacheReadPerMTok, p.cacheReadPerMTok),
  }),
  { inputPerMTok: 0, outputPerMTok: 0, cacheWritePerMTok: 0, cacheReadPerMTok: 0 }
);

// Anthropic's web_search_20250305 server tool is billed per search
// actually executed ($10 per 1,000), SEPARATELY from the tokens the
// search results add to the context. Offering the tool costs nothing;
// only `usage.server_tool_use.web_search_requests` is billable.
export const WEB_SEARCH_USD_PER_QUERY = 10 / 1000;

export function pricingForModel(model: string | undefined): ModelPricing {
  if (!model) return FALLBACK_MODEL_PRICING;
  return MODEL_PRICING_USD[model] ?? FALLBACK_MODEL_PRICING;
}

// The shape Anthropic returns on `response.usage`. Declared structurally
// rather than imported from the SDK because several fields are optional
// and version-dependent, and this code must tolerate any of them being
// absent without under-counting.
export type AnthropicUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

export type UsageBreakdown = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  webSearches: number;
  usdCost: number;
};

function n(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

// Converts one Anthropic response's usage into a priced breakdown.
//
// Note on cache tokens: `input_tokens` from Anthropic already EXCLUDES
// tokens served from cache and tokens written to it — they are reported
// in their own fields at their own rates. So the four token counts are
// added, never treated as overlapping, and none of them is double
// counted.
export function priceUsage(usage: AnthropicUsageLike | null | undefined, model?: string): UsageBreakdown {
  const p = pricingForModel(model);
  const inputTokens = n(usage?.input_tokens);
  const outputTokens = n(usage?.output_tokens);
  const cacheWriteTokens = n(usage?.cache_creation_input_tokens);
  const cacheReadTokens = n(usage?.cache_read_input_tokens);
  const webSearches = n(usage?.server_tool_use?.web_search_requests);

  const usdCost =
    (inputTokens / 1_000_000) * p.inputPerMTok +
    (outputTokens / 1_000_000) * p.outputPerMTok +
    (cacheWriteTokens / 1_000_000) * p.cacheWritePerMTok +
    (cacheReadTokens / 1_000_000) * p.cacheReadPerMTok +
    webSearches * WEB_SEARCH_USD_PER_QUERY;

  return { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, webSearches, usdCost };
}
