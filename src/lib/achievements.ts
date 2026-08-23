import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import {
  allAchievementKeys,
  moduleAchievementKey,
  FIRST_MISSION_ACHIEVEMENT_KEY,
  SEVEN_DAY_STREAK_ACHIEVEMENT_KEY,
  FIRST_WEBSITE_ACHIEVEMENT_KEY,
  FIRST_WEBSITE_EDIT_ACHIEVEMENT_KEY,
  FIRST_ENTITY_LINK_ACHIEVEMENT_KEY,
  TEN_ENTITY_LINKS_ACHIEVEMENT_KEY,
  FIRST_ENERGY_CHECKIN_ACHIEVEMENT_KEY,
  FIRST_REFLECTION_ACHIEVEMENT_KEY,
  THIRTY_DAY_STREAK_ACHIEVEMENT_KEY,
  FIFTY_ENTRIES_ACHIEVEMENT_KEY,
} from "@/lib/achievement-metadata";
import { logApiError } from "@/lib/log-error";
import { DAY_MS } from "@/lib/time-constants";

const STREAK_DAYS = 7;
const LONG_STREAK_DAYS = 30;
const STREAK_PER_MODULE_LIMIT = 200;
const TEN_ENTITY_LINKS_THRESHOLD = 10;
const FIFTY_ENTRIES_THRESHOLD = 50;

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

