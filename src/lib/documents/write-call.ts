import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { buildCachedSystem } from "@/lib/ai/cached-system";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import type { PdfBlock } from "@/lib/pdf/blocks";
import { parseDocToolInput, parseRewrittenBlock, type DocKind, type WrittenDoc } from "@/lib/documents/writer";
import {
  DOCUMENT_MAX_TOKENS,
  DOCUMENT_MODEL,
  REWRITE_BLOCK_TOOL,
  REWRITE_MAX_TOKENS,
  WRITE_DOCUMENT_TOOL,
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
 */
const writeTool: Anthropic.Tool = WRITE_DOCUMENT_TOOL;
const rewriteTool: Anthropic.Tool = REWRITE_BLOCK_TOOL;

export type DocCallResult<T> = { ok: true; value: T } | { ok: false; kind: "aborted" | "provider" | "unusable"; detail: string };

async function call(params: {
  apiKey: string;
  message: string;
  tool: Anthropic.Tool;
  maxTokens: number;
  memoryBlock?: string;
  costs: CostAccumulator;
  signal?: AbortSignal;
}): Promise<DocCallResult<unknown>> {
  const anthropic = new Anthropic({ apiKey: params.apiKey });
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create(
      {
        model: DOCUMENT_MODEL,
        max_tokens: params.maxTokens,
        system: buildCachedSystem({ staticPrefix: buildDocSystemPrompt(), perUserBlock: params.memoryBlock ?? "", model: DOCUMENT_MODEL }),
        messages: [{ role: "user", content: params.message }],
        tools: [params.tool],
        tool_choice: { type: "tool", name: params.tool.name },
      },
      { signal: params.signal }
    );
  } catch (err) {
    if (params.signal?.aborted) return { ok: false, kind: "aborted", detail: "stopped by the user" };
    return { ok: false, kind: "provider", detail: err instanceof Error ? err.message : String(err) };
  }
  params.costs.record("generation", response.usage, response.model || DOCUMENT_MODEL);
  // A SEVERED DOCUMENT IS NOT A SHORT ONE (lib/presentations/generate.ts).
  if (response.stop_reason === "max_tokens") return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };
  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) return { ok: false, kind: "unusable", detail: "the model returned no tool call" };
  return { ok: true, value: toolUse.input };
}

export async function writeDocument(params: {
  apiKey: string;
  description: string;
  kind: DocKind;
  locale: string;
  businessContext?: string;
  memoryBlock?: string;
  costs: CostAccumulator;
  signal?: AbortSignal;
}): Promise<DocCallResult<WrittenDoc>> {
  const out = await call({ ...params, message: buildDocUserMessage(params.description, params.kind, params.locale, params.businessContext ?? ""), tool: writeTool, maxTokens: DOCUMENT_MAX_TOKENS });
  if (!out.ok) return out;
  const verdict = parseDocToolInput(out.value, params.description.slice(0, 60));
  return verdict.ok ? { ok: true, value: verdict.doc } : { ok: false, kind: "unusable", detail: verdict.reason };
}

export async function rewriteBlock(params: {
  apiKey: string;
  title: string;
  blocks: readonly PdfBlock[];
  index: number;
  instruction: string;
  locale: string;
  memoryBlock?: string;
  costs: CostAccumulator;
  signal?: AbortSignal;
}): Promise<DocCallResult<PdfBlock>> {
  const out = await call({ ...params, message: buildRewriteBlockMessage(params.title, params.blocks, params.index, params.instruction, params.locale), tool: rewriteTool, maxTokens: REWRITE_MAX_TOKENS });
  if (!out.ok) return out;
  const block = parseRewrittenBlock(out.value, params.blocks[params.index]);
  return block ? { ok: true, value: block } : { ok: false, kind: "unusable", detail: "the block came back empty" };
}

export async function rewriteDocument(params: {
  apiKey: string;
  title: string;
  blocks: readonly PdfBlock[];
  instruction: string;
  locale: string;
  memoryBlock?: string;
  costs: CostAccumulator;
  signal?: AbortSignal;
}): Promise<DocCallResult<WrittenDoc>> {
  const out = await call({ ...params, message: buildRewriteDocMessage(params.title, params.blocks, params.instruction, params.locale), tool: writeTool, maxTokens: DOCUMENT_MAX_TOKENS });
  if (!out.ok) return out;
  const verdict = parseDocToolInput(out.value, params.title);
  return verdict.ok ? { ok: true, value: verdict.doc } : { ok: false, kind: "unusable", detail: verdict.reason };
}
