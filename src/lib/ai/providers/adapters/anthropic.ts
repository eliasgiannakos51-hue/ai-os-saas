import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AdapterCall, AdapterResponse, AiToolCall } from "@/lib/ai/providers/types";
import { citationsFromAnthropicContent } from "@/lib/ai/providers/citations";

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
        if (!tools.length) return {};
        // SENT ONLY ALONGSIDE TOOLS, and the shape is already ours:
        // AiToolChoice was defined as Anthropic's three cases, so there
        // is nothing to translate here and three things to translate in
        // the other adapters. See types.ts for why forcing a tool is a
        // request field rather than a per-provider option.
        return request.toolChoice
          ? { tools, tool_choice: request.toolChoice as Anthropic.ToolChoice }
          : { tools };
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
    // ALWAYS AN ARRAY FROM HERE, EVEN AN EMPTY ONE — the opposite of the
    // three adapters below, which leave the field absent. Anthropic CAN
    // report citations, so `[]` from this provider is the answer "there
    // were none", and Deep Research is allowed to believe it. See
    // AiResult.citations in types.ts for why the two cases must not wear
    // the same value, and lib/ai/providers/citations.ts for why the
    // mapping is not written inline here.
    citations: citationsFromAnthropicContent(response.content),
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
