import { AI_TRUNCATED_STOP_REASON, isImageBlock, type AiContentBlock, type AiImageBlock, type AiProvider, type AiRequest, type AiToolCall, type AiUsage } from "@/lib/ai/providers/types";
import { providerSupports } from "@/lib/ai/providers/catalog";

/**
 * What every adapter is, and the small amount they can share.
 *
 * NO SDKs FOR THE THREE NEW PROVIDERS. OpenAI, Google and Groq are called
 * over plain fetch against their documented REST endpoints, deliberately:
 * adding three vendor SDKs to package.json means three dependencies whose
 * behaviour cannot be exercised in this environment — no key, no network
 * to them — shipping into a build that a user runs. A fetch call is
 * something the build gate can read, a test can stub, and a reviewer can
 * check against the vendor's documentation line by line.
 *
 * Anthropic keeps its SDK because it is already a dependency, is already
 * used by every existing call site, and handles streaming and beta
 * headers this app already depends on.
 */

// AdapterCall, AdapterResponse and Adapter now live in
// lib/ai/providers/types.ts — see the note there. They moved because
// complete.ts needs `Adapter` and a TYPE import of this file was enough
// to put every function below onto the graph of every call site in the
// app, which broke a test suite that loads one of them beside a module
// with its own `postJson`.

/** `openai/gpt-5` -> `gpt-5`. Anthropic ids carry no namespace. */
export function wireModelId(catalogId: string): string {
  const slash = catalogId.indexOf("/");
  return slash === -1 ? catalogId : catalogId.slice(slash + 1);
}

/** The system prompt as one string, for providers with no notion of
 *  system BLOCKS. Cache markers are dropped, not translated: OpenAI,
 *  Google and Groq all decide caching themselves and there is nothing to
 *  translate them into. cache-policy.ts is what knows the consequence. */
export function flattenSystem(request: AiRequest): string {
  return request.system.map((b) => b.text).join("\n\n");
}

/**
 * A message as one string, for a body that has no notion of parts.
 *
 * IT REFUSES A PICTURE RATHER THAN SKIPPING ONE, and that line is the
 * whole point of the function now. It used to be
 * `content.map((b) => b.text).join()`, which on an image block yields
 * the literal string "undefined" — the model would answer about the
 * words alone, confidently, with a stray word in the prompt, and
 * nothing anywhere would say a picture had been dropped. That is the
 * failure refuseUnsupported exists to prevent for the web search, one
 * field along.
 *
 * It throws rather than returns, because every caller of this is
 * mid-way through building a request body and has nowhere to put an
 * error. A ProviderHttpError(400) is classified bad_request, which does
 * NOT fail over — correct here: handing the same picture to the next
 * provider that cannot see is not resilience.
 */
export function flattenContent(content: AiRequest["messages"][number]["content"]): string {
  if (typeof content === "string") return content;
  const picture = content.find(isImageBlock);
  if (picture) {
    throw new ProviderHttpError(
      400,
      "a message carries an image and this body can only carry text; the request should have required \"vision\""
    );
  }
  return content.map((b) => (b as { text: string }).text).join("\n\n");
}

/** Every image block in the request, in the order they were sent. */
export function imageBlocksOf(request: AiRequest): AiImageBlock[] {
  return request.messages.flatMap((m) =>
    typeof m.content === "string" ? [] : (m.content as AiContentBlock[]).filter(isImageBlock)
  );
}

/**
 * An error carrying the HTTP status, which is what failover.ts classifies
 * on. A thrown Response body without its status is an error that can only
 * be classified as "unknown", and unknown errors do not fail over.
 */
export class ProviderHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
  }
}

