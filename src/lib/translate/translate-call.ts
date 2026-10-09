import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { readTranslations, type Piece } from "@/lib/translate/segments";
import {
  PARALLEL_CALLS,
  TRANSLATE_MODEL,
  TRANSLATE_TOOL,
  batchMaxTokens,
  batchMessage,
  translateBatches,
  translateSystemPrompt,
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
 */
export type TranslateOutcome =
  | { ok: true; value: (string | null)[]; unanswered: number }
  | { ok: false; kind: "aborted" | "provider"; detail: string };

type BatchResult = { ok: true; list: string[] | null } | { ok: false; kind: "aborted" | "provider"; detail: string };

async function callBatch(anthropic: Anthropic, system: string, message: string, expected: number, costs: CostAccumulator, signal?: AbortSignal): Promise<BatchResult> {
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create(
      {
        model: TRANSLATE_MODEL,
        max_tokens: batchMaxTokens(message.length),
        system,
        messages: [{ role: "user", content: message }],
        tools: [TRANSLATE_TOOL],
        tool_choice: { type: "tool", name: TRANSLATE_TOOL.name },
      },
      { signal }
    );
  } catch (err) {
    if (signal?.aborted) return { ok: false, kind: "aborted", detail: "stopped by the user" };
    return { ok: false, kind: "provider", detail: err instanceof Error ? err.message : String(err) };
  }
  costs.record("generation", response.usage, response.model || TRANSLATE_MODEL);
  // A list cut at the output ceiling is a list with its end missing.
  if (response.stop_reason === "max_tokens") return { ok: true, list: null };
  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  return { ok: true, list: toolUse ? readTranslations(toolUse.input, expected) : null };
}

export async function translatePieces(params: {
  apiKey: string;
  pieces: readonly Piece[];
  target: string;
  costs: CostAccumulator;
  signal?: AbortSignal;
}): Promise<TranslateOutcome> {
  const anthropic = new Anthropic({ apiKey: params.apiKey });
  const system = translateSystemPrompt(params.target);
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
      let result = await callBatch(anthropic, system, message, indexes.length, params.costs, signal);
      if (result.ok && result.list === null) result = await callBatch(anthropic, system, message, indexes.length, params.costs, signal);
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
