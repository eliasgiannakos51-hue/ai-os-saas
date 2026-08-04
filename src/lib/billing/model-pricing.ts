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

export const MODEL_PRICING_USD: Record<string, ModelPricing> = {
  // The model every AI feature in this app calls today (see
  // lib/website-builder.ts, lib/mission-agents.ts, api/chat, api/create).
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