export async function postJson(params: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal;
}): Promise<unknown> {
  const response = await fetch(params.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...params.headers },
    body: JSON.stringify(params.body),
    signal: params.signal,
  });
  if (!response.ok) {
    // The body is read for the LOG, never for the user, and it is capped:
    // some providers return an HTML error page, and a 40 KB string in a
    // log line is a log nobody reads.
    const detail = await response.text().catch(() => "");
    throw new ProviderHttpError(response.status, detail.slice(0, 500) || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * ANTHROPIC REPORTS input_tokens EXCLUDING CACHE READS; OPENAI AND GOOGLE
 * INCLUDE THEM. This one difference is worth its own function.
 *
 * `usage.prompt_tokens` at OpenAI is the WHOLE prompt, with
 * `prompt_tokens_details.cached_tokens` a subset of it. Copying that
 * straight into an Anthropic-shaped `input_tokens` and also filling
 * `cache_read_input_tokens` counts every cached token TWICE — once at the
 * full input rate and once at the cache-read rate. The charge comes out
 * ~10% high per cached token, always in the same direction, and it looks
 * completely healthy: the margin computed from it is fine, the number is
 * simply wrong, and nothing in the product could tell.
 *
 * Subtracting keeps one meaning for `input_tokens` across every provider,
 * which is what lets lib/billing/model-pricing.ts price all four.
 */
export function splitPromptTokens(totalPromptTokens: number, cachedTokens: number): {
  input_tokens: number;
  cache_read_input_tokens: number;
} {
  const cached = Math.max(0, Math.round(cachedTokens || 0));
  const total = Math.max(0, Math.round(totalPromptTokens || 0));
  return {
    // Clamped at zero rather than trusted: a provider reporting more
    // cached tokens than prompt tokens is reporting nonsense, and a
    // negative input count would price as a CREDIT.
    input_tokens: Math.max(0, total - cached),
    cache_read_input_tokens: Math.min(cached, total),
  };
}

/**
 * Refuses a request this provider cannot serve honestly.
 *
 * The one that matters is server-side web search. Dropping the field and
 * answering anyway produces a confident, unsourced answer that looks
 * exactly like a researched one — the worst possible failure for a
 * feature whose entire value is that it went and looked. Throwing a
 * ProviderHttpError with a 400 means failover.ts classifies it as
 * `bad_request`, which does NOT fail over: the chain stops and the caller
 * is told, rather than three providers taking turns to answer without
 * searching.
 */
export function refuseUnsupported(provider: AiProvider, request: AiRequest): void {
  if (request.serverWebSearch) {
    throw new ProviderHttpError(
      400,
      `${provider} has no server-side web search; refusing to answer a research request without it`
    );
  }
  // THE SECOND THING THAT MUST NOT BE QUIETLY DROPPED. The router should
  // never send a picture here — a request carrying one declares
  // `requires: ["vision"]` and resolveChain rules out a provider with no
  // vision model before any call. This is the refusal of last resort, in
  // the same place and for the same reason as the search above: an
  // answer about the words of a question whose subject was the picture
  // is wrong in a way the person cannot see.
  if (!providerSupports(provider, "vision") && imageBlocksOf(request).length > 0) {
    throw new ProviderHttpError(
      400,
      `${provider} has no model that can see an image; refusing to answer about the text alone`
    );
  }
}

/**
 * A tool choice in the shape OpenAI defined and Groq copied.
 *
 * Shared because two adapters send exactly this; Google's is a different
 * object in a different place and lives in google.ts rather than being
 * bent into one helper that serves neither clearly.
 *
 * Returns undefined when there is nothing to send, so a caller can spread
 * it conditionally — and when `tools` is empty, because both APIs reject
 * a tool_choice with no tools and a 400 here would be classified as
 * bad_request and stop the chain for a request that was fine.
 */
export function openAiToolChoice(
  request: AiRequest
): "auto" | "required" | { type: "function"; function: { name: string } } | undefined {
  const choice = request.toolChoice;
  if (!choice || !request.tools?.length) return undefined;
  if (choice.type === "auto") return "auto";
  if (choice.type === "any") return "required";
  return { type: "function", function: { name: choice.name } };
}

/**
 * EVERY VENDOR'S WORD FOR "IT RAN OUT OF ROOM", TURNED INTO OURS.
 *
 * WHAT WAS WRONG, and it was live before any of this migration.
 * lib/verification/truncation.ts decides `truncated` by comparing the
 * stop reason to Anthropic's "max_tokens", and the three fetch adapters
 * passed their provider's own word through untouched: OpenAI and Groq
 * report finish_reason "length", Gemini reports finishReason
 * "MAX_TOKENS". So an answer cut off at the ceiling by any provider but
 * Anthropic came back with truncated: false — delivered whole, with no
 * mark, reading as a short answer. agent-runner.ts already goes through
 * the router, so this was reachable the day a second key was set.
 *
 * Same reasoning as splitPromptTokens above: ONE meaning for a field,
 * made here, rather than four meanings and a comparison that is right
 * for one of them.
 *
 * A reason this does not recognise is passed through unchanged, which
 * is what the adapters did for all of them before — so a vendor that
 * invents a new word is no worse off than today, and the gate asserts
 * the three it does know.
 */
const TRUNCATION_WORDS = new Set(["max_tokens", "length", "MAX_TOKENS"]);

export function normaliseStopReason(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  return TRUNCATION_WORDS.has(raw) ? AI_TRUNCATED_STOP_REASON : raw;
}

export function emptyUsage(): AiUsage {
  return { input_tokens: 0, output_tokens: 0 };
}
