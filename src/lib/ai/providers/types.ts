/**
 * ONE SHAPE FOR A MODEL CALL, whoever serves it.
 *
 * WHY THIS FILE HAS NO SDK IMPORT. scripts/tests/load-ts.mjs cannot load a
 * module that pulls in a vendor SDK, and the rules that decide WHICH
 * provider serves a call — and whether the prompt cache survives the
 * decision — are exactly the rules that must be inside the build gate.
 * Same reasoning as lib/ai/cached-system.ts, which this file sits beside
 * and deliberately mirrors.
 *
 * THE REQUEST IS DELIBERATELY NARROWER THAN ANY ONE PROVIDER'S API. It is
 * the intersection this app actually uses, not the union of what four
 * vendors offer. A layer that exposes everything is a layer where a call
 * site can reach a feature only one provider has, and the failover it was
 * built for then cannot happen — the abstraction would be decoration.
 * Where a capability genuinely differs (server-side web search, prompt
 * caching, batch), it is declared on the provider rather than smuggled
 * into the request, and `requires` is how a call says it cannot do
 * without one.
 */

export const AI_PROVIDERS = ["anthropic", "openai", "google", "groq"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}

/**
 * The things a call can REQUIRE, and which therefore rule a provider out.
 *
 * Not a wishlist: each of these is something at least one provider in the
 * catalog cannot do, so a request that needs it must not be routed there.
 */
export const AI_CAPABILITIES = [
  "tool_calling",
  "streaming",
  "prompt_caching",
  "server_web_search",
  "batch",
] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

/**
 * WHAT IS CALLING. Routing is per-purpose, not global: "use Groq for the
 * cheap classification and Anthropic for the website builder" is the
 * whole reason a multi-provider layer is worth having, and a single
 * global provider setting cannot express it.
 *
 * Every purpose here maps to a real call site. A purpose nobody calls is
 * a config key that silently does nothing, which is why
 * scripts/tests/ai-providers.test.mjs checks this list against the
 * source rather than trusting it.
 */
export const AI_PURPOSES = [
  "chat",
  "agent_run",
  "agent_build",
  "research",
  "website_build",
  "create",
  "file_ask",
  "classification",
  "summarisation",
] as const;
export type AiPurpose = (typeof AI_PURPOSES)[number];

export function isAiPurpose(value: unknown): value is AiPurpose {
  return typeof value === "string" && (AI_PURPOSES as readonly string[]).includes(value);
}

/** Structurally identical to lib/ai/cached-system.ts's SystemTextBlock,
 *  and to Anthropic.TextBlockParam, so a call site that already builds a
 *  cached system prompt passes it straight through. */
export type AiSystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export type AiMessage = {
  role: "user" | "assistant";
  content: string | AiSystemBlock[];
};

export type AiToolSpec = {
  name: string;
  description: string;
  /** JSON Schema. Every provider here accepts one; they disagree only on
   *  where it sits in the request body, which is an adapter's problem. */
  inputSchema: Record<string, unknown>;
};

export type AiRequest = {
  purpose: AiPurpose;
  system: AiSystemBlock[];
  messages: AiMessage[];
  maxTokens: number;
  temperature?: number;
  tools?: AiToolSpec[];
  /**
   * Anthropic's server-side web search, when the call genuinely needs the
   * model to go and look things up.
   *
   * A REQUEST CARRYING THIS MUST ALSO REQUIRE "server_web_search". The
   * two are separate on purpose: `requires` is what the ROUTER filters
   * on, before any call, and this is what the ADAPTER sends. A request
   * that asked for search without requiring it could be routed to a
   * provider that has none, and would come back with a confident answer
   * built from nothing but training data — right-looking, unsourced, and
   * indistinguishable from a real one. The three adapters that cannot do
   * it therefore REFUSE rather than quietly dropping the field, and
   * scripts/tests/ai-providers.test.mjs checks that they do.
   */
  serverWebSearch?: { maxUses: number };
  /** Capabilities without which this call cannot be served. A provider
   *  lacking one is skipped BEFORE it is tried, not after it fails. */
  requires?: AiCapability[];
  /**
   * The model the caller wants, as a catalog id. Optional: the usual case
   * is to let the purpose's configured chain choose, and to name a model
   * only when the call site genuinely depends on one (the website builder
   * prices its estimate against a specific model in the browser).
   */
  model?: string;
};

