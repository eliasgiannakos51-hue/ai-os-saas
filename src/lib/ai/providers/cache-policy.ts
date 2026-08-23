import { catalogModel, type CatalogModel } from "@/lib/ai/providers/catalog";
import { approximateTokens } from "@/lib/ai/cached-system";
import type { AiSystemBlock } from "@/lib/ai/providers/types";

/**
 * WHAT ROUTING DOES TO THE PROMPT CACHE.
 *
 * lib/ai/cached-system.ts already refuses to place a cache marker below a
 * model's minimum, because a marker the provider ignores looks exactly
 * like caching that works. This module is that rule after the decision it
 * did not have to make: the model can now CHANGE between building the
 * request and sending it, and the minimum belongs to the destination.
 *
 * THE SPECIFIC WARNING IN THE BRIEF, spelled out with numbers.
 *
 * Sonnet's minimum is 1,024 tokens; Haiku's is 4,096. Route a call with a
 * 2,000-token cached prefix from Sonnet to Haiku "to save money" and:
 *
 *   on Sonnet  2,000 cached read tokens  @ $0.30/MTok  = $0.00060
 *   on Haiku   2,000 FULL input tokens   @ $1.00/MTok  = $0.00200
 *
 * The cheaper model costs three and a third times as much for that
 * prefix, every request, and nothing reports it: Haiku does not error on
 * a cache_control it will not honour, it just returns
 * cache_creation_input_tokens = 0 and bills the tokens. The saving on the
 * output tokens is real; it is simply not the whole sum, and the whole
 * sum is what a routing decision needs.
 *
 * Groq is the extreme case: no prompt cache at all, so `null`, so every
 * cached token becomes a full-price one however long the prefix is.
 *
 * Everything here is pure arithmetic over the catalog, so the build gate
 * can assert it without a key, a network, or a bill.
 */

/**
 * The minimum cacheable prefix for a catalog model, or null when the
 * model has no prompt cache.
 *
 * AN UNKNOWN MODEL IS TREATED AS HAVING NO CACHE. That is the safe
 * direction and it is the opposite of what "unknown" usually means here:
 * lib/billing/model-pricing.ts prices an unknown model at the MOST
 * expensive known rate, and this returns the LEAST favourable cache
 * assumption. Both answer the same question — which way is it safe to be
 * wrong — and for caching, assuming a cache we do not have would let a
 * route be chosen on a saving that never arrives.
 */
export function cacheMinimumTokens(modelId: string | undefined): number | null {
  const model = catalogModel(modelId);
  if (!model) return null;
  return model.cacheMinimumTokens;
}

/** Does a prefix this long actually cache on this model? */
export function cachesOn(prefixTokens: number, modelId: string | undefined): boolean {
  const minimum = cacheMinimumTokens(modelId);
  if (minimum === null) return false;
  return prefixTokens >= minimum;
}

/**
 * How many tokens of a request are inside a cache breakpoint.
 *
 * Anthropic caches everything UP TO AND INCLUDING the block carrying the
 * marker, so the cached prefix is the running total through the LAST
 * marked block — not the sum of the marked blocks, which would miss the
 * unmarked ones between them, and not the whole prompt, which would
 * count the deliberately-uncached tail.
 */
export function cachedPrefixTokens(system: readonly AiSystemBlock[]): number {
  let running = 0;
  let cached = 0;
  for (const block of system) {
    running += approximateTokens(block.text);
    if (block.cache_control) cached = running;
  }
  return cached;
}

export type CacheImpact = {
  /** True when a prefix that cached at the origin still caches at the
   *  destination. Null when there was no cached prefix to lose. */
  keptCache: boolean | null;
  /** Tokens that were being read from cache and now are not. */
  lostTokens: number;
  /** What those tokens cost at the ORIGIN, per request. */
  originCostUsd: number;
  /** What the same tokens cost at the DESTINATION, per request. */
  destinationCostUsd: number;
  /** Positive when the route costs more for the prefix alone. */
  extraCostUsd: number;
  /** One phrase, for the log and for the attempt record. */
  reason: string;
};

/** Anthropic's published cache-read ratio, 0.1x the input rate, and the
 *  one every provider in the catalog is at least as good as. Used for
 *  BOTH sides of the comparison so the arithmetic never flatters the
 *  destination: a provider with a better discount is priced as if it had
 *  this one, which understates the saving rather than the loss. */
const CACHE_READ_RATIO = 0.1;

function inputCostUsd(model: CatalogModel, tokens: number, cached: boolean): number {
  const rate = cached ? model.inputPerMTok * CACHE_READ_RATIO : model.inputPerMTok;
  return (tokens / 1_000_000) * rate;
}

