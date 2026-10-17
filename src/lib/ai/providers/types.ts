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
  /**
   * DECLARED BY NO MODEL TODAY, AND THAT IS THE HONEST STATE.
   *
   * Until 2026-10-16 every one of the eleven catalog rows claimed this,
   * through BASE in catalog.ts — and no adapter streams. `requires:
   * ["streaming"]` therefore passed resolveChain's filter, routed
   * happily, and came back buffered: the router acting on a declaration
   * that was false. Nothing asked for it yet, so nothing was broken;
   * the lie was waiting for the first caller.
   *
   * The name stays in this list so a request CAN ask, and get the true
   * answer — an empty chain, kind "unsupported". It goes back into
   * catalog.ts the same day an adapter can stream, and
   * ai-providers.test.mjs holds the two together BOTH WAYS.
   */
  "streaming",
  "prompt_caching",
  "server_web_search",
  /**
   * An image inside a user message. Per MODEL rather than per provider:
   * Groq's two Llama rows cannot see one and Gemini's two can, so a
   * request carrying a picture must be routed by this and not by a
   * provider name.
   */
  "vision",
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

/** The picture formats every vision model in the catalog accepts, and
 *  the only ones the app produces: lib/attachment-image-server.ts
 *  re-encodes to JPEG or PNG, and the website builder's reference images
 *  add WEBP. A format outside this list is a format one of the four
 *  providers would reject at the wire, which is a 400 nobody can act on. */
export const AI_IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AiImageMediaType = (typeof AI_IMAGE_MEDIA_TYPES)[number];

/**
 * A PICTURE IN A MESSAGE, AS BYTES — never as a URL.
 *
 * Every image this app sends is already in its own storage and is
 * downloaded, resized and base64-encoded on the server before the call
 * (lib/attachment-image-server.ts, the website builder's reference
 * images). A URL variant would be a second code path whose only user
 * would be a provider fetching a link we did not check, which is a
 * request made from our account to somewhere a person chose.
 *
 * NO DOCUMENT BLOCK. A PDF reaches the model as TEXT today, extracted
 * page by page with its page markers kept (lib/chat/attachments.ts), and
 * that is what every citation of a page number is built from. A native
 * document block would be an Anthropic-only shape with three silent
 * drops behind it — exactly what AiRequest exists to prevent.
 */
export type AiImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: AiImageMediaType; data: string };
};

/** What a message may carry. The system prompt stays text-only: a cache
 *  breakpoint on a picture is not a thing any provider offers. */
export type AiContentBlock = AiSystemBlock | AiImageBlock;

export function isImageBlock(block: AiContentBlock): block is AiImageBlock {
  return block.type === "image";
}

export type AiMessage = {
  role: "user" | "assistant";
  /**
   * A REQUEST CARRYING AN IMAGE MUST ALSO REQUIRE "vision", for the same
   * reason serverWebSearch must require server_web_search: `requires` is
   * what the ROUTER filters on before any call, and this is what the
   * ADAPTER sends. Without the first, a picture can be handed to a model
   * that cannot see — and the three adapters that build their body from
   * flattened text would drop it and answer about the words alone, which
   * is the failure that looks like success. flattenContent REFUSES a
   * non-text block rather than skipping it, and
   * scripts/tests/ai-providers.test.mjs ranges the rule over the tree.
   */
  content: string | AiContentBlock[];
};

export type AiToolSpec = {
  name: string;
  description: string;
  /** JSON Schema. Every provider here accepts one; they disagree only on
   *  where it sits in the request body, which is an adapter's problem. */
  inputSchema: Record<string, unknown>;
};

/**
 * WHETHER THE MODEL MAY CALL A TOOL, MUST CALL ONE, OR MUST CALL A NAMED
 * ONE — and this is not a convenience.
 *
 * Twenty-one of this repository's model calls give the model exactly one
 * tool and force it, because the tool's input schema IS the answer: the
 * caller reads `toolCalls[0].input` and parses nothing. Posts, slides,
 * the website builder, the planner, every classifier. Left to decide for
 * itself, a model answers some of those in prose — and then `toolCalls`
 * is empty, the caller has nothing to read, and the account has been
 * charged for a call that produced no usable output.
 *
 * So this is in the request, not smuggled into a provider's own options,
 * and every adapter forwards it in its own spelling:
 *
 *   anthropic  tool_choice: { type: "auto" | "any" | "tool", name? }
 *   openai     tool_choice: "auto" | "required" | { type: "function", … }
 *   groq       the same, OpenAI-compatible
 *   google     toolConfig.functionCallingConfig.mode AUTO | ANY, with
 *              allowedFunctionNames for a named one
 *
 * All four can express all three, which is what makes it part of the
 * intersection this type is allowed to carry rather than an
 * Anthropic-only field with three silent drops behind it. A provider that
 * could NOT force a tool would have to refuse the request the way
 * serverWebSearch is refused in adapters/shared.ts — dropping it and
 * answering anyway is the failure that looks like success.
 */
