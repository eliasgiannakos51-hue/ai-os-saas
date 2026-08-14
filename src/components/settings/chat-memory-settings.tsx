"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Brain, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";

export function ChatMemorySettings({
  userId,
  initialEnabled,
  initialCount,
}: {
  userId: string;
  initialEnabled: boolean;
  initialCount: number;
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

    addToast(next ? "✓ chat memory enabled" : "✓ chat memory disabled");
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
          disabled={updating}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
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
