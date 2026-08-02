"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast/toast-context";
import { achievementDisplayForKey } from "@/lib/achievement-metadata";

// Server → client bridge: dashboard/layout.tsx runs
// checkAndUnlockAchievements (lib/achievements.ts) on every navigation and
// passes down only the keys unlocked BY THAT CALL — which is empty on
// every render except the one where an achievement was just earned, so
// this naturally fires once per achievement, never again. The `firedRef`
// guard is just belt-and-suspenders against a duplicate render of the
// same props (e.g. React dev-mode double-invoke), not the primary
// dedup mechanism (that's the query in lib/achievements.ts).
export function AchievementUnlockBridge({ unlockedKeys }: { unlockedKeys: string[] }) {
  const t = useTranslations("achievements");
  const { addToast } = useToast();
  const firedRef = useRef<string>("");

  useEffect(() => {
    if (unlockedKeys.length === 0) return;
    const signature = unlockedKeys.join(",");
    if (firedRef.current === signature) return;
    firedRef.current = signature;

    for (const key of unlockedKeys) {
      const display = achievementDisplayForKey(key);
      if (!display) continue;
      const title =
        display.kind === "firstEntry"
          ? t("firstEntry.title", { module: display.moduleTitle })
          : display.kind === "firstMission"
            ? t("firstMission.title")
            : t("streak.title");
      addToast(`🏆 ${t("unlockedToast", { achievement: title })}`);
    }
  }, [unlockedKeys, t, addToast]);

  return null;
}
