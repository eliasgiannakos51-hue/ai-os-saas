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
 * GOOGLE, over the Gemini generateContent API.
 *
 * FOUR DIFFERENCES THAT ARE EASY TO GET WRONG:
 *
 *   THE ASSISTANT ROLE IS CALLED "model". Sending "assistant" is a 400,
 *   and a 400 does not fail over (failover.ts), so getting this wrong
 *   takes the request down rather than routing around it. That is the
 *   correct behaviour and it is also why this mapping is not a detail.
 *
 *   THE KEY GOES IN A HEADER, not a bearer token — x-goog-api-key.
 *
 *   TOOLS ARE FUNCTION DECLARATIONS nested one level deeper than
 *   anywhere else: `tools: [{ functionDeclarations: [...] }]`, with the
 *   schema under `parameters`.
 *
 *   promptTokenCount INCLUDES cachedContentTokenCount, the same trap as
 *   OpenAI. See splitPromptTokens.
 *
 * CACHING. The 2.5 family caches implicitly, and the minimum DIFFERS
 * BETWEEN FLASH AND PRO — 1,024 against 2,048. A route between two models
 * of the same family can therefore lose the cache, which is exactly the
 * kind of thing nobody thinks to check. catalog.ts carries both numbers.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiResponse = {
  modelVersion?: string;
  candidates?: {
    finishReason?: string | null;
    content?: {
      parts?: { text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }[];
    } | null;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  } | null;
};

export async function callGoogle(call: AdapterCall): Promise<AdapterResponse> {
  const { request } = call;
  refuseUnsupported("google", request);
  const system = flattenSystem(request);
  const model = wireModelId(call.model);

  const body: Record<string, unknown> = {
    contents: request.messages.map((m) => ({
      // "model", not "assistant".
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: flattenContent(m.content) }],
    })),
    generationConfig: {
      maxOutputTokens: request.maxTokens,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (request.tools?.length) {
    body.tools = [
      {
        functionDeclarations: request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        })),
      },
    ];
  }

  const raw = (await postJson({
    url: `${BASE}/${encodeURIComponent(model)}:generateContent`,
    headers: { "x-goog-api-key": call.apiKey },
    body,
    signal: call.signal,
  })) as GeminiResponse;

  const candidate = raw.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .map((p) => p.text ?? "")
    .filter(Boolean)
    .join("");
  const toolCalls: AiToolCall[] = parts
    .filter((p) => p.functionCall?.name)
    .map((p, i) => ({
      // Gemini does not issue tool-call ids. One is synthesised so the
      // unified shape holds — a caller matching a result back to a call
      // needs SOMETHING, and an index is stable within one response.
      id: `google_${i}`,
      name: p.functionCall?.name ?? "",
      input: p.functionCall?.args ?? {},
    }));

  const split = splitPromptTokens(
    raw.usageMetadata?.promptTokenCount ?? 0,
    raw.usageMetadata?.cachedContentTokenCount ?? 0
  );

  return {
    text,
    toolCalls,
    usage: {
      input_tokens: split.input_tokens,
      output_tokens: raw.usageMetadata?.candidatesTokenCount ?? 0,
      cache_read_input_tokens: split.cache_read_input_tokens,
    },
    stopReason: candidate?.finishReason ?? null,
    reportedModel: raw.modelVersion ?? call.model,
  };
}
