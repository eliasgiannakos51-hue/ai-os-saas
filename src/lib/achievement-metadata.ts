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
// V2 "mature" achievements — each tied to a real, independently-checkable
// milestone (see lib/achievements.ts's checkAndUnlockAchievements), not a
// fabricated one.
export const FIRST_WEBSITE_ACHIEVEMENT_KEY = "first_website_generated";
export const FIRST_WEBSITE_EDIT_ACHIEVEMENT_KEY = "first_website_edited";
export const FIRST_ENTITY_LINK_ACHIEVEMENT_KEY = "first_entity_link";
export const TEN_ENTITY_LINKS_ACHIEVEMENT_KEY = "ten_entity_links";
export const FIRST_ENERGY_CHECKIN_ACHIEVEMENT_KEY = "first_energy_checkin";
export const FIRST_REFLECTION_ACHIEVEMENT_KEY = "first_reflection_generated";
export const THIRTY_DAY_STREAK_ACHIEVEMENT_KEY = "thirty_day_streak";
export const FIFTY_ENTRIES_ACHIEVEMENT_KEY = "fifty_entries_milestone";

export function allAchievementKeys(): string[] {
  return [
    ...CLASSIFIER_MODULES.map((m) => moduleAchievementKey(m.slug)),
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
  ];
}

export type AchievementDisplay =
  | { key: string; kind: "firstEntry"; moduleTitle: string }
  | { key: string; kind: "firstMission" }
  | { key: string; kind: "streak" }
  | { key: string; kind: "firstWebsite" }
  | { key: string; kind: "firstWebsiteEdit" }
  | { key: string; kind: "firstEntityLink" }
  | { key: string; kind: "tenEntityLinks" }
  | { key: string; kind: "firstEnergyCheckin" }
  | { key: string; kind: "firstReflection" }
  | { key: string; kind: "thirtyDayStreak" }
  | { key: string; kind: "fiftyEntries" };

// Fixed order: per-module achievements in CLASSIFIER_MODULES order, then
// every milestone achievement — same order every time this app lists
// achievements (Settings, toasts iterate a batch in this order too).
export function allAchievementDisplays(): AchievementDisplay[] {
  return [
    ...CLASSIFIER_MODULES.map(
      (m): AchievementDisplay => ({ key: moduleAchievementKey(m.slug), kind: "firstEntry", moduleTitle: m.title })
    ),
    { key: FIRST_MISSION_ACHIEVEMENT_KEY, kind: "firstMission" },
    { key: SEVEN_DAY_STREAK_ACHIEVEMENT_KEY, kind: "streak" },
    { key: FIRST_WEBSITE_ACHIEVEMENT_KEY, kind: "firstWebsite" },
    { key: FIRST_WEBSITE_EDIT_ACHIEVEMENT_KEY, kind: "firstWebsiteEdit" },
    { key: FIRST_ENTITY_LINK_ACHIEVEMENT_KEY, kind: "firstEntityLink" },
    { key: TEN_ENTITY_LINKS_ACHIEVEMENT_KEY, kind: "tenEntityLinks" },
    { key: FIRST_ENERGY_CHECKIN_ACHIEVEMENT_KEY, kind: "firstEnergyCheckin" },
    { key: FIRST_REFLECTION_ACHIEVEMENT_KEY, kind: "firstReflection" },
    { key: THIRTY_DAY_STREAK_ACHIEVEMENT_KEY, kind: "thirtyDayStreak" },
    { key: FIFTY_ENTRIES_ACHIEVEMENT_KEY, kind: "fiftyEntries" },
  ];
}

export function achievementDisplayForKey(key: string): AchievementDisplay | undefined {
  return allAchievementDisplays().find((d) => d.key === key);
}
