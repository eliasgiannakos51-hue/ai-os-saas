import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";

// Pure key/display resolution — no Supabase, safe to import from both
// server (lib/achievements.ts, Settings) and client (the toast bridge)
// code. The actual unlock-checking/reading DB logic lives in
// lib/achievements.ts (server-only).

export function moduleAchievementKey(slug: string): string {
  return `first_entry_${slug}`;
}

export const FIRST_MISSION_ACHIEVEMENT_KEY = "first_mission_completed";
export const SEVEN_DAY_STREAK_ACHIEVEMENT_KEY = "seven_day_streak";

export function allAchievementKeys(): string[] {
  return [
    ...CLASSIFIER_MODULES.map((m) => moduleAchievementKey(m.slug)),
    FIRST_MISSION_ACHIEVEMENT_KEY,
    SEVEN_DAY_STREAK_ACHIEVEMENT_KEY,
  ];
}

export type AchievementDisplay =
  | { key: string; kind: "firstEntry"; moduleTitle: string }
  | { key: string; kind: "firstMission" }
  | { key: string; kind: "streak" };

// Fixed order: per-module achievements in CLASSIFIER_MODULES order, then
// the two milestone achievements — same order every time this app lists
// achievements (Settings, toasts iterate a batch in this order too).
export function allAchievementDisplays(): AchievementDisplay[] {
  return [
    ...CLASSIFIER_MODULES.map(
      (m): AchievementDisplay => ({ key: moduleAchievementKey(m.slug), kind: "firstEntry", moduleTitle: m.title })
    ),
    { key: FIRST_MISSION_ACHIEVEMENT_KEY, kind: "firstMission" },
    { key: SEVEN_DAY_STREAK_ACHIEVEMENT_KEY, kind: "streak" },
  ];
}

export function achievementDisplayForKey(key: string): AchievementDisplay | undefined {
  return allAchievementDisplays().find((d) => d.key === key);
}
