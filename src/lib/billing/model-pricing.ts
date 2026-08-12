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
  /** Writing to the 5-minute prompt cache — 1.25x a normal input token. */
  cacheWritePerMTok: number;
  /**
   * Writing to the ONE-HOUR prompt cache — 2x a normal input token, not
   * 1.25x.
   *
   * Anthropic reports both TTLs inside the same
   * `cache_creation_input_tokens` total and only separates them in
   * `usage.cache_creation`. Pricing that whole total at the 5-minute rate
   * therefore under-charges a 1-hour write by 37.5% while looking
   * completely healthy in the log: the stored margin is computed from the
   * same understated cost, so it reads 4x no matter how wrong it is. Same
   * failure shape as the one-model MODEL_PRICING_USD table this file
   * already documents.
   */
  cacheWrite1hPerMTok: number;
  /** Reading from it costs far less — this is the whole point of caching. */
  cacheReadPerMTok: number;
};

// Cache rates follow Anthropic's published ratios: writing costs 1.25x the
// input rate (5-minute TTL) or 2x (1-hour TTL), reading costs 0.1x. Kept as
// literals per model rather than derived, so each row is checkable against
// the pricing page.
function tier(inputPerMTok: number, outputPerMTok: number): ModelPricing {
  return {
    inputPerMTok,
    outputPerMTok,
    cacheWritePerMTok: inputPerMTok * 1.25,
    cacheWrite1hPerMTok: inputPerMTok * 2,
    cacheReadPerMTok: inputPerMTok * 0.1,
  };
}

export const MODEL_PRICING_USD: Record<string, ModelPricing> = {
  // Sonnet tier — $3 / $15 per MTok.
  // claude-sonnet-4-6 is what every AI feature in this app requests today
  // (see lib/ai-models.ts, lib/website-builder.ts, api/chat, api/create).
  "claude-sonnet-4-5": tier(3, 15),
  "claude-sonnet-4-6": tier(3, 15),
  // Sonnet 5's $2/$10 introductory pricing is deliberately NOT used:
  // charging at the permanent $3/$15 list price is the safe direction, and
  // the intro window expires on its own.
  "claude-sonnet-5": tier(3, 15),
  // Opus tier — $5 / $25 per MTok.
  "claude-opus-4-5": tier(5, 25),
  "claude-opus-4-6": tier(5, 25),
  "claude-opus-4-7": tier(5, 25),
  "claude-opus-4-8": tier(5, 25),
  "claude-opus-5": tier(5, 25),
  // Haiku tier — $1 / $5 per MTok.
  "claude-haiku-4-5": tier(1, 5),
  // Fable / Mythos tier — $10 / $50 per MTok, the most expensive models
  // Anthropic serves. Being in this table is what makes FALLBACK below
  // genuinely "the most expensive known model".
  "claude-fable-5": tier(10, 50),
  "claude-mythos-5": tier(10, 50),
};

// Used when a response reports a model this table doesn't know — which
// happens if a model id is changed in code without updating this file, or
// if Anthropic serves a model under a new id. Deliberately the MOST
// expensive known model rather than an average or a zero: an unknown model
// must never make an action look cheaper than it is, because that would
// silently under-charge and destroy the margin guarantee. Over-charging
// slightly on an unrecognised model is the safe direction to fail in.
//
// This safety property is only real when the table is COMPLETE. Before the
// 2026-08 pricing fix the table held exactly one model (Sonnet 4.6), so
// "the most expensive known model" WAS Sonnet — and a chat turn served by
// any pricier model was silently priced at less than a third of its real
// cost. That is the mechanism behind the "$0.10 message charged 2 credits"
// incident, and why the margin alert never fired: the stored margin was
// computed from the same understated cost and read as a healthy 4x.
export const FALLBACK_MODEL_PRICING: ModelPricing = Object.values(MODEL_PRICING_USD).reduce(
  (worst, p) => ({
    inputPerMTok: Math.max(worst.inputPerMTok, p.inputPerMTok),
    outputPerMTok: Math.max(worst.outputPerMTok, p.outputPerMTok),
    cacheWritePerMTok: Math.max(worst.cacheWritePerMTok, p.cacheWritePerMTok),
    cacheWrite1hPerMTok: Math.max(worst.cacheWrite1hPerMTok, p.cacheWrite1hPerMTok),
    cacheReadPerMTok: Math.max(worst.cacheReadPerMTok, p.cacheReadPerMTok),
  }),
  {
    inputPerMTok: 0,
    outputPerMTok: 0,
    cacheWritePerMTok: 0,
    cacheWrite1hPerMTok: 0,
    cacheReadPerMTok: 0,
  }
);

