import "server-only";
import {
  flattenContent,
  flattenSystem,
  postJson,
  refuseUnsupported,
  wireModelId,
  type AdapterCall,
  type AdapterResponse,
} from "@/lib/ai/providers/adapters/shared";
import type { AiToolCall } from "@/lib/ai/providers/types";

/**
 * GROQ, serving open models over an OpenAI-compatible endpoint.
 *
 * THE ONE THING TO REMEMBER ABOUT ROUTING HERE: there is no prompt cache.
 * Not a smaller one, not a different minimum — none. A request whose
 * system prompt was carefully built with a cache breakpoint pays full
 * input price for every token of it, on every call, and neither the
 * request nor the response says a word about it. catalog.ts records that
 * as `cacheMinimumTokens: null` and cache-policy.ts is what turns it into
 * a number a routing decision can weigh.
 *
 * NOT MERGED WITH THE OPENAI ADAPTER despite the shared wire format. The
 * compatibility is a courtesy Groq offers, not a contract it owes: the
 * usage block already differs (no prompt_tokens_details, because there is
 * nothing to report), and a shared file would make the next divergence a
 * conditional inside somebody else's adapter.
 */

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

type GroqResponse = {
  model?: string;
  choices?: {
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] | null;
    } | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

export async function callGroq(call: AdapterCall): Promise<AdapterResponse> {
  const { request } = call;
  refuseUnsupported("groq", request);
  const system = flattenSystem(request);

  const body: Record<string, unknown> = {
    model: wireModelId(call.model),
    max_tokens: request.maxTokens,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...request.messages.map((m) => ({ role: m.role, content: flattenContent(m.content) })),
    ],
  };
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.tools?.length) {
    body.tools = request.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
  }

  const raw = (await postJson({
    url: ENDPOINT,
    headers: { Authorization: `Bearer ${call.apiKey}` },
    body,
    signal: call.signal,
  })) as GroqResponse;

  const choice = raw.choices?.[0];
  const toolCalls: AiToolCall[] = (choice?.message?.tool_calls ?? []).map((tc, i) => ({
    id: tc.id ?? `tool_${i}`,
    name: tc.function?.name ?? "",
    input: safeParse(tc.function?.arguments),
  }));

  return {
    text: choice?.message?.content ?? "",
    toolCalls,
    usage: {
      // NO SUBTRACTION HERE, and that is not an oversight: with no cache,
      // prompt_tokens has no cached subset to remove. Writing
      // cache_read_input_tokens: 0 would be true and would also be the
      // one number that makes "Groq has no cache" indistinguishable from
      // "the cache missed this time" in the cost log.
      input_tokens: raw.usage?.prompt_tokens ?? 0,
      output_tokens: raw.usage?.completion_tokens ?? 0,
    },
    stopReason: choice?.finish_reason ?? null,
    reportedModel: raw.model ?? call.model,
  };
}

function safeParse(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
