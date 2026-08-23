"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Compass, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import { NAV_ANALYTICS_OPT_OUT_KEY } from "@/lib/nav-analytics";

/**
 * The switch that stops navigation being recorded, and the button that
 * deletes what already was.
 *
 * TWO SEPARATE ACTIONS, on purpose. Turning collection off does not
 * delete history, and deleting history does not turn collection off —
 * conflating them means somebody who wants one silently gets the other.
 * Both are offered, plainly, side by side.
 *
 * The delete runs through the USER'S OWN client against
 * nav_events_delete_own: no route in between, nothing with service-role
 * privileges asked to take the user's word for who they are. RLS makes
 * "delete my rows" the only statement this can express.
 *
 * The stored flag is an OPT-OUT (see lib/nav-analytics.ts): the state
 * shown here is inverted from it, because a switch labelled "record my
 * navigation" that is ON when the stored value is `false` is a switch
 * somebody will eventually read backwards.
 */
export function NavAnalyticsSettings({
  userId,
  initialOptedOut,
}: {
  userId: string;
  initialOptedOut: boolean;
}) {
  const t = useTranslations("settings.navAnalytics");
  const supabase = createClient();
  const { addToast } = useToast();
  const [enabled, setEnabled] = useState(!initialOptedOut);
  const [updating, setUpdating] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleToggle() {
    const next = !enabled;
    // Optimistic, then rolled back on failure — the same shape
    // chat-memory-settings uses, so a privacy switch does not behave
    // differently from the one above it.
    setEnabled(next);
    setUpdating(true);

    const { error } = await supabase.auth.updateUser({
      data: { [NAV_ANALYTICS_OPT_OUT_KEY]: !next },
    });

    setUpdating(false);

    if (error) {
      setEnabled(!next);
      addToast(t("couldNotUpdatePreference"), "error");
      return;
    }

    addToast(next ? t("recordingEnabled") : t("recordingDisabled"));
  }

  async function handleClearAll() {
    setClearing(true);
    const { error } = await supabase.from("nav_events").delete().eq("user_id", userId);
    setClearing(false);

    if (error) {
      addToast(t("couldNotClear"), "error");
      return;
    }
    addToast(t("cleared"));
  }

  return (
    <div id="navigation-analytics" className="mt-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Compass className="h-4 w-4 text-orange-400" /> {t("title")}
      </h2>

      {/* WHAT IS COLLECTED, in the same place as the switch that stops
          it. A privacy control that makes the user go and find a policy
          page to learn what it controls is not really a control. */}
      <p className="text-xs leading-relaxed text-muted">{t("whatIsCollected")}</p>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-foreground">{t("toggleLabel")}</p>
          <p className="mt-0.5 text-xs text-muted">{t("toggleDescription")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("toggleLabel")}
          onClick={handleToggle}
          disabled={updating}
          className={`relative -my-2.5 inline-flex h-11 w-11 shrink-0 items-center rounded-full bg-clip-content py-2.5 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? "bg-orange-500" : "bg-panel-hover"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
              enabled ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted">{t("retentionNote")}</p>
        <button
          type="button"
          onClick={handleClearAll}
          disabled={clearing}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors duration-150 hover:border-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {clearing ? t("clearing") : t("clearAll")}
        </button>
      </div>
    </div>
  );
}
