"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import { OPTIONAL_EMAIL_TYPES, MAX_EMAILS_PER_DAY } from "@/lib/email/email-types";

// Per-type email opt-outs. Only the non-critical types are listed —
// account-lifecycle and security-confirmation mail (welcome, delete
// account confirmation, team invites addressed to someone else) is not
// something a user can silently switch off, and the gate in
// lib/email/email-gate.ts enforces that server-side regardless of what
// this table contains.
//
// Writes go straight to Supabase from the client, protected by the
// user_email_preferences RLS policies (a user can only upsert their own
// row) rather than through an API route — same pattern as every other
// self-service settings panel here. The gate reads the same row with the
// service-role client, so an opt-out takes effect on the very next send
// with no cache to invalidate.
export function EmailNotificationSettings({
  userId,
  initialPrefs,
}: {
  userId: string;
  initialPrefs: Record<string, boolean>;
}) {
  const t = useTranslations("settings.emailNotifications");
  const supabase = createClient();
  const { addToast } = useToast();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(initialPrefs);
  const [savingType, setSavingType] = useState<string | null>(null);

  async function handleToggle(type: string) {
    const next = !(prefs[type] ?? true);
    // Optimistic — the switch moves immediately and is rolled back below
    // if the write fails, rather than making the user wait on a round
    // trip to see their own click register.
    setPrefs((prev) => ({ ...prev, [type]: next }));
    setSavingType(type);

    // upsert, not update: a user who has never touched this panel has no
    // row at all (the gate treats "no row" as all-defaults-on), so the
    // first toggle has to create one.
    const { error } = await supabase
      .from("user_email_preferences")
      .upsert({ user_id: userId, [type]: next }, { onConflict: "user_id" });

    setSavingType(null);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Email preference toggle error:", error);
      setPrefs((prev) => ({ ...prev, [type]: !next }));
      addToast(t("saveError"), "error");
      return;
    }

    addToast(next ? t("enabled") : t("disabled"));
  }

  return (
    <div className="mb-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Mail className="h-4 w-4 text-orange-400" /> {t("title")}
      </h2>
      <p className="text-xs text-muted">{t("description")}</p>

      <div className="divide-y divide-border">
        {OPTIONAL_EMAIL_TYPES.map((type) => {
          const enabled = prefs[type] ?? true;
          return (
            <div key={type} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{t(`types.${type}.label`)}</p>
                <p className="mt-0.5 text-xs text-muted">{t(`types.${type}.description`)}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={t(`types.${type}.label`)}
                onClick={() => handleToggle(type)}
                disabled={savingType !== null}
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
          );
        })}
      </div>

      <p className="border-t border-border pt-3 text-xs text-muted">
        {t("dailyCap", { max: MAX_EMAILS_PER_DAY })}
      </p>
    </div>
  );
}
