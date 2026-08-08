import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

/**
 * The learning profile (V3 Task 14).
 *
 * OBSERVED, NEVER ASKED AND NEVER GENERATED. Every row starts from a
 * real event — an insight dismissed, an import target chosen, a website
 * style requested — recorded server-side by the route that handled the
 * event. The client cannot write its own profile, confidence is derived
 * from evidence count and capped, and the whole table is visible and
 * row-by-row deletable in Settings, because inferences about a person
 * are the most delete-worthy data a product holds.
 */

import {
  confidenceFromEvidence,
  type LearnedCategory,
} from "@/lib/learning-rules";

const MAX_OBSERVATION_CHARS = 120;

/**
 * Record one sighting of an observation. Upsert-increment: the same
 * observation seen again bumps evidence_count and re-derives confidence.
 * Best-effort by design — learning must never fail the action that
 * triggered it.
 */
export async function recordLearnedObservation(
  userId: string,
  category: LearnedCategory,
  observation: string
): Promise<void> {
  try {
    const clean = observation.trim().slice(0, MAX_OBSERVATION_CHARS);
    if (!clean) return;
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("user_preferences_learned")
      .select("evidence_count")
      .eq("user_id", userId)
      .eq("category", category)
      .eq("observation", clean)
      .maybeSingle();

    const evidenceCount = (existing?.evidence_count ?? 0) + 1;
    const { error } = await admin.from("user_preferences_learned").upsert(
      {
        user_id: userId,
        category,
        observation: clean,
        evidence_count: evidenceCount,
        confidence: confidenceFromEvidence(evidenceCount),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,category,observation" }
    );
    if (error) logApiError("learning:record", error, { category });
  } catch (err) {
    logApiError("learning:record", err, { category });
  }
}

export type { LearnedCategory } from "@/lib/learning-rules";