/**
 * Token counts in the shape lib/billing/model-pricing.ts already prices.
 *
 * DELIBERATELY ANTHROPIC-SHAPED, and that is not laziness. Every adapter
 * maps its provider's usage into this, so ONE pricing function prices
 * every provider and one settlement path records every call. The
 * alternative — a usage type per provider — is four places for the
 * margin to be got wrong.
 *
 * A provider that does not report a field leaves it absent rather than
 * writing 0: `priceUsage` treats absent as zero anyway, and writing a
 * confident 0 for a number nobody measured is how "we have no cache
 * writes" and "we never looked" become indistinguishable.
 */
export type AiUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number | null;
    ephemeral_1h_input_tokens?: number | null;
  } | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: {
    web_search_requests?: number | null;
    web_fetch_requests?: number | null;
  } | null;
  service_tier?: string | null;
};

export type AiToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AiResult = {
  ok: true;
  provider: AiProvider;
  /** The catalog id, which is what the cost path prices against — never
   *  the raw string the provider echoed, which can be a dated snapshot. */
  model: string;
  /** What the provider actually said it served, kept alongside so a
   *  silent model substitution is visible in the log. */
  reportedModel: string;
  text: string;
  toolCalls: AiToolCall[];
  usage: AiUsage;
  stopReason: string | null;
  /** Every attempt, in order, including the ones that failed. This is
   *  the "log who was used and why" of the brief, and it is on the
   *  RESULT rather than only in a table so a caller can act on it. */
  attempts: AiAttempt[];
};

export type AiFailureKind =
  /** The caller's abort signal fired — the person pressed Stop (V4.6).
   *  Not a provider fault and never failed over. */
  | "aborted"
  /** No provider was configured for this purpose at all. */
  | "no_provider"
  /** Every configured provider was tried and none succeeded. */
  | "all_failed"
  /** The request itself is wrong — a 4xx nobody else will answer
   *  differently. Never failed over: see failover.ts. */
  | "bad_request"
  /** Ruled out before any call: no provider offers a required capability. */
  | "unsupported";

export type AiFailure = {
  ok: false;
  kind: AiFailureKind;
  /** For a log, never for a user. The user-facing sentence is chosen by
   *  the call site, in the user's language — that is the brief's
   *  "ο χρήστης ΔΕΝ το βλέπει". */
  detail: string;
  attempts: AiAttempt[];
};

export type AiOutcome = AiResult | AiFailure;

/** Why an attempt ended the way it did. Written to ai_provider_log. */
export const AI_ATTEMPT_OUTCOMES = [
  "success",
  /** Ruled out before the call: this provider has no model at the tier
   *  the request needs, or none offering a capability it requires. Not an
   *  error — a recorded decision, so a chain that never reaches its
   *  second provider does not look like a chain nobody configured. */
  "unsupported",
  "server_error",
  "rate_limited",
  "timeout",
  "network_error",
  "bad_request",
  "auth_error",
  "overloaded",
  "unknown_error",
] as const;
export type AiAttemptOutcome = (typeof AI_ATTEMPT_OUTCOMES)[number];

export type AiAttempt = {
  provider: AiProvider;
  model: string;
  outcome: AiAttemptOutcome;
  /** HTTP status when there was one. Null for a timeout or a socket
   *  error, which is a real distinction: "the service said no" and "we
   *  never heard back" call for different operational responses. */
  status: number | null;
  latencyMs: number;
  /**
   * WHY THIS PROVIDER, IN ONE PHRASE. "primary", "failover after
   * anthropic/server_error", "only provider offering batch". The brief
   * asks for who was used AND WHY, and a log with only the who is a log
   * that cannot answer the question anybody actually asks of it.
   */
  reason: string;
  /**
   * Whether the prompt cache survived being routed here. Null when the
   * request carries no cacheable prefix at all.
   *
   * See cache-policy.ts. This is on every attempt because it is the one
   * consequence of failover that is invisible everywhere else: the call
   * succeeds, the answer is right, and the bill quietly goes up.
   */
  cacheKept: boolean | null;
};
