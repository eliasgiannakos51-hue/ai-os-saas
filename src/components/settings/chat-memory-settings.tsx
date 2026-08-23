"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Brain, Trash2, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";

export function ChatMemorySettings({
  userId,
  initialEnabled,
  initialCount,
  planLimit,
}: {
  userId: string;
  initialEnabled: boolean;
  initialCount: number;
  /**
   * How many memories this plan may hold — plan.capabilities.chatMemoryLimit.
   *
   * Zero is not "no limit", it is OFF: chatMemoryActive() in
   * lib/chat/memory-policy.ts requires planLimit > 0 before anything is
   * either written or read back. Without this prop the panel could only ever
   * show an ON switch above "0 things remembered" and let the user conclude
   * the feature is broken — which is the reported complaint.
   */
  planLimit: number;
}) {
  const t = useTranslations("settings.chatMemory");
  const supabase = createClient();
  const { addToast } = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [count, setCount] = useState(initialCount);
  const [updating, setUpdating] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    setUpdating(true);

    const { error } = await supabase.auth.updateUser({
      data: { chat_memory_enabled: next },
    });

    setUpdating(false);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Chat memory toggle error:", error);
      setEnabled(!next);
      addToast(t("couldNotUpdatePreference"), "error");
      return;
    }

    addToast(next ? t("memoryEnabled") : t("memoryDisabled"));
  }

  async function handleClearAll() {
    if (
      !window.confirm(
        "Delete everything Ionexa Chat remembers about you across conversations? This can't be undone."
      )
    ) {
      return;
    }

    setClearing(true);
    const { error } = await supabase.from("chat_memory").delete().eq("user_id", userId);
    setClearing(false);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Clear chat memory error:", error);
      addToast(t("couldNotClearMemory"), "error");
      return;
    }

    setCount(0);
    addToast(t("memoryCleared"));
  }

  // Mirrors chatMemoryActive() exactly: userEnabled && planLimit > 0. Kept
  // as one expression so the explanation cannot drift from the condition
  // that actually governs whether anything is written.
  const planIncludesMemory = Number.isFinite(planLimit) && planLimit > 0;
  const reason = !planIncludesMemory
    ? t("planExcludes")
    : !enabled
      ? t("switchedOff")
      : count === 0
        ? t("nothingYet")
        : null;

  return (
    <div className="mb-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Brain className="h-4 w-4 text-orange-400" /> {t("title")}
      </h2>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-foreground">{t("toggleLabel")}</p>
          <p className="mt-0.5 text-xs text-muted">
            {t("toggleDescription")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("toggleLabel")}
          onClick={handleToggle}
          // BOTH SIDES OF A MERGE. The 44px tap target (h-11 + bg-clip-content
          // + the negative margin that keeps it looking 24px tall) came from
          // the trunk's accessibility pass; `!planIncludesMemory` came from
          // the pass that made this screen explain itself. Neither replaces
          // the other: a toggle on a plan without memory should be both
          // reachable and inert.
          disabled={updating || !planIncludesMemory}
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

      {/* WHY IT SAYS ZERO.
​
          "0 things remembered" on its own is the same sentence for three
          completely different situations, and the user is left to guess
          which. Each one now says which, and what to do about it:

            - the plan does not include memory at all (planLimit 0), which
              no amount of toggling changes;
            - memory is switched off here;
            - it is on and working, and simply has not learned anything yet,
              which is normal until a conversation contains something
              durable worth keeping. */}
      {reason && (
        <p className="flex items-start gap-1.5 rounded-lg border border-border bg-input px-3 py-2 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden="true" />
          <span>{reason}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted">
          {t("thingsRemembered", { count })}
        </p>
        <button
          type="button"
          onClick={handleClearAll}
          disabled={clearing || count === 0}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors duration-150 hover:border-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" /> {clearing ? t("clearing") : t("clearAll")}
        </button>
      </div>
    </div>
  );
}
