import "server-only";
import { runCompletion } from "@/lib/ai/providers/complete";
import { AI_TRUNCATED_STOP_REASON, type AiOutcome } from "@/lib/ai/providers/types";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { readTranslations, type Piece } from "@/lib/translate/segments";
import {
  PARALLEL_CALLS,
  TRANSLATE_EDIT_TOOL,
  TRANSLATE_MODEL,
  TRANSLATE_TOOL,
  batchMaxTokens,
  batchMessage,
  translateBatches,
  translateEditMessage,
  translateEditSystemPrompt,
  translateSystemPrompt,
  translateTextSystemPrompt,
  type TranslateStyle,
} from "@/lib/translate/translate-prompt";

/**
 * THE CALLS THAT TRANSLATE A PAGE'S PIECES (package 28). One forced tool
 * per batch (lib/translate/translate-prompt.ts), a few batches at a time.
 *
 * Usage is recorded the moment a call answers, before its list is read,
 * so a list that comes back the wrong length is still paid for and the
 * route settles it. Such a batch is asked once more; if it is wrong again
 * its pieces stay as they were (null here, `kept` in the rebuild) — the
 * page is never filled with a list that is out of step with it.
 *
 * A provider failure or a stop ends the whole translation: the route
 * releases the hold, and nothing is written.
 *
 * THROUGH THE ROUTER, NOT THE SDK (step 1.4). No api key travels in:
 * which provider serves a batch is a configuration question
 * (lib/ai/providers/registry.ts), and a provider with no key is simply
 * not in the chain, so with only ANTHROPIC_API_KEY set — production
 * today — every batch is served exactly as it was. The two reasons a
 * batch can fail are unchanged and still told apart: a Stop is the
 * person, a provider failure is not, and only the first is theirs.
 */
export type TranslateOutcome =
  | { ok: true; value: (string | null)[]; unanswered: number }
  | { ok: false; kind: "aborted" | "provider"; detail: string };

type BatchResult = { ok: true; list: string[] | null } | { ok: false; kind: "aborted" | "provider"; detail: string };

async function callBatch(system: string, message: string, expected: number, costs: CostAccumulator, userId?: string, signal?: AbortSignal): Promise<BatchResult> {
  // THIS FUNCTION DOES NOT THROW, AND THAT IS A MONEY PROPERTY, not a
  // style — see lib/posts/generate.ts. The route holds credits before
  // the first batch and releases them on `ok: false`; its outer catch
  // returns 500 without releasing.
  let outcome: AiOutcome;
  try {
    outcome = await runCompletion(
      {
        purpose: "create",
        model: TRANSLATE_MODEL,
        maxTokens: batchMaxTokens(message.length),
        system: [{ type: "text", text: system }],
        messages: [{ role: "user", content: message }],
        tools: [TRANSLATE_TOOL],
        // The tool's input IS the list of translations; a model left to
        // decide answers a batch in prose and the page keeps its old
        // text after the tokens were spent.
        toolChoice: { type: "tool", name: TRANSLATE_TOOL.name },
        requires: ["tool_calling"],
      },
      { userId, signal }
    );
  } catch (err) {
    if (signal?.aborted) return { ok: false, kind: "aborted", detail: "stopped by the user" };
    return { ok: false, kind: "provider", detail: err instanceof Error ? err.message : String(err) };
  }
  if (!outcome.ok) {
    return outcome.kind === "aborted"
      ? { ok: false, kind: "aborted", detail: "stopped by the user" }
      : { ok: false, kind: "provider", detail: outcome.detail };
  }
  costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
  // A list cut at the output ceiling is a list with its end missing.
  // Whoever served it: the adapters give all four providers' spellings
  // of that one word (ΛΘ-18).
  if (outcome.stopReason === AI_TRUNCATED_STOP_REASON) return { ok: true, list: null };
  const toolUse = outcome.toolCalls.find((call) => call.name === TRANSLATE_TOOL.name);
  return { ok: true, list: toolUse ? readTranslations(toolUse.input, expected) : null };
}

