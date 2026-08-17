"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast/toast-context";
import { achievementDisplayForKey, type AchievementDisplay } from "@/lib/achievement-metadata";
import { CelebrationBurst } from "@/components/celebration/celebration-burst";

// Shared with AchievementsSection below — every achievement kind resolves
// to a translation key under the "achievements" namespace, keyed by kind.
const ACHIEVEMENT_TITLE_KEYS: Record<AchievementDisplay["kind"], string> = {
  firstEntry: "firstEntry.title",
  firstMission: "firstMission.title",
  streak: "streak.title",
  firstWebsite: "firstWebsite.title",
  firstWebsiteEdit: "firstWebsiteEdit.title",
  firstEntityLink: "firstEntityLink.title",
  tenEntityLinks: "tenEntityLinks.title",
  firstEnergyCheckin: "firstEnergyCheckin.title",
  firstReflection: "firstReflection.title",
  thirtyDayStreak: "thirtyDayStreak.title",
  fiftyEntries: "fiftyEntries.title",
};

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
  const tKey = useTranslations();
  const { addToast } = useToast();
  const firedRef = useRef<string>("");
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (unlockedKeys.length === 0) return;
    const signature = unlockedKeys.join(",");
    if (firedRef.current === signature) return;
    firedRef.current = signature;

    // Earning an achievement is the single most "well done" moment the
    // app has — it gets the full confetti burst, not just a toast.
    setCelebrating(true);

    for (const key of unlockedKeys) {
      const display = achievementDisplayForKey(key);
      if (!display) continue;
      const title =
        display.kind === "firstEntry"
          ? t("firstEntry.title", { module: tKey(display.moduleTitleKey) })
          : t(ACHIEVEMENT_TITLE_KEYS[display.kind]);
      addToast(`🏆 ${t("unlockedToast", { achievement: title })}`);
    }
  }, [unlockedKeys, t, tKey, addToast]);

  if (!celebrating) return null;

  // Fixed and centred over the viewport rather than anchored to a card:
  // an achievement isn't tied to any one element on screen, and the
  // toast that names it renders separately in the corner. inset-0 makes
  // this the positioning parent CelebrationBurst needs.
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70]">
      <CelebrationBurst trigger={celebrating} onDone={() => setCelebrating(false)} />
    </div>
  );
}
