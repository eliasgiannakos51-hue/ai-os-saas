import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import {
  confirmedConfidence,
  decayedConfidence,
  INITIAL_CONFIDENCE,
  levelForActions,
  totalMeaningfulActions,
  type ActivityCounts,
  type MaturityLevel,
  type ProfileCategory,
} from "@/lib/profile/maturity";
import { deriveObservations, type ActivitySummary } from "@/lib/profile/observers";

// Reading and writing the learned profile.
//
// The decisions live in maturity.ts (levels, confidence, decay) and
// observers.ts (what is noticed); this file loads the activity those need
// and applies the result. Nothing here decides anything about a person.

export type ProfileRow = {
  id: string;
  category: ProfileCategory;
  observation: string;
  confidence: number;
  evidence_count: number;
  first_seen: string;
  last_confirmed: string;
  user_edited: boolean;
};

export type ProfileState = {
  meaningfulActions: number;
  level: MaturityLevel;
  lastRefreshedAt: string | null;
};

export async function listProfile(userId: string): Promise<ProfileRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_profile_learned")
      .select("id, category, observation, confidence, evidence_count, first_seen, last_confirmed, user_edited")
      .eq("user_id", userId)
      .order("confidence", { ascending: false })
      .limit(200);
    if (error) {
      logApiError("profile:list", error, { userId });
      return [];
    }
    return ((data as ProfileRow[] | null) ?? []).map((r) => ({
      ...r,
      confidence: Number(r.confidence),
    }));
  } catch (err) {
    logApiError("profile:list", err, { userId });
    return [];
  }
}

export async function getProfileState(userId: string): Promise<ProfileState> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("user_profile_state")
      .select("meaningful_actions, level, last_refreshed_at")
      .eq("user_id", userId)
      .maybeSingle();
    const row = data as
      | { meaningful_actions: number; level: number; last_refreshed_at: string }
      | null;
    if (!row) return { meaningfulActions: 0, level: 0, lastRefreshedAt: null };
    return {
      meaningfulActions: row.meaningful_actions,
      level: levelForActions(row.meaningful_actions),
      lastRefreshedAt: row.last_refreshed_at,
    };
  } catch (err) {
    logApiError("profile:state", err, { userId });
    return { meaningfulActions: 0, level: 0, lastRefreshedAt: null };
  }
}

/** Deletes one observation. The user's own right, exercised server-side. */
export async function deleteObservation(userId: string, id: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("user_profile_learned")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) {
      logApiError("profile:delete", error, { userId });
      return false;
    }
    return true;
  } catch (err) {
    logApiError("profile:delete", err, { userId });
    return false;
  }
}

/**
 * "Forget everything."
 *
 * Deletes the observations AND resets the maturity counter. Leaving the
 * counter would mean an assistant that has forgotten everything still
 * behaves as though it knows the person well, which is the worst of both:
 * no memory and full confidence.
 */
export async function forgetEverything(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const [{ error: rowsError }, { error: stateError }] = await Promise.all([
      admin.from("user_profile_learned").delete().eq("user_id", userId),
      admin.from("user_profile_state").delete().eq("user_id", userId),
    ]);
    if (rowsError || stateError) {
      logApiError("profile:forget", rowsError ?? stateError, { userId });
      return false;
    }
    return true;
  } catch (err) {
    logApiError("profile:forget", err, { userId });
    return false;
  }
}

/**
 * The user rewrites an observation.
 *
 * Sets user_edited, which permanently exempts the row from being
 * overwritten by the observer. A correction the system quietly reverts on
 * its next run is worse than no correction at all: the person believes
 * they fixed it and it comes back.
 *
 * Confidence is raised to a confirmed value, because a human bothering to
 * correct the wording is stronger evidence than any number of automated
 * sightings.
 */
export async function editObservation(params: {
  userId: string;
  id: string;
  observation: string;
}): Promise<boolean> {
  const text = params.observation.trim();
  if (text.length < 3 || text.length > 300) return false;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("user_profile_learned")
      .update({
        observation: text,
        user_edited: true,
        confidence: confirmedConfidence(0.5),
        last_confirmed: new Date().toISOString(),
      })
      .eq("user_id", params.userId)
      .eq("id", params.id);
    if (error) {
      logApiError("profile:edit", error, { userId: params.userId });
      return false;
    }
    return true;
  } catch (err) {
    logApiError("profile:edit", err, { userId: params.userId });
    return false;
  }
}

/**
 * One refresh for one account: recount activity, re-derive observations,
 * confirm what is still true and decay what is not.
 *
 * WHAT MAKES A REFRESH SAFE TO RUN OFTEN. It is idempotent in shape but
 * not in effect — running it twice in a row confirms everything twice and
 * decays nothing, which slightly over-confirms. That is why the cron runs
 * it daily and the routes never do: confidence is meant to track evidence
 * over time, and a refresh triggered by a page view would let anyone
 * inflate their own profile by reloading Settings.
 */
export async function refreshProfile(params: {
  userId: string;
  counts: ActivityCounts;
  activity: ActivitySummary;
}): Promise<{ ok: boolean; observations: number; decayed: number }> {
  const { userId } = params;
  try {
    const admin = createAdminClient();
    const actions = totalMeaningfulActions(params.counts);
    const level = levelForActions(actions);
    const now = new Date().toISOString();

    await admin
      .from("user_profile_state")
      .upsert(
        { user_id: userId, meaningful_actions: actions, level, last_refreshed_at: now },
        { onConflict: "user_id" }
      );

    const derived = deriveObservations(params.activity);
    const existing = await listProfile(userId);
    const existingByKey = new Map(existing.map((r) => [`${r.category}::${r.observation}`, r]));
    const derivedKeys = new Set(derived.map((d) => `${d.category}::${d.observation}`));

    // CONFIRM what was seen again.
    for (const d of derived) {
      const key = `${d.category}::${d.observation}`;
      const row = existingByKey.get(key);
      if (row) {
        // An edited row keeps its wording and its confidence — the person
        // has spoken, and the observer does not get to argue.
        if (row.user_edited) continue;
        const { error } = await admin
          .from("user_profile_learned")
          .update({
            confidence: confirmedConfidence(row.confidence),
            evidence_count: row.evidence_count + 1,
            last_confirmed: now,
          })
          .eq("id", row.id);
        if (error) logApiError("profile:confirm", error, { userId });
      } else {
        const { error } = await admin.from("user_profile_learned").insert({
          user_id: userId,
          category: d.category,
          observation: d.observation,
          confidence: INITIAL_CONFIDENCE,
          evidence_count: 1,
          first_seen: now,
          last_confirmed: now,
        });
        // 23505 is the unique index catching a concurrent refresh. Fine.
        if (error && error.code !== "23505") logApiError("profile:insert", error, { userId });
      }
    }

    // DECAY what was not. Rows the user edited are left alone: a
    // correction is not evidence that fades, it is an instruction.
    let decayed = 0;
    for (const row of existing) {
      const key = `${row.category}::${row.observation}`;
      if (derivedKeys.has(key) || row.user_edited) continue;
      const next = decayedConfidence(row.confidence);
      if (next === row.confidence) continue;
      const { error } = await admin
        .from("user_profile_learned")
        .update({ confidence: next })
        .eq("id", row.id);
      if (error) logApiError("profile:decay", error, { userId });
      else decayed += 1;
    }

    return { ok: true, observations: derived.length, decayed };
  } catch (err) {
    logApiError("profile:refresh", err, { userId });
    return { ok: false, observations: 0, decayed: 0 };
  }
}
