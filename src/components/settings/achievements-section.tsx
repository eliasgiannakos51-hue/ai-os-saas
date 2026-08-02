"use client";

import { Award, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { allAchievementDisplays } from "@/lib/achievement-metadata";

export type UnlockedAchievementInfo = { achievementKey: string; unlockedAt: string };

// Gamification badge board — lists every achievement (see
// lib/achievement-metadata.ts), locked or not. Data comes from
// settings/page.tsx's loadUnlockedAchievements (lib/achievements.ts);
// nothing here mutates anything, achievements only ever unlock via
// dashboard/layout.tsx's checkAndUnlockAchievements.
export function AchievementsSection({ unlocked }: { unlocked: UnlockedAchievementInfo[] }) {
  const t = useTranslations("achievements");
  const unlockedByKey = new Map(unlocked.map((u) => [u.achievementKey, u.unlockedAt]));
  const displays = allAchievementDisplays();
  const unlockedCount = displays.filter((d) => unlockedByKey.has(d.key)).length;

  return (
    <div id="achievements" className="mb-6 rounded-2xl border border-border bg-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
        <span className="shrink-0 text-xs text-muted">
          {unlockedCount}/{displays.length}
        </span>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {displays.map((display) => {
          const unlockedAt = unlockedByKey.get(display.key);
          const isUnlocked = unlockedAt !== undefined;
          const title =
            display.kind === "firstEntry"
              ? t("firstEntry.title", { module: display.moduleTitle })
              : display.kind === "firstMission"
                ? t("firstMission.title")
                : t("streak.title");
          const description =
            display.kind === "firstEntry"
              ? t("firstEntry.description", { module: display.moduleTitle })
              : display.kind === "firstMission"
                ? t("firstMission.description")
                : t("streak.description");

          return (
            <li
              key={display.key}
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
                isUnlocked ? "border-orange-500/30 bg-orange-500/[0.03]" : "border-border bg-input"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  isUnlocked ? "bg-orange-500/10 text-orange-400" : "bg-panel-hover text-muted"
                }`}
              >
                {isUnlocked ? (
                  <Award className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${isUnlocked ? "text-foreground" : "text-muted"}`}>
                  {title}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">{description}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                  {isUnlocked
                    ? t("unlockedOn", { date: new Date(unlockedAt).toLocaleDateString() })
                    : t("locked")}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
