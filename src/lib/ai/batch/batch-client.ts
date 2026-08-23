import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CONTROL_TIMEOUT_MS } from "@/lib/ai/providers/failover";
import type { AiRequest, AiUsage } from "@/lib/ai/providers/types";
import type { BatchStatus } from "@/lib/ai/batch/batch-policy";

/**
 * The Message Batches API, wrapped down to the three things this app does
 * with it: submit, ask whether it is done, collect.
 *
 * ANTHROPIC ONLY, and the layer says so rather than pretending otherwise.
 * catalog.ts marks `batch` as a capability, OpenAI's models carry it too,
 * and Google's and Groq's do not — but the wire formats for batch
 * submission differ far more than the generation formats do (different
 * upload model, different result retrieval, different id semantics), and
 * an adapter written against documentation with no key to test it is a
 * liability rather than an abstraction. The one implemented here is the
 * one whose synchronous sibling this app has been running in production
 * for months.
 *
 * NOTHING HERE WAS EVER CALLED. There is no ANTHROPIC_API_KEY in the
 * environment this was written in, so no batch was submitted, none came
 * back, and the 24-hour expiry was never observed. The shapes are the
 * SDK's own types, which is what makes the compiler a real check on them;
 * the behaviour is not verified.
 */

export type BatchItem = {
  /** Ties a result back to the agent_runs row that is waiting for it.
   *  Anthropic echoes it verbatim. */
  customId: string;
  model: string;
  request: AiRequest;
};

export type BatchSubmission =
  | { ok: true; batchId: string; submittedAt: Date }
  | { ok: false; reason: string };

export async function submitBatch(params: {
  apiKey: string;
  items: readonly BatchItem[];
}): Promise<BatchSubmission> {
  if (params.items.length === 0) return { ok: false, reason: "nothing to submit" };
  try {
    const client = new Anthropic({ apiKey: params.apiKey, timeout: CONTROL_TIMEOUT_MS });
    const batch = await client.messages.batches.create({
      requests: params.items.map((item) => ({
        custom_id: item.customId,
        params: {
          model: item.model,
          max_tokens: item.request.maxTokens,
          system: item.request.system as Anthropic.TextBlockParam[],
          messages: item.request.messages as Anthropic.MessageParam[],
        },
      })),
    });
    return { ok: true, batchId: batch.id, submittedAt: new Date() };
  } catch (err) {
    // A FAILED SUBMISSION LEAVES NOTHING BEHIND. Nothing was queued, so
    // there is nothing to reconcile: the caller runs the agents
    // synchronously in the same tick, exactly as it would with batching
    // off. That is why this returns a reason rather than throwing.
    return { ok: false, reason: err instanceof Error ? err.message.slice(0, 200) : "submission failed" };
  }
}

export type BatchProgress =
  | { ok: true; ended: boolean; counts: { succeeded: number; errored: number; canceled: number; expired: number } }
  | { ok: false; reason: string };

export async function batchProgress(params: {
  apiKey: string;
  batchId: string;
}): Promise<BatchProgress> {
  try {
    const client = new Anthropic({ apiKey: params.apiKey, timeout: CONTROL_TIMEOUT_MS });
    const batch = await client.messages.batches.retrieve(params.batchId);
    return {
      ok: true,
      ended: batch.processing_status === "ended",
      counts: {
        succeeded: batch.request_counts.succeeded,
        errored: batch.request_counts.errored,
        canceled: batch.request_counts.canceled,
        expired: batch.request_counts.expired,
      },
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message.slice(0, 200) : "poll failed" };
  }
}

export type BatchResultItem = {
  customId: string;
  status: BatchStatus;
  text: string;
  usage: AiUsage | null;
  reportedModel: string | null;
};

/**
 * Every result in a finished batch.
 *
 * PER REQUEST, NOT PER BATCH. One agent's request erroring must not cost
 * the other thirty-nine in the same batch their results — so each item
 * carries its own status and the caller decides per row whether to settle
 * it or fall back to a synchronous run.
 */
export async function collectBatch(params: {
  apiKey: string;
  batchId: string;
}): Promise<{ ok: true; items: BatchResultItem[] } | { ok: false; reason: string }> {
  try {
    const client = new Anthropic({ apiKey: params.apiKey, timeout: CONTROL_TIMEOUT_MS });
    const stream = await client.messages.batches.results(params.batchId);
    const items: BatchResultItem[] = [];
    for await (const entry of stream) {
      items.push(toResultItem(entry));
    }
    return { ok: true, items };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message.slice(0, 200) : "collect failed" };
  }
}

/** Exported so the shape mapping can be exercised without a network. */
export function toResultItem(entry: Anthropic.Messages.MessageBatchIndividualResponse): BatchResultItem {
  const result = entry.result;
  if (result.type === "succeeded") {
    const message = result.message;
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return {
      customId: entry.custom_id,
      status: "succeeded",
      text,
      usage: message.usage,
      reportedModel: message.model || null,
    };
  }
  // errored / canceled / expired all mean the same thing to the caller —
  // there is no answer — and all three are named rather than collapsed,
  // because "we sent something wrong", "somebody cancelled it" and "it
  // ran out of time" need different responses from a human.
  const status: BatchStatus =
    result.type === "errored" ? "errored" : result.type === "canceled" ? "canceled" : "expired";
  return { customId: entry.custom_id, status, text: "", usage: null, reportedModel: null };
}
