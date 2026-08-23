import "server-only";
import {
  flattenContent,
  flattenSystem,
  postJson,
  refuseUnsupported,
  splitPromptTokens,
  wireModelId,
  type AdapterCall,
  type AdapterResponse,
} from "@/lib/ai/providers/adapters/shared";
import type { AiToolCall } from "@/lib/ai/providers/types";

/**
 * OPENAI, over the Chat Completions API.
 *
 * THREE THINGS THAT DIFFER FROM ANTHROPIC AND MATTER:
 *
 *   CACHING IS AUTOMATIC AND UNMARKED. There is no cache_control to send.
 *   A request carrying Anthropic's markers is not rejected — the markers
 *   are simply part of a text block OpenAI never looks at. The 1,024-token
 *   minimum still applies and is still silent below it, which is why
 *   cache-policy.ts, not this file, is what a routing decision consults.
 *
 *   prompt_tokens INCLUDES THE CACHED ONES. See splitPromptTokens: not
 *   subtracting them double-counts every cached token in the charge.
 *
 *   TOOLS ARE `function` OBJECTS, and the schema lives under `parameters`
 *   rather than `input_schema`. A tool-calling response puts the call in
 *   `message.tool_calls` with the arguments as a JSON *string*, which is
 *   parsed here rather than handed to a caller that would have to know
 *   which provider it came from.
 */

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

type OpenAiResponse = {
  model?: string;
  choices?: {
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] | null;
    } | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
  } | null;
};

export async function callOpenAi(call: AdapterCall): Promise<AdapterResponse> {
  const { request } = call;
  refuseUnsupported("openai", request);
  const system = flattenSystem(request);

  const body: Record<string, unknown> = {
    model: wireModelId(call.model),
    max_completion_tokens: request.maxTokens,
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
  })) as OpenAiResponse;

  const choice = raw.choices?.[0];
  const toolCalls: AiToolCall[] = (choice?.message?.tool_calls ?? []).map((tc, i) => ({
    id: tc.id ?? `tool_${i}`,
    name: tc.function?.name ?? "",
    // A model can emit arguments that are not valid JSON. An empty object
    // is a tool call the caller can reject on its own terms; a thrown
    // parse error here would be classified as unknown_error and would not
    // fail over, turning a bad generation into a dead request.
    input: safeParse(tc.function?.arguments),
  }));

  const promptTokens = raw.usage?.prompt_tokens ?? 0;
  const cachedTokens = raw.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const split = splitPromptTokens(promptTokens, cachedTokens);

  return {
    text: choice?.message?.content ?? "",
    toolCalls,
    usage: {
      input_tokens: split.input_tokens,
      output_tokens: raw.usage?.completion_tokens ?? 0,
      cache_read_input_tokens: split.cache_read_input_tokens,
      // NO cache_creation_input_tokens, and absent rather than zero:
      // OpenAI does not charge a write premium and does not report one,
      // so a confident 0 here would claim a measurement nobody made.
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