/**
 * What `tokens` of prefix cost at `modelId`, with this model's own cache
 * minimum applied.
 *
 * EXPORTED SO THE ROUTER USES THIS COST MODEL AND NOT A SECOND ONE. The
 * router (lib/ai/routing/route.ts) has to compare two models on the same
 * prefix to decide whether a downgrade is genuinely cheaper, and a
 * private copy of `rate = cached ? x * ratio : x` there would be a second
 * source of truth for the number that decides every route.
 *
 * Null for a model the catalog does not know: an unpriced model must not
 * be reported as free.
 */
export function prefixInputCostUsd(modelId: string | undefined, tokens: number): number | null {
  const model = catalogModel(modelId);
  if (!model) return null;
  return inputCostUsd(model, tokens, cachesOn(tokens, modelId));
}

/**
 * What moving this request from one model to another does to the cached
 * part of its prompt.
 *
 * Called BEFORE a failover is attempted, so the decision and the log
 * carry the same number.
 */
export function cacheImpactOfRoute(params: {
  fromModel: string | undefined;
  toModel: string | undefined;
  cachedPrefixTokens: number;
}): CacheImpact {
  const { fromModel, toModel } = params;
  const tokens = Math.max(0, Math.round(params.cachedPrefixTokens));
  const from = catalogModel(fromModel);
  const to = catalogModel(toModel);

  if (tokens === 0) {
    return {
      keptCache: null,
      lostTokens: 0,
      originCostUsd: 0,
      destinationCostUsd: 0,
      extraCostUsd: 0,
      reason: "no cached prefix in this request",
    };
  }
  if (!to) {
    return {
      keptCache: false,
      lostTokens: tokens,
      originCostUsd: from ? inputCostUsd(from, tokens, cachesOn(tokens, fromModel)) : 0,
      destinationCostUsd: 0,
      extraCostUsd: 0,
      reason: "destination model is not in the catalog — assume no cache",
    };
  }

  const cachedBefore = cachesOn(tokens, fromModel);
  const cachedAfter = cachesOn(tokens, toModel);
  const originCostUsd = from ? inputCostUsd(from, tokens, cachedBefore) : 0;
  const destinationCostUsd = inputCostUsd(to, tokens, cachedAfter);

  let reason: string;
  if (to.cacheMinimumTokens === null) {
    reason = `${to.provider} has no prompt cache — the whole ${tokens}-token prefix is billed as fresh input`;
  } else if (cachedBefore && !cachedAfter) {
    reason =
      `prefix is ${tokens} tokens; ${to.id} needs ${to.cacheMinimumTokens} to cache, ` +
      `so it stops caching on this route`;
  } else if (!cachedBefore && cachedAfter) {
    reason = `prefix did not cache at the origin and does cache on ${to.id}`;
  } else if (cachedAfter) {
    reason = "cache survives the route";
  } else {
    reason = `prefix is ${tokens} tokens and caches on neither model`;
  }

  return {
    keptCache: cachedAfter,
    lostTokens: cachedBefore && !cachedAfter ? tokens : 0,
    originCostUsd,
    destinationCostUsd,
    extraCostUsd: destinationCostUsd - originCostUsd,
    reason,
  };
}

/**
 * Is the "cheaper" model actually cheaper for THIS request?
 *
 * The headline rate says one thing and the prompt cache says another, and
 * only one of them is on the invoice. This answers with both counted.
 *
 * Output tokens are included because they are usually where the saving
 * genuinely is — omitting them would bias the answer the other way, and
 * a check that only ever says "do not switch" is as useless as one that
 * always says "switch".
 */
export function comparedRequestCostUsd(params: {
  fromModel: string;
  toModel: string;
  cachedPrefixTokens: number;
  freshInputTokens: number;
  expectedOutputTokens: number;
}): {
  fromUsd: number;
  toUsd: number;
  cheaper: "from" | "to" | "same";
  cacheImpact: CacheImpact;
} {
  const from = catalogModel(params.fromModel);
  const to = catalogModel(params.toModel);
  const cacheImpact = cacheImpactOfRoute({
    fromModel: params.fromModel,
    toModel: params.toModel,
    cachedPrefixTokens: params.cachedPrefixTokens,
  });

  const cost = (model: CatalogModel | null, cached: boolean) => {
    if (!model) return Number.POSITIVE_INFINITY;
    return (
      inputCostUsd(model, params.cachedPrefixTokens, cached) +
      inputCostUsd(model, params.freshInputTokens, false) +
      (params.expectedOutputTokens / 1_000_000) * model.outputPerMTok
    );
  };

  const fromUsd = cost(from, cachesOn(params.cachedPrefixTokens, params.fromModel));
  const toUsd = cost(to, cachesOn(params.cachedPrefixTokens, params.toModel));
  const cheaper = fromUsd === toUsd ? "same" : fromUsd < toUsd ? "from" : "to";
  return { fromUsd, toUsd, cheaper, cacheImpact };
}