// Anthropic's web_search_20250305 server tool is billed per search
// actually executed ($10 per 1,000), SEPARATELY from the tokens the
// search results add to the context. Offering the tool costs nothing;
// only `usage.server_tool_use.web_search_requests` is billable.
export const WEB_SEARCH_USD_PER_QUERY = 10 / 1000;

// Anthropic's web_fetch server tool carries NO per-request charge — a
// fetch is paid for entirely through the tokens its result adds to the
// context, which `input_tokens` already counts.
//
// Zero, written down, rather than a field priceUsage silently skips. The
// difference matters: `usage.server_tool_use.web_fetch_requests` is a
// billable-looking counter sitting next to one that really is billed, and
// "we decided it is free" and "nobody noticed it existed" are
// indistinguishable in code that just doesn't mention it. The build gate
// (scripts/tests/usage-field-coverage.test.mjs) requires every field of
// the SDK's Usage type to be accounted for here, and this constant is how
// this one is accounted for. If Anthropic ever starts charging per fetch,
// changing this number is the whole fix.
export const WEB_FETCH_USD_PER_REQUEST = 0;

/**
 * Maps whatever id a response reports onto a table key.
 *
 * Anthropic responses can carry a dated snapshot id
 * ("claude-haiku-4-5-20251001") or a deployment-variant suffix
 * ("claude-sonnet-4-6[1m]") for a model this table knows under its alias.
 * Those are the same model at the same or higher rates, so they resolve to
 * the alias row instead of falling through to FALLBACK — the fallback is
 * for models we genuinely do not know, not for spellings of ones we do.
 */
export function normalizeModelId(model: string): string {
  const trimmed = model.trim().toLowerCase();
  if (MODEL_PRICING_USD[trimmed]) return trimmed;
  const withoutVariant = trimmed.replace(/\[[^\]]*\]$/, "");
  if (MODEL_PRICING_USD[withoutVariant]) return withoutVariant;
  const withoutDate = withoutVariant.replace(/-\d{8}$/, "");
  if (MODEL_PRICING_USD[withoutDate]) return withoutDate;
  return trimmed;
}

export function isKnownModel(model: string | undefined): boolean {
  if (!model) return false;
  return Boolean(MODEL_PRICING_USD[normalizeModelId(model)]);
}

// Warned once per model id per process — an unknown model prices EVERY
// token of every call wrong until the table is updated, but repeating the
// line per request would bury the log it needs to be found in.
const warnedUnknownModels = new Set<string>();

export function pricingForModel(model: string | undefined): ModelPricing {
  if (!model) return FALLBACK_MODEL_PRICING;
  const normalized = normalizeModelId(model);
  const known = MODEL_PRICING_USD[normalized];
  if (known) return known;
  if (!warnedUnknownModels.has(normalized)) {
    warnedUnknownModels.add(normalized);
    // eslint-disable-next-line no-console
    console.error(
      `[model-pricing] Unknown model "${model}" — priced at the most expensive known rates. ` +
        `Add it to MODEL_PRICING_USD or the charge may not track the real cost.`
    );
  }
  return FALLBACK_MODEL_PRICING;
}

// The shape Anthropic returns on `response.usage`. Declared structurally
// rather than imported from the SDK because several fields are optional
// and version-dependent, and this code must tolerate any of them being
// absent without under-counting.
export type AnthropicUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  /** Cache-write tokens across BOTH TTLs — the inclusive total. */
  cache_creation_input_tokens?: number | null;
  /** The same tokens split by TTL. Only this tells 1-hour writes (2x)
   *  apart from 5-minute ones (1.25x). */
  cache_creation?: {
    ephemeral_5m_input_tokens?: number | null;
    ephemeral_1h_input_tokens?: number | null;
  } | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: {
    web_search_requests?: number | null;
    /** Priced at zero deliberately — see WEB_FETCH_USD_PER_REQUEST. */
    web_fetch_requests?: number | null;
  } | null;
  /**
   * Read only so an unpriced premium tier cannot pass silently. Every
   * MODEL_PRICING_USD row is a STANDARD-tier rate; "priority" is billed
   * above it, so seeing that value here means the stored cost is a
   * guess. Same treatment as an unknown model id.
   */
  service_tier?: string | null;
};

