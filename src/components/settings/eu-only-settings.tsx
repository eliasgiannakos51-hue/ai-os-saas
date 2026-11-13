"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";

/**
 * «ΜΟΝΟ ΕΥΡΩΠΗ» (agent/mistral, 2026-11-07): the account's own promise
 * that every AI call this product makes for it is served by a provider
 * physically in the EU (Mistral AI) — never a silent fallback to one of
 * the three US providers. Writes through api/settings/eu-only, which is
 * the one place the column behind this switch can change (deny-all from
 * a browser, 20261122000000_eu_only_ai.sql). lib/ai/providers/complete.ts
 * is what actually keeps the promise once this is on: a call this
 * account makes that cannot be served from the EU is REFUSED, never
 * quietly answered from somewhere else.
 */
export function EuOnlySettings({ initialEnabled }: { initialEnabled: boolean }) {
  const t = useTranslations("settings.euOnly");
  const { addToast } = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [updating, setUpdating] = useState(false);

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    setUpdating(true);

    try {
      const res = await fetch("/api/settings/eu-only", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ euOnly: next }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!res.ok || !body?.ok) throw new Error("failed");
      addToast(next ? t("turnedOn") : t("turnedOff"));
    } catch {
      setEnabled(!next);
      addToast(t("couldNotUpdate"), "error");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="mb-6 space-y-3 surface">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Globe className="h-4 w-4 text-foreground" /> {t("title")}
      </h2>

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
            enabled ? "bg-foreground" : "bg-panel-hover"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-paper transition-transform duration-200 ${
              enabled ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <p className="text-xs text-muted">{enabled ? t("effectOn") : t("effectOff")}</p>
    </div>
  );
}
