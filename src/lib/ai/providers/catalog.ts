import type { AiCapability, AiProvider } from "@/lib/ai/providers/types";

/**
 * THE MODELS THIS LAYER CAN ROUTE TO, what they cost, and what they can
 * do — one table, no SDK import, so the build gate can read it.
 *
 * ============================================================
 * READ THIS BEFORE ENABLING A SECOND PROVIDER
 * ============================================================
 *
 * THE NON-ANTHROPIC PRICES BELOW WERE NOT VERIFIED AGAINST A LIVE
 * ACCOUNT. There is no OPENAI_API_KEY, GOOGLE_API_KEY or GROQ_API_KEY in
 * the environment this was written in, so not one of these numbers was
 * confirmed by a bill. They are the vendors' published list prices as
 * documented, written down so the layer is complete and checkable — and
 * they are the numbers the credit charge would be computed from.
 *
 * The whole margin guarantee is `charge >= 4 x real cost`, and it is only
 * as true as this table. A price entered 10x too low charges a tenth of
 * what it should while the stored margin still reads a healthy 4x, which
 * is precisely the failure lib/billing/model-pricing.ts's own header
 * describes having already happened once with a one-row table.
 *
 * So: a provider is OFF until somebody sets its key, and setting its key
 * is a statement that these numbers were checked. registry.ts logs a
 * warning naming this file the first time an unverified provider is
 * enabled in a process.
 *
 * ============================================================
 * THE CACHE MINIMUM IS THE TRAP
 * ============================================================
 *
 * Prompt caching does not fail loudly. Below a model's minimum prefix
 * length the provider simply does not cache, reports nothing unusual, and
 * bills full price. lib/ai/cached-system.ts already carries this rule for
 * Anthropic; ROUTING makes it worse, because the minimum is a property of
 * the destination and failover changes the destination.
 *
 *   claude-sonnet-4-6   1,024 tokens
 *   claude-haiku-4-5    4,096 tokens   <- FOUR TIMES Sonnet's, on the
 *                                         CHEAPER model
 *   openai/gpt-5        1,024 tokens, automatic, no markers
 *   google/gemini-2.5-pro 2,048 tokens
 *   groq/*              NO PROMPT CACHING AT ALL
 *
 * Routing a chat turn with a 20,000-token cached prefix "down" to Groq to
 * save money re-bills that prefix at full input price on every request.
 * cache-policy.ts is where that arithmetic lives, and it is why this
 * layer refuses to treat a fallback as free.
 */

export type CatalogModel = {
  /** Catalog id. Namespaced for every provider except Anthropic, whose
   *  bare ids are already load-bearing across this codebase (ai-models.ts,
   *  model-pricing.ts, agent-depth.ts) and are not going to be renamed
   *  for tidiness. */
  id: string;
  provider: AiProvider;
  inputPerMTok: number;
  outputPerMTok: number;
  /**
   * Minimum cacheable prefix in tokens, or null when the provider offers
   * no prompt caching for this model.
   *
   * NULL AND ZERO ARE NOT THE SAME. Zero would mean "everything caches";
   * null means "nothing does". Writing 0 for Groq would make
   * cacheImpactOfRoute report a kept cache on a provider that has no
   * cache, which is the exact silent-loss this module exists to prevent.
   */
  cacheMinimumTokens: number | null;
  /** Rough capability tier, used only to pick a sane substitute when a
   *  failover has to change model. Not a quality claim. */
  tier: "small" | "mid" | "large";
  capabilities: readonly AiCapability[];
};

/** What every text model here can do, so the per-model lists show only
 *  what is genuinely unusual about that model. */
const BASE: readonly AiCapability[] = ["tool_calling", "streaming"];

/**
 * ANTHROPIC. Prices come from lib/billing/model-pricing.ts, which is the
 * single source for them and is NOT duplicated here — this table carries
 * only the routing facts. The numbers below are repeated for the
 * catalog's own arithmetic and are asserted equal to model-pricing.ts's
 * by scripts/tests/ai-providers.test.mjs, so the two cannot drift.
 */
const ANTHROPIC_MODELS: CatalogModel[] = [
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheMinimumTokens: 1024,
    tier: "mid",
    capabilities: [...BASE, "prompt_caching", "server_web_search", "batch"],
  },
  {
    id: "claude-opus-4-6",
    provider: "anthropic",
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheMinimumTokens: 4096,
    tier: "large",
    capabilities: [...BASE, "prompt_caching", "server_web_search", "batch"],
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    inputPerMTok: 1,
    outputPerMTok: 5,
    // FOUR TIMES Sonnet's minimum, on the cheaper model. This one row is
    // the reason cache-policy.ts exists.
    cacheMinimumTokens: 4096,
    tier: "small",
    capabilities: [...BASE, "prompt_caching", "server_web_search", "batch"],
  },
];

/**
 * OPENAI. Prompt caching is AUTOMATIC — there is no cache_control to
 * place, and a request carrying Anthropic's markers is not an error, the
 * markers are simply ignored. The 1,024-token minimum still applies, and
 * it is still silent below that.
 */
