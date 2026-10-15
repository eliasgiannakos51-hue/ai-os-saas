import "server-only";
import { buildCachedSystem } from "@/lib/ai/cached-system";
import { runCompletion } from "@/lib/ai/providers/complete";
import { AI_TRUNCATED_STOP_REASON, type AiOutcome } from "@/lib/ai/providers/types";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import type { PdfBlock } from "@/lib/pdf/blocks";
import { parseDocToolInput, parseRewrittenBlock, type DocKind, type WrittenDoc } from "@/lib/documents/writer";
import {
  DOCUMENT_MAX_TOKENS,
  DOCUMENT_MODEL,
  REWRITE_BLOCK_TOOL,
  REWRITE_MAX_TOKENS,
  WRITE_DOCUMENT_TOOL,
  type ToolDefinition,
  buildDocSystemPrompt,
  buildDocUserMessage,
  buildRewriteBlockMessage,
  buildRewriteDocMessage,
} from "@/lib/documents/writer-prompt";

/**
 * THE DOCUMENT WRITER'S CALLS TO THE MODEL (package 14): write a document,
 * rewrite one of its blocks, rewrite the whole. One forced tool each; the
 * answer parsed by lib/documents/writer.ts. Usage is recorded before the
 * parse, so an answer that is not a document is still paid for and the
 * route settles it; a stop or a provider failure records nothing.
 *
 * THROUGH THE ROUTER, NOT THE SDK (step 1.4). No api key travels in; a
 * provider with no key is not in the chain at all
 * (lib/ai/providers/registry.ts).
 */
const writeTool: ToolDefinition = WRITE_DOCUMENT_TOOL;
const rewriteTool: ToolDefinition = REWRITE_BLOCK_TOOL;

export type DocCallResult<T> = { ok: true; value: T } | { ok: false; kind: "aborted" | "provider" | "unusable"; detail: string };

async function call(params: {
  message: string;
  tool: ToolDefinition;
  maxTokens: number;
  memoryBlock?: string;
  costs: CostAccumulator;
  userId?: string;
  signal?: AbortSignal;
}): Promise<DocCallResult<unknown>> {
  // This function does not throw, and that is a money property: the
  // route holds credits before it calls and releases them on
  // `ok: false`. See lib/posts/generate.ts for the whole reasoning.
  let outcome: AiOutcome;
  try {
    outcome = await runCompletion(
      {
        purpose: "create",
        model: DOCUMENT_MODEL,
        maxTokens: params.maxTokens,
        system: buildCachedSystem({ staticPrefix: buildDocSystemPrompt(), perUserBlock: params.memoryBlock ?? "", model: DOCUMENT_MODEL }),
        messages: [{ role: "user", content: params.message }],
        tools: [params.tool],
        // The tool's input IS the document. Left to decide, the model
        // writes it in prose and nothing is saved.
        toolChoice: { type: "tool", name: params.tool.name },
        requires: ["tool_calling"],
      },
      { userId: params.userId, signal: params.signal }
    );
  } catch (err) {
    if (params.signal?.aborted) return { ok: false, kind: "aborted", detail: "stopped by the user" };
    return { ok: false, kind: "provider", detail: err instanceof Error ? err.message : String(err) };
  }
  if (!outcome.ok) {
    return outcome.kind === "aborted"
      ? { ok: false, kind: "aborted", detail: "stopped by the user" }
      : { ok: false, kind: "provider", detail: outcome.detail };
  }
  params.costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
  // A SEVERED DOCUMENT IS NOT A SHORT ONE (lib/presentations/generate.ts).
  // One word for it across four providers, made in the adapters (ΛΘ-18).
  if (outcome.stopReason === AI_TRUNCATED_STOP_REASON) return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };
  const toolUse = outcome.toolCalls.find((toolCall) => toolCall.name === params.tool.name);
  if (!toolUse) return { ok: false, kind: "unusable", detail: "the model returned no tool call" };
  return { ok: true, value: toolUse.input };
}

export async function writeDocument(params: {
  description: string;
  kind: DocKind;
  locale: string;
  businessContext?: string;
  memoryBlock?: string;
  costs: CostAccumulator;
  userId?: string;
  signal?: AbortSignal;
}): Promise<DocCallResult<WrittenDoc>> {
  const out = await call({ ...params, message: buildDocUserMessage(params.description, params.kind, params.locale, params.businessContext ?? ""), tool: writeTool, maxTokens: DOCUMENT_MAX_TOKENS });
  if (!out.ok) return out;
  const verdict = parseDocToolInput(out.value, params.description.slice(0, 60));
  return verdict.ok ? { ok: true, value: verdict.doc } : { ok: false, kind: "unusable", detail: verdict.reason };
}

export async function rewriteBlock(params: {
  title: string;
  blocks: readonly PdfBlock[];
  index: number;
  instruction: string;
  locale: string;
  memoryBlock?: string;
  costs: CostAccumulator;
  userId?: string;
  signal?: AbortSignal;
}): Promise<DocCallResult<PdfBlock>> {
  const out = await call({ ...params, message: buildRewriteBlockMessage(params.title, params.blocks, params.index, params.instruction, params.locale), tool: rewriteTool, maxTokens: REWRITE_MAX_TOKENS });
  if (!out.ok) return out;
  const block = parseRewrittenBlock(out.value, params.blocks[params.index]);
  return block ? { ok: true, value: block } : { ok: false, kind: "unusable", detail: "the block came back empty" };
}

export async function rewriteDocument(params: {
  title: string;
  blocks: readonly PdfBlock[];
  instruction: string;
  locale: string;
  memoryBlock?: string;
  costs: CostAccumulator;
  userId?: string;
  signal?: AbortSignal;
}): Promise<DocCallResult<WrittenDoc>> {
  const out = await call({ ...params, message: buildRewriteDocMessage(params.title, params.blocks, params.instruction, params.locale), tool: writeTool, maxTokens: DOCUMENT_MAX_TOKENS });
  if (!out.ok) return out;
  const verdict = parseDocToolInput(out.value, params.title);
  return verdict.ok ? { ok: true, value: verdict.doc } : { ok: false, kind: "unusable", detail: verdict.reason };
}
