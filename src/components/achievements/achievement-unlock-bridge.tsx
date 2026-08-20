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

/** How long a tab waits before reconciling again. A user who earns
 *  something mid-session sees it within this window; a user clicking
 *  around the dashboard does not pay for the scan on every page. */
const RECHECK_AFTER_MS = 5 * 60 * 1000;
const LAST_CHECK_KEY = "ionexa:achievements:lastCheck";

/**
 * Asks the server whether anything was just unlocked — AFTER the page is
 * on screen.
 *
 * THIS USED TO BE A PROP. dashboard/layout.tsx awaited
 * checkAndUnlockAchievements on every navigation and passed the keys down,
 * which meant ~20 counted reads and two streak scans across 14 tables ran
 * BEFORE any dashboard page could render — on every page load, for every
 * account that had not unlocked everything. The toast it produced fired on
 * almost none of those loads.
 *
 * So the call moved here, behind requestIdleCallback, and is rate-limited
 * per tab. The user sees the same celebration; they no longer wait for the
 * scan that usually finds nothing. `firedRef` still guards against a
 * duplicate render of the same keys.
 */
export function AchievementUnlockBridge() {
  const t = useTranslations("achievements");
  const tKey = useTranslations();
  const { addToast } = useToast();
  const firedRef = useRef<string>("");
  const [celebrating, setCelebrating] = useState(false);
  const [unlockedKeys, setUnlockedKeys] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const reconcile = async () => {
      try {
        const last = Number(window.sessionStorage.getItem(LAST_CHECK_KEY) ?? "0");
        if (Date.now() - last < RECHECK_AFTER_MS) return;
        window.sessionStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
        const response = await fetch("/api/achievements/check", { method: "POST" });
        const data = await response.json();
        if (cancelled || !data?.ok || !Array.isArray(data.unlocked) || data.unlocked.length === 0) return;
        setUnlockedKeys(data.unlocked as string[]);
      } catch {
        // A failed reconciliation is not something to tell anyone about:
        // nothing the user did failed, and the next one picks it up.
      }
    };

    // Behind idle, so it never competes with hydration for the main
    // thread on the load it rides along with.
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => void reconcile(), { timeout: 3000 })
        : window.setTimeout(() => void reconcile(), 1200);

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function" && typeof idle === "number") {
        window.cancelIdleCallback(idle);
      } else {
        window.clearTimeout(idle as number);
      }
    };
  }, []);

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
