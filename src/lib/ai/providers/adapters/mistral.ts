import "server-only";
import {
  flattenContent,
  flattenSystem,
  normaliseStopReason,
  openAiToolChoice,
  postJson,
  refuseUnsupported,
  wireModelId,
} from "@/lib/ai/providers/adapters/shared";
import type { AdapterCall, AdapterResponse, AiToolCall } from "@/lib/ai/providers/types";

/**
 * MISTRAL AI, LA PLATEFORME — the EU provider «Μόνο Ευρώπη» (eu-only.ts)
 * exists to route to, over the same OpenAI-compatible chat/completions
 * shape Groq serves. Mirrors adapters/groq.ts line for line where the
 * wire format agrees; see that file's own header for why this is not
 * merged with openai.ts despite the compatibility — the same courtesy,
 * not a contract, applies here too.
 *
 * NO PROMPT CACHE DECLARED (catalog.ts). Nothing here places a cache
 * marker, for the same reason Groq's adapter does not: there is nothing
 * documented to place one in.
 */

const ENDPOINT = "https://api.mistral.ai/v1/chat/completions";

type MistralResponse = {
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

export async function callMistral(call: AdapterCall): Promise<AdapterResponse> {
  const { request } = call;
  refuseUnsupported("mistral", request);
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
    const choice = openAiToolChoice(request);
    if (choice !== undefined) body.tool_choice = choice;
  }

  const raw = (await postJson({
    url: ENDPOINT,
    headers: { Authorization: `Bearer ${call.apiKey}` },
    body,
    signal: call.signal,
  })) as MistralResponse;

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
      // NO SUBTRACTION, as groq.ts: with no cache, prompt_tokens has no
      // cached subset to remove.
      input_tokens: raw.usage?.prompt_tokens ?? 0,
      output_tokens: raw.usage?.completion_tokens ?? 0,
    },
    stopReason: normaliseStopReason(choice?.finish_reason),
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