/**
 * THE ONE SPELLING OF "IT RAN OUT OF ROOM", across four vendors.
 *
 * Each provider has its own word for it — Anthropic's stop_reason is
 * "max_tokens", OpenAI and Groq say finish_reason "length", Gemini says
 * finishReason "MAX_TOKENS" — and the adapters translate theirs into
 * this one before it leaves them, exactly as splitPromptTokens gives
 * input_tokens one meaning across all four.
 *
 * WHY IT LIVES HERE rather than in lib/verification/truncation.ts,
 * which is where the rule is applied: that file carries a type import
 * of the Anthropic SDK, and anything the adapters' shared helpers
 * import ends up on runCompletion's graph, which must stay free of
 * vendor packages (ΛΘ-17, ai-providers.test.mjs §0b). truncation.ts
 * re-exports this as TRUNCATION_STOP_REASON, so there is still exactly
 * one literal and every existing reader is unchanged.
 */
export const AI_TRUNCATED_STOP_REASON = "max_tokens";

export type AiToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "tool"; name: string };

export type AiRequest = {
  purpose: AiPurpose;
  system: AiSystemBlock[];
  messages: AiMessage[];
  maxTokens: number;
  temperature?: number;
  tools?: AiToolSpec[];
  /** Ignored when `tools` is empty — every provider rejects a choice with
   *  nothing to choose from, so the adapters send it only alongside
   *  tools. See AiToolChoice for why this is in the request at all. */
  toolChoice?: AiToolChoice;
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

/**
 * ONE SOURCE A MODEL ACTUALLY READ, as the provider reported it.
 *
 * NOT A URL THE MODEL TYPED. Anthropic's server-side web search attaches
 * citation blocks to the text it wrote, and those name pages the tool
 * really fetched. A model asked for its sources in prose will happily
 * produce a plausible URL that 404s, and a source list nobody can open
 * is worse than none: it reads as evidence. So this comes from the
 * provider's own citation blocks and from nowhere else.
 *
 * TWO FIELDS, BECAUSE THAT IS WHAT EVERY READER USES. Anthropic's blocks
 * also carry `cited_text` and an encrypted index; lib/research only ever
 * numbers and links the page. Carrying more would be carrying a shape
 * only one provider can fill.
 */
export type AiCitation = {
  url: string;
  title: string;
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
  /**
   * ABSENT AND EMPTY ARE DIFFERENT ANSWERS, and this field exists
   * because the difference is the whole point.
   *
   * `[]` means the provider CAN report citations and this answer had
   * none — the searches found nothing worth citing. `undefined` means
   * the provider cannot report them at all, so the answer's sources are
   * unknown rather than absent. A caller that needs sources (Deep
   * Research puts one under every finding) must refuse the second case;
   * if the two were the same value it could not tell them apart, and a
   * report whose claims point nowhere looks exactly like one whose
   * searches came back empty.
   *
   * Today only Anthropic fills it, because only Anthropic's models carry
   * the `server_web_search` capability (catalog.ts) and the other three
   * adapters refuse such a request outright (refuseUnsupported in
   * adapters/shared.ts) rather than answering without the web.
   */
  citations?: AiCitation[];
  usage: AiUsage;
  stopReason: string | null;
  /** Every attempt, in order, including the ones that failed. This is
   *  the "log who was used and why" of the brief, and it is on the
   *  RESULT rather than only in a table so a caller can act on it. */
  attempts: AiAttempt[];
};

/**
 * THE ADAPTER'S OWN SHAPE — here rather than in adapters/shared.ts, and
 * the reason is the same one that made the adapters lazy (ΛΘ-17), found
 * one layer along on 2026-10-15.
 *
 * complete.ts needs the `Adapter` TYPE to declare its lazy loader map.
 * While that type lived in adapters/shared.ts, a `import type` was
 * enough to put that whole module on complete.ts's static graph — and
 * therefore on the graph of EVERY file that calls runCompletion.
 * scripts/tests/load-ts.mjs bundles a module and its imports into ONE
 * FLAT SCOPE, so those files inherited ten more top-level names
 * (postJson, ProviderHttpError, splitPromptTokens, emptyUsage,
 * flattenSystem, flattenContent, wireModelId, refuseUnsupported,
 * openAiToolChoice, normaliseStopReason) and any app module that
 * happens to declare one of them can no longer be loaded beside them.
 *
 * It happened the same day: lib/agents/deliver.ts has its own private
 * `postJson`, automations.itest.mjs loads the automation runner and the
 * delivery path together, and the suite died with "postJson is declared
 * at the top level of BOTH". A type import is free at runtime and is
 * NOT free to the loader — which is the whole point of this note.
 *
 * These three reference only types already in this file, so moving them
 * here adds no import anywhere. ai-providers.test.mjs §0b holds the
 * graph: no bare package, and no path from complete.ts to
 * adapters/shared.ts.
 */
export type AdapterCall = {
  apiKey: string;
  /** The PROVIDER's own model id — the catalog id with its namespace
   *  prefix removed. See wireModelId in adapters/shared.ts. */
  model: string;
  request: AiRequest;
  signal: AbortSignal;
};

export type AdapterResponse = {
  text: string;
  toolCalls: AiToolCall[];
  /** Set only by an adapter whose provider reports them; left ABSENT,
   *  never `[]`, by the three that cannot. See AiResult.citations. */
  citations?: AiCitation[];
  usage: AiUsage;
  stopReason: string | null;
  /** Whatever the provider said it served. Kept verbatim so a silent
   *  model substitution shows up in the log rather than being normalised
   *  away. */
  reportedModel: string;
};

export type Adapter = (call: AdapterCall) => Promise<AdapterResponse>;

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
