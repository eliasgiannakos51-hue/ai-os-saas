import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import {
  allAchievementKeys,
  moduleAchievementKey,
  FIRST_MISSION_ACHIEVEMENT_KEY,
  SEVEN_DAY_STREAK_ACHIEVEMENT_KEY,
} from "@/lib/achievement-metadata";
import { logApiError } from "@/lib/log-error";

const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_DAYS = 7;
const STREAK_PER_MODULE_LIMIT = 200;

export type UnlockedAchievement = { achievementKey: string; unlockedAt: string };

export async function loadUnlockedAchievements(
  supabase: SupabaseClient,
  userId: string
): Promise<UnlockedAchievement[]> {
  try {
    const { data, error } = await supabase
      .from("user_achievements")
      .select("achievement_key, unlocked_at")
      .eq("user_id", userId);
    if (error || !data) {
      if (error) logApiError("achievements:loadUnlockedAchievements", error);
      return [];
    }
    return (data as { achievement_key: string; unlocked_at: string }[]).map((r) => ({
      achievementKey: r.achievement_key,
      unlockedAt: r.unlocked_at,
    }));
  } catch (err) {
    logApiError("achievements:loadUnlockedAchievements", err, { userId });
    return [];
  }
}

// Rolling 7-day window, same "no reliable per-user timezone available
// server-side" reasoning as health-score.ts/reflection.ts — the window
// itself only spans 7 days, so touching all 7 of its UTC calendar-day
// buckets is an honest (if not perfectly timezone-exact) proxy for "7
// days in a row".
async function hasSevenDayStreak(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const windowStartIso = new Date(Date.now() - STREAK_DAYS * DAY_MS).toISOString();
  const activeDays = new Set<string>();

  await Promise.all(
    CLASSIFIER_MODULES.map(async (config) => {
      try {
        const { data, error } = await supabase
          .from(config.table)
          .select("created_at")
          .eq("user_id", userId)
          .gte("created_at", windowStartIso)
          .limit(STREAK_PER_MODULE_LIMIT);
        if (error || !data) {
          if (error) logApiError("achievements:hasSevenDayStreak", error, { table: config.table });
          return;
        }
        for (const row of data as { created_at: string }[]) {
          activeDays.add(new Date(row.created_at).toISOString().slice(0, 10));
        }
      } catch (err) {
        logApiError("achievements:hasSevenDayStreak", err, { table: config.table });
      }
    })
  );

  return activeDays.size >= STREAK_DAYS;
}

// Gamification — reconciles real current state against what's already
// unlocked (no cron/background worker in this app, so this runs
// opportunistically from dashboard/layout.tsx on every navigation) and
// inserts any newly-earned achievement rows. Fast-paths to a single query
// once every achievement is unlocked, so steady-state cost after that
// point is effectively zero. Returns only the keys unlocked BY THIS CALL
// (empty on every call after the one that actually earned them), which is
// exactly what the toast bridge needs to fire once and never again.
export async function checkAndUnlockAchievements(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const allKeys = allAchievementKeys();

  const { data: existingRows, error: existingError } = await supabase
    .from("user_achievements")
    .select("achievement_key")
    .eq("user_id", userId);
  if (existingError) {
    logApiError("achievements:checkAndUnlockAchievements", existingError, { stage: "existing" });
    return [];
  }
  const existingKeys = new Set((existingRows ?? []).map((r) => r.achievement_key as string));
  if (existingKeys.size >= allKeys.length) return [];

  const toUnlock: string[] = [];

  await Promise.all([
    ...CLASSIFIER_MODULES.map(async (config) => {
      const key = moduleAchievementKey(config.slug);
      if (existingKeys.has(key)) return;
      try {
        const { count, error } = await supabase
          .from(config.table)
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .limit(1);
        if (error) {
          logApiError("achievements:checkAndUnlockAchievements", error, { table: config.table });
          return;
        }
        if ((count ?? 0) > 0) toUnlock.push(key);
      } catch (err) {
        logApiError("achievements:checkAndUnlockAchievements", err, { table: config.table });
      }
    }),
    (async () => {
      if (existingKeys.has(FIRST_MISSION_ACHIEVEMENT_KEY)) return;
      try {
        const { count, error } = await supabase
          .from("ai_missions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "completed");
        if (error) {
          logApiError("achievements:checkAndUnlockAchievements", error, { stage: "first_mission" });
          return;
        }
        if ((count ?? 0) > 0) toUnlock.push(FIRST_MISSION_ACHIEVEMENT_KEY);
      } catch (err) {
        logApiError("achievements:checkAndUnlockAchievements", err, { stage: "first_mission" });
      }
    })(),
    (async () => {
      if (existingKeys.has(SEVEN_DAY_STREAK_ACHIEVEMENT_KEY)) return;
      if (await hasSevenDayStreak(supabase, userId)) {
        toUnlock.push(SEVEN_DAY_STREAK_ACHIEVEMENT_KEY);
      }
    })(),
  ]);

  if (toUnlock.length === 0) return [];

  const { error: insertError } = await supabase.from("user_achievements").upsert(
    toUnlock.map((key) => ({ user_id: userId, achievement_key: key })),
    { onConflict: "user_id,achievement_key", ignoreDuplicates: true }
  );
  if (insertError) {
    logApiError("achievements:checkAndUnlockAchievements", insertError, { stage: "insert" });
    return [];
  }

  return toUnlock;
}
