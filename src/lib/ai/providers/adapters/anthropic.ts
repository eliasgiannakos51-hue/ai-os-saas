import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AdapterCall, AdapterResponse } from "@/lib/ai/providers/adapters/shared";
import type { AiToolCall } from "@/lib/ai/providers/types";

/**
 * ANTHROPIC, through the SDK this app already depends on.
 *
 * THE ONLY ADAPTER THAT PASSES THE REQUEST THROUGH ALMOST UNCHANGED, and
 * that is by design rather than favouritism: the unified request in
 * types.ts was shaped from what this codebase's twenty-odd existing call
 * sites already send, so the adapter for the provider they were written
 * against is necessarily the thin one. The translation cost sits in the
 * other three files, where it belongs.
 *
 * CACHE MARKERS SURVIVE HERE AND ONLY HERE. `cache_control` on a system
 * block is passed straight through, which is what makes the breakpoints
 * lib/ai/cached-system.ts places actually do something. Every other
 * adapter drops them, because there is nothing on the other side to drop
 * them into.
 */
export async function callAnthropic(call: AdapterCall): Promise<AdapterResponse> {
  const { request } = call;
  const client = new Anthropic({ apiKey: call.apiKey });

  const response = await client.messages.create(
    {
      model: call.model,
      max_tokens: request.maxTokens,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      system: request.system as Anthropic.TextBlockParam[],
      messages: request.messages as Anthropic.MessageParam[],
      // BOTH KINDS OF TOOL IN ONE ARRAY. Anthropic's server tools (web
      // search) and our own client tools share `tools:`, which is why
      // this is assembled rather than branched: a request with both a
      // schema tool and search must send one array, and sending two
      // would silently drop whichever was written second.
      ...(() => {
        const tools: Anthropic.ToolUnion[] = [
          ...(request.tools ?? []).map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
          })),
          ...(request.serverWebSearch
            ? [
                {
                  type: "web_search_20250305" as const,
                  name: "web_search" as const,
                  max_uses: request.serverWebSearch.maxUses,
                },
              ]
            : []),
        ];
        return tools.length ? { tools } : {};
      })(),
    },
    { signal: call.signal }
  );

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  const toolCalls: AiToolCall[] = response.content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
    .map((block) => ({
      id: block.id,
      name: block.name,
      input: (block.input ?? {}) as Record<string, unknown>,
    }));

  return {
    text,
    toolCalls,
    // Passed through WHOLE, not rebuilt field by field. The usage shape in
    // types.ts is deliberately Anthropic's, and
    // scripts/tests/usage-field-coverage.test.mjs already requires every
    // field of it to be priced — copying selected fields here would be a
    // second place for a new one to go unnoticed.
    usage: response.usage,
    stopReason: response.stop_reason ?? null,
    reportedModel: response.model || call.model,
  };
}