// Rolling N-day window, same "no reliable per-user timezone available
// server-side" reasoning as health-score.ts/reflection.ts — the window
// itself only spans `days` days, so touching all of its UTC calendar-day
// buckets is an honest (if not perfectly timezone-exact) proxy for "N
// days in a row". Shared by both the 7-day and 30-day streak achievements
// below (thirty_day_streak is the same check, just a longer window).
async function hasStreak(supabase: SupabaseClient, userId: string, days: number): Promise<boolean> {
  const windowStartIso = new Date(Date.now() - days * DAY_MS).toISOString();
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
          if (error) logApiError("achievements:hasStreak", error, { table: config.table, days });
          return;
        }
        for (const row of data as { created_at: string }[]) {
          activeDays.add(new Date(row.created_at).toISOString().slice(0, 10));
        }
      } catch (err) {
        logApiError("achievements:hasStreak", err, { table: config.table, days });
      }
    })
  );

  return activeDays.size >= days;
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

  // fifty_entries_milestone needs every module's count, even for modules
  // whose OWN first-entry achievement is already unlocked — so its query
  // below is skipped only once BOTH that module's first-entry key AND
  // this milestone are already unlocked.
  const needFiftyEntriesTotal = !existingKeys.has(FIFTY_ENTRIES_ACHIEVEMENT_KEY);
  let totalEntries = 0;

  await Promise.all([
    ...CLASSIFIER_MODULES.map(async (config) => {
      const key = moduleAchievementKey(config.slug);
      const alreadyHasFirstEntry = existingKeys.has(key);
      if (alreadyHasFirstEntry && !needFiftyEntriesTotal) return;
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
        const rowCount = count ?? 0;
        if (needFiftyEntriesTotal) totalEntries += rowCount;
        if (!alreadyHasFirstEntry && rowCount > 0) toUnlock.push(key);
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
      if (await hasStreak(supabase, userId, STREAK_DAYS)) {
        toUnlock.push(SEVEN_DAY_STREAK_ACHIEVEMENT_KEY);
      }
    })(),
    (async () => {
      if (existingKeys.has(THIRTY_DAY_STREAK_ACHIEVEMENT_KEY)) return;
      if (await hasStreak(supabase, userId, LONG_STREAK_DAYS)) {
        toUnlock.push(THIRTY_DAY_STREAK_ACHIEVEMENT_KEY);
      }
    })(),
    (async () => {
      if (existingKeys.has(FIRST_WEBSITE_ACHIEVEMENT_KEY)) return;
      try {
        const { count, error } = await supabase
          .from("user_websites")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .limit(1);
        if (error) {
          logApiError("achievements:checkAndUnlockAchievements", error, { stage: "first_website" });
          return;
        }
        if ((count ?? 0) > 0) toUnlock.push(FIRST_WEBSITE_ACHIEVEMENT_KEY);
      } catch (err) {
        logApiError("achievements:checkAndUnlockAchievements", err, { stage: "first_website" });
      }
    })(),
    (async () => {
      if (existingKeys.has(FIRST_WEBSITE_EDIT_ACHIEVEMENT_KEY)) return;
      try {
        const { count, error } = await supabase
          .from("website_versions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gt("version_number", 1)
          .limit(1);
        if (error) {
          logApiError("achievements:checkAndUnlockAchievements", error, { stage: "first_website_edit" });
          return;
        }
        if ((count ?? 0) > 0) toUnlock.push(FIRST_WEBSITE_EDIT_ACHIEVEMENT_KEY);
      } catch (err) {
        logApiError("achievements:checkAndUnlockAchievements", err, { stage: "first_website_edit" });
      }
    })(),
    (async () => {
      const needFirstLink = !existingKeys.has(FIRST_ENTITY_LINK_ACHIEVEMENT_KEY);
      const needTenLinks = !existingKeys.has(TEN_ENTITY_LINKS_ACHIEVEMENT_KEY);
      if (!needFirstLink && !needTenLinks) return;
      try {
        const { count, error } = await supabase
          .from("entity_links")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .limit(1);
        if (error) {
          logApiError("achievements:checkAndUnlockAchievements", error, { stage: "entity_links" });
          return;
        }
        const rowCount = count ?? 0;
        if (needFirstLink && rowCount > 0) toUnlock.push(FIRST_ENTITY_LINK_ACHIEVEMENT_KEY);
        if (needTenLinks && rowCount >= TEN_ENTITY_LINKS_THRESHOLD) toUnlock.push(TEN_ENTITY_LINKS_ACHIEVEMENT_KEY);
      } catch (err) {
        logApiError("achievements:checkAndUnlockAchievements", err, { stage: "entity_links" });
      }
    })(),
    (async () => {
      if (existingKeys.has(FIRST_ENERGY_CHECKIN_ACHIEVEMENT_KEY)) return;
      try {
        const { count, error } = await supabase
          .from("user_energy_checkins")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .limit(1);
        if (error) {
          logApiError("achievements:checkAndUnlockAchievements", error, { stage: "first_energy_checkin" });
          return;
        }
        if ((count ?? 0) > 0) toUnlock.push(FIRST_ENERGY_CHECKIN_ACHIEVEMENT_KEY);
      } catch (err) {
        logApiError("achievements:checkAndUnlockAchievements", err, { stage: "first_energy_checkin" });
      }
    })(),
    (async () => {
      if (existingKeys.has(FIRST_REFLECTION_ACHIEVEMENT_KEY)) return;
      try {
        // credit_transactions.action_type is set to exactly "weekly_reflection"
        // by api/reflection/generate/route.ts's deductCredits call — the
        // only persisted record that a reflection was ever generated (the
        // reflection text itself is on-demand and never stored). Admin/beta
        // accounts that bypass credit deduction entirely won't log a row
        // here, so this achievement can under-unlock for those accounts —
        // an accepted, honest limitation rather than a fabricated signal.
        const { count, error } = await supabase
          .from("credit_transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("action_type", "weekly_reflection")
          .limit(1);
        if (error) {
          logApiError("achievements:checkAndUnlockAchievements", error, { stage: "first_reflection" });
          return;
        }
        if ((count ?? 0) > 0) toUnlock.push(FIRST_REFLECTION_ACHIEVEMENT_KEY);
      } catch (err) {
        logApiError("achievements:checkAndUnlockAchievements", err, { stage: "first_reflection" });
      }
    })(),
  ]);

  if (needFiftyEntriesTotal && totalEntries >= FIFTY_ENTRIES_THRESHOLD) {
    toUnlock.push(FIFTY_ENTRIES_ACHIEVEMENT_KEY);
  }

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