export type UsageBreakdown = {
  inputTokens: number;
  outputTokens: number;
  /** Cache writes at the 5-minute rate (1.25x input). */
  cacheWriteTokens: number;
  /** Cache writes at the 1-hour rate (2x input). Kept separate from
   *  cacheWriteTokens because they are priced differently; the cost log
   *  stores the SUM, which is the figure Anthropic reports back. */
  cacheWrite1hTokens: number;
  cacheReadTokens: number;
  webSearches: number;
  webFetches: number;
  usdCost: number;
};

function n(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Converts one Anthropic response's usage into a priced breakdown.
 *
 * Note on cache tokens: `input_tokens` from Anthropic already EXCLUDES
 * tokens served from cache and tokens written to it — they are reported
 * in their own fields at their own rates. So the token counts are added,
 * never treated as overlapping, and none of them is double counted.
 *
 * The ONE place they DO overlap is the two cache-write fields:
 * `cache_creation_input_tokens` is the inclusive total and
 * `cache_creation` is the same tokens split by TTL. Splitting the total
 * rather than adding the breakdown to it is what keeps that from being
 * counted twice — and pricing the 1-hour slice at 2x rather than 1.25x is
 * what keeps a 1-hour cache write from being under-charged by 37.5% while
 * the stored margin, computed from the same understated cost, still reads
 * a healthy 4x.
 */
export function priceUsage(usage: AnthropicUsageLike | null | undefined, model?: string): UsageBreakdown {
  const p = pricingForModel(model);
  const inputTokens = n(usage?.input_tokens);
  const outputTokens = n(usage?.output_tokens);
  const cacheReadTokens = n(usage?.cache_read_input_tokens);
  const webSearches = n(usage?.server_tool_use?.web_search_requests);
  const webFetches = n(usage?.server_tool_use?.web_fetch_requests);

  // The TTL split. `reportedTotal` is authoritative when present, but the
  // breakdown is trusted over it when it is LARGER: a total that omits
  // part of the breakdown would under-charge, and over-charging slightly
  // is the safe direction to fail in — the same rule FALLBACK_MODEL_PRICING
  // follows for an unrecognised model.
  const reportedTotal = n(usage?.cache_creation_input_tokens);
  const write1h = n(usage?.cache_creation?.ephemeral_1h_input_tokens);
  const write5mReported = n(usage?.cache_creation?.ephemeral_5m_input_tokens);
  const breakdownTotal = write1h + write5mReported;
  const cacheWriteTotal = Math.max(reportedTotal, breakdownTotal);
  const cacheWrite1hTokens = Math.min(write1h, cacheWriteTotal);
  // Whatever the total holds beyond the 1-hour slice is a 5-minute write.
  // Derived by subtraction rather than read from
  // ephemeral_5m_input_tokens, so a response that reports the total but
  // omits the breakdown still prices every token it charged us for.
  const cacheWriteTokens = cacheWriteTotal - cacheWrite1hTokens;

  const usdCost =
    (inputTokens / 1_000_000) * p.inputPerMTok +
    (outputTokens / 1_000_000) * p.outputPerMTok +
    (cacheWriteTokens / 1_000_000) * p.cacheWritePerMTok +
    (cacheWrite1hTokens / 1_000_000) * p.cacheWrite1hPerMTok +
    (cacheReadTokens / 1_000_000) * p.cacheReadPerMTok +
    webSearches * WEB_SEARCH_USD_PER_QUERY +
    webFetches * WEB_FETCH_USD_PER_REQUEST;

  return {
    inputTokens,
    outputTokens,
    cacheWriteTokens,
    cacheWrite1hTokens,
    cacheReadTokens,
    webSearches,
    webFetches,
    usdCost,
  };
}

/**
 * True when this usage was served on a tier MODEL_PRICING_USD does not
 * price.
 *
 * Every rate in this file is Anthropic's STANDARD tier. "priority" is
 * billed above it and "batch" below it, so either one makes the computed
 * cost a guess — and a guessed cost produces a guessed margin that reads
 * healthy by construction. Settlement treats this exactly like an unknown
 * model: log it, alert, and let a person look. Batch is included because
 * the app never uses it either; if it ever does, the safe direction is to
 * notice rather than to quietly over-charge.
 */
export function isUnpricedServiceTier(usage: AnthropicUsageLike | null | undefined): boolean {
  const tierName = usage?.service_tier;
  if (typeof tierName !== "string" || tierName === "") return false;
  return tierName !== "standard";
}