async function translateWithSystem(params: {
  pieces: readonly Piece[];
  target: string;
  system: string;
  costs: CostAccumulator;
  /** For the provider log only. Never sent to any provider. */
  userId?: string;
  signal?: AbortSignal;
}): Promise<TranslateOutcome> {
  const { system } = params;
  const batches = translateBatches(params.pieces);
  const value: (string | null)[] = params.pieces.map(() => null);
  let unanswered = 0;
  let failure: { kind: "aborted" | "provider"; detail: string } | null = null;
  // One failure stops the calls not yet made.
  const stop = new AbortController();
  const signal = params.signal ? AbortSignal.any([params.signal, stop.signal]) : stop.signal;

  let next = 0;
  async function worker() {
    while (failure === null && next < batches.length) {
      const indexes = batches[next++];
      const message = batchMessage(params.pieces, indexes, params.target);
      let result = await callBatch(system, message, indexes.length, params.costs, params.userId, signal);
      if (result.ok && result.list === null) result = await callBatch(system, message, indexes.length, params.costs, params.userId, signal);
      if (!result.ok) {
        failure ??= { kind: params.signal?.aborted ? "aborted" : result.kind, detail: result.detail };
        stop.abort();
        return;
      }
      if (result.list === null) {
        unanswered += indexes.length;
        continue;
      }
      indexes.forEach((pieceIndex, k) => {
        value[pieceIndex] = result.ok && result.list ? result.list[k] : null;
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_CALLS, batches.length) }, worker));
  if (failure !== null) return { ok: false, ...(failure as { kind: "aborted" | "provider"; detail: string }) };
  return { ok: true, value, unanswered };
}

export async function translatePieces(params: {
  pieces: readonly Piece[];
  target: string;
  costs: CostAccumulator;
  /** For the provider log only. Never sent to any provider. */
  userId?: string;
  signal?: AbortSignal;
}): Promise<TranslateOutcome> {
  return translateWithSystem({ ...params, system: translateSystemPrompt(params.target) });
}

/** The same calls, with a register (package 1 of the standalone tool) instead of the site/document prompt. */
export async function translateTextPieces(params: {
  pieces: readonly Piece[];
  target: string;
  style: TranslateStyle;
  glossary?: readonly string[];
  costs: CostAccumulator;
  userId?: string;
  signal?: AbortSignal;
}): Promise<TranslateOutcome> {
  const { style, glossary, ...rest } = params;
  return translateWithSystem({ ...rest, system: translateTextSystemPrompt(params.target, style, glossary) });
}

export type ParagraphEditOutcome = { ok: true; text: string } | { ok: false; kind: "aborted" | "provider" | "unusable"; detail: string };

/** ONE paragraph, changed by an instruction (package 3) — one call, no batching. */
export async function translateParagraphEdit(params: {
  target: string;
  style: TranslateStyle;
  paragraph: string;
  instruction: string;
  glossary?: readonly string[];
  costs: CostAccumulator;
  userId?: string;
  signal?: AbortSignal;
}): Promise<ParagraphEditOutcome> {
  const system = translateEditSystemPrompt(params.target, params.style, params.glossary);
  const message = translateEditMessage(params.target, params.paragraph, params.instruction);
  let outcome: AiOutcome;
  try {
    outcome = await runCompletion(
      {
        purpose: "create",
        model: TRANSLATE_MODEL,
        maxTokens: batchMaxTokens(message.length),
        system: [{ type: "text", text: system }],
        messages: [{ role: "user", content: message }],
        tools: [TRANSLATE_EDIT_TOOL],
        toolChoice: { type: "tool", name: TRANSLATE_EDIT_TOOL.name },
        requires: ["tool_calling"],
      },
      { userId: params.userId, signal: params.signal }
    );
  } catch (err) {
    if (params.signal?.aborted) return { ok: false, kind: "aborted", detail: "stopped by the user" };
    return { ok: false, kind: "provider", detail: err instanceof Error ? err.message : String(err) };
  }
  if (!outcome.ok) {
    return outcome.kind === "aborted" ? { ok: false, kind: "aborted", detail: "stopped by the user" } : { ok: false, kind: "provider", detail: outcome.detail };
  }
  params.costs.record("edit", outcome.usage, outcome.reportedModel || outcome.model);
  const toolUse = outcome.toolCalls.find((call) => call.name === TRANSLATE_EDIT_TOOL.name);
  const text = toolUse && typeof (toolUse.input as { text?: unknown })?.text === "string" ? ((toolUse.input as { text: string }).text) : "";
  if (!text.trim()) return { ok: false, kind: "unusable", detail: "no usable answer" };
  return { ok: true, text: text.trim() };
}
