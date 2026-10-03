"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/greeting";

// The name the home page greets with (lib/greeting.ts, greetingName). Kept
// on the account in user_metadata.display_name, the same place and the
// same write path as ai_persona_name — no migration. Saved exactly as
// typed: the person writes the form they want to be addressed by.
export function DisplayNameSettings({ initialName }: { initialName: string }) {
  const supabase = createClient();
  const router = useRouter();
  const { addToast } = useToast();
  const t = useTranslations("settings.displayName");
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const trimmed = name.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
    const { error } = await supabase.auth.updateUser({ data: { display_name: trimmed || null } });
    setSaving(false);
    if (error) {
      addToast(`✗ ${t("saveFailed")}`, "error");
      return;
    }
    setName(trimmed);
    addToast(`✓ ${t("saved")}`);
    // The greeting is rendered on the server from the session's metadata.
    router.refresh();
  }

  return (
    <div className="mb-6 space-y-3 surface" data-testid="display-name-settings">
      <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
      <p className="text-xs text-muted">{t("description")}</p>
      <form onSubmit={handleSave} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          placeholder={t("placeholder")}
          aria-label={t("title")}
          autoComplete="given-name"
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={saving}
          className="btn-outline shrink-0 justify-center"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </form>
    </div>
  );
}
