import "server-only";
import {
  flattenContent,
  flattenSystem,
  normaliseStopReason,
  postJson,
  refuseUnsupported,
  splitPromptTokens,
  wireModelId,
} from "@/lib/ai/providers/adapters/shared";
import { isImageBlock, type AdapterCall, type AdapterResponse, type AiContentBlock, type AiRequest, type AiToolCall } from "@/lib/ai/providers/types";

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

// RENAMED FROM `BASE` ON 2026-10-16, and the reason is the loader, not
// taste. adapters/shared.ts now imports providerSupports from
// catalog.ts (refuseUnsupported has to know whether this provider has a
// model that can see), and catalog.ts has its own top-level `BASE` —
// the capability list every row spreads. scripts/tests/load-ts.mjs
// bundles a module and its imports into ONE FLAT SCOPE and refuses two
// files declaring the same top-level name, so the gate died on
// "BASE is declared at the top level of BOTH". The URL is the one with
// the vaguer name, so it is the one that moved.
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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

/**
 * A message's content as Gemini's `parts`, which is always an array.
 *
 * ONE TEXT PART WHEN THERE IS NO PICTURE, which is byte-for-byte what
 * this adapter sent before — a picture adds parts rather than changing
 * the shape of every existing request.
 *
 * `inlineData`, camelCase, with `mimeType`: the REST v1beta body uses
 * camelCase throughout while Anthropic's uses snake_case, which is
 * exactly the sort of difference an adapter exists to absorb. Order is
 * preserved for the same reason as OpenAI's.
 */
function googleParts(content: AiRequest["messages"][number]["content"]): unknown[] {
  if (typeof content === "string") return [{ text: content }];
  const blocks = content as AiContentBlock[];
  if (!blocks.some(isImageBlock)) return [{ text: flattenContent(content) }];
  return blocks.map((b) =>
    isImageBlock(b)
      ? { inlineData: { mimeType: b.source.media_type, data: b.source.data } }
      : { text: b.text }
  );
}

export async function callGoogle(call: AdapterCall): Promise<AdapterResponse> {
  const { request } = call;
  refuseUnsupported("google", request);
  const system = flattenSystem(request);
  const model = wireModelId(call.model);

  const body: Record<string, unknown> = {
    contents: request.messages.map((m) => ({
      // "model", not "assistant".
      role: m.role === "assistant" ? "model" : "user",
      parts: googleParts(m.content),
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
    // GEMINI SPELLS IT SOMEWHERE ELSE ENTIRELY: not a field beside
    // `tools` but a `toolConfig` object, with the forced NAME in a list
    // rather than on the choice. Written out here rather than bent into
    // the OpenAI-shaped helper in shared.ts, which two adapters use
    // verbatim — one helper serving both would serve neither clearly.
    if (request.toolChoice) {
      const mode = request.toolChoice.type === "auto" ? "AUTO" : "ANY";
      body.toolConfig = {
        functionCallingConfig: {
          mode,
          ...(request.toolChoice.type === "tool"
            ? { allowedFunctionNames: [request.toolChoice.name] }
            : {}),
        },
      };
    }
  }

  const raw = (await postJson({
    url: `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`,
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
    stopReason: normaliseStopReason(candidate?.finishReason),
    reportedModel: raw.modelVersion ?? call.model,
  };
}