const OPENAI_MODELS: CatalogModel[] = [
  {
    id: "openai/gpt-5",
    provider: "openai",
    inputPerMTok: 1.25,
    outputPerMTok: 10,
    cacheMinimumTokens: 1024,
    tier: "large",
    capabilities: [...BASE, "prompt_caching", "batch"],
  },
  {
    id: "openai/gpt-5-mini",
    provider: "openai",
    inputPerMTok: 0.25,
    outputPerMTok: 2,
    cacheMinimumTokens: 1024,
    tier: "small",
    capabilities: [...BASE, "prompt_caching", "batch"],
  },
  {
    id: "openai/gpt-4.1",
    provider: "openai",
    inputPerMTok: 2,
    outputPerMTok: 8,
    cacheMinimumTokens: 1024,
    tier: "mid",
    capabilities: [...BASE, "prompt_caching", "batch"],
  },
];

/**
 * GOOGLE. Implicit caching on the 2.5 family, with a minimum that DIFFERS
 * BETWEEN FLASH AND PRO — 1,024 against 2,048. A route between two models
 * of the same family can therefore lose the cache, which is not something
 * anybody expects to have to check.
 */
const GOOGLE_MODELS: CatalogModel[] = [
  {
    id: "google/gemini-2.5-pro",
    provider: "google",
    inputPerMTok: 1.25,
    outputPerMTok: 10,
    cacheMinimumTokens: 2048,
    tier: "large",
    capabilities: [...BASE, "prompt_caching"],
  },
  {
    id: "google/gemini-2.5-flash",
    provider: "google",
    inputPerMTok: 0.3,
    outputPerMTok: 2.5,
    cacheMinimumTokens: 1024,
    tier: "small",
    capabilities: [...BASE, "prompt_caching"],
  },
];

/**
 * GROQ, serving open models. Fast and cheap, and it has NO PROMPT CACHE.
 *
 * That is the whole reason `cacheMinimumTokens: null` exists as a value.
 * A 20,000-token cached prefix that costs ~$0.006 to read on Sonnet costs
 * full input price here on every single request — and at Groq's rates
 * that is $0.0118, twice as much, on the provider chosen to be cheaper.
 * The arithmetic is in cache-policy.ts and the layer will say so rather
 * than let it be discovered on a bill.
 */
const GROQ_MODELS: CatalogModel[] = [
  {
    id: "groq/llama-3.3-70b-versatile",
    provider: "groq",
    inputPerMTok: 0.59,
    outputPerMTok: 0.79,
    cacheMinimumTokens: null,
    tier: "mid",
    capabilities: [...BASE],
  },
  {
    id: "groq/llama-3.1-8b-instant",
    provider: "groq",
    inputPerMTok: 0.05,
    outputPerMTok: 0.08,
    cacheMinimumTokens: null,
    tier: "small",
    capabilities: [...BASE],
  },
];

export const AI_CATALOG: readonly CatalogModel[] = [
  ...ANTHROPIC_MODELS,
  ...OPENAI_MODELS,
  ...GOOGLE_MODELS,
  ...GROQ_MODELS,
];

/**
 * Providers whose prices in this file have NOT been confirmed against a
 * live account. Anthropic's have — they are the ones this app has been
 * billing against for months, in lib/billing/model-pricing.ts.
 */
export const UNVERIFIED_PRICE_PROVIDERS: readonly AiProvider[] = ["openai", "google", "groq"];

export function catalogModel(id: string | undefined): CatalogModel | null {
  if (!id) return null;
  const trimmed = id.trim().toLowerCase();
  const exact = AI_CATALOG.find((m) => m.id === trimmed);
  if (exact) return exact;
  // A dated snapshot or a deployment variant of a model the catalog
  // knows — the same normalisation lib/billing/model-pricing.ts applies,
  // for the same reason: those are the same model, not an unknown one.
  const bare = trimmed.replace(/\[[^\]]*\]$/, "").replace(/-\d{8}$/, "");
  return AI_CATALOG.find((m) => m.id === bare) ?? null;
}

export function modelsForProvider(provider: AiProvider): CatalogModel[] {
  return AI_CATALOG.filter((m) => m.provider === provider);
}

export function providerSupports(provider: AiProvider, capability: AiCapability): boolean {
  return modelsForProvider(provider).some((m) => m.capabilities.includes(capability));
}

/**
 * The model this provider should serve a request with, given what the
 * request needs and roughly how capable the original was.
 *
 * SAME TIER OR BETTER, NEVER WORSE. A failover that quietly drops from a
 * large model to a small one produces an answer — a worse one — and
 * nothing anywhere says so. Returning null instead means the provider is
 * skipped and the next one is tried, which is a visible outcome.
 */
export function substituteModel(
  provider: AiProvider,
  tier: CatalogModel["tier"],
  requires: readonly AiCapability[]
): CatalogModel | null {
  const order: CatalogModel["tier"][] = ["small", "mid", "large"];
  const wanted = order.indexOf(tier);
  // FAIL CLOSED, not "anything will do". `tier` is typed, so -1 is
  // unreachable today; the reason for the branch is what -1 would MEAN
  // here — `order.indexOf(m.tier) >= -1` is true for every model, so the
  // filter would stop filtering and the cheapest model in the catalogue
  // would answer a request for a large one. A caller that asked for a
  // capability and quietly got a smaller model is worse than one that got
  // null and fell back.
  if (wanted < 0) return null;
  const candidates = modelsForProvider(provider)
    .filter((m) => requires.every((c) => m.capabilities.includes(c)))
    .filter((m) => order.indexOf(m.tier) >= wanted)
    // Cheapest adequate one, by input price: they all clear the bar, so
    // the tie-break is cost rather than an arbitrary table order.
    .sort((a, b) => a.inputPerMTok - b.inputPerMTok);
  return candidates[0] ?? null;
}
