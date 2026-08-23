import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import type { AiAttempt, AiPurpose } from "@/lib/ai/providers/types";

/**
 * Writes the routing record. Never blocks the call, never fails it.
 *
 * IF THIS THROWS, THE ANSWER STILL GOES OUT. An observability write that
 * can take down the thing it observes is worse than no observability: the
 * user asked a question, the model answered it, and a failed INSERT into
 * a log table is not a reason to tell them it did not. Every failure here
 * goes to logApiError and stops there.
 *
 * NOT AWAITED BY THE CALLER, deliberately — `void recordProviderAttempts(...)`
 * at both exits of runCompletion. On a serverless platform that means the
 * write races the response, and a row can be lost when the function is
 * frozen the instant it returns. That is the trade accepted: this table is
 * for reading trends and incidents, not for billing (ai_cost_log is, and
 * that one IS awaited inside settlement). A log that adds a round trip to
 * every generation is a log that gets turned off.
 */
export async function recordProviderAttempts(params: {
  userId?: string;
  purpose: AiPurpose;
  attempts: readonly AiAttempt[];
}): Promise<void> {
  if (params.attempts.length === 0) return;
  try {
    const admin = createAdminClient();
    const requestId = randomUUID();
    const rows = params.attempts.map((attempt, index) => ({
      user_id: params.userId ?? null,
      request_id: requestId,
      attempt_index: index,
      purpose: params.purpose,
      provider: attempt.provider,
      model: attempt.model,
      outcome: attempt.outcome,
      http_status: attempt.status,
      latency_ms: Math.max(0, Math.round(attempt.latencyMs)),
      // Capped: `reason` is assembled from a cache-impact sentence that
      // can name token counts and model ids, and an unbounded string in a
      // log column is how a table grows in a way nobody predicted.
      reason: attempt.reason.slice(0, 500),
      cache_kept: attempt.cacheKept,
    }));
    const { error } = await admin.from("ai_provider_log").insert(rows);
    if (error) throw error;
  } catch (err) {
    logApiError("ai-providers:log", err, { purpose: params.purpose });
  }
}
