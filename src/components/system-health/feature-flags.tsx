"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast/toast-context";
import type { FlagAudience } from "@/lib/flags/audience";

export type FeatureFlagRow = { key: string; description: string; audience: FlagAudience };

const AUDIENCES: FlagAudience[] = ["off", "staff", "everyone"];

/**
 * THE SWITCHES (MASTER Μέρος 13 Β): each new tool or big change, and who
 * sees it — nobody, the owner and the test account, or everyone. A press
 * saves at once through /api/system-health/flags; no deploy. A failed save
 * puts the switch back and says so.
 */
export function FeatureFlags({ rows }: { rows: FeatureFlagRow[] }) {
  const t = useTranslations("dashboard.systemHealth.flags");
  const { addToast } = useToast();
  const [state, setState] = useState<Record<string, FlagAudience>>(
    Object.fromEntries(rows.map((r) => [r.key, r.audience]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  // Literal keys, so the message slicer can bound what this panel needs.
  const label: Record<FlagAudience, string> = {
    off: t("audience.off"),
    staff: t("audience.staff"),
    everyone: t("audience.everyone"),
  };

  async function choose(key: string, audience: FlagAudience) {
    const before = state[key];
    setState((s) => ({ ...s, [key]: audience }));
    setSaving(key);
    try {
      const res = await fetch("/api/system-health/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, audience }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setState((s) => ({ ...s, [key]: before }));
      addToast(t("saveFailed"), "error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="mt-8" data-testid="feature-flags" aria-labelledby="feature-flags-title">
      <h2 id="feature-flags-title" className="text-sm font-medium text-foreground">
        {t("title")}
      </h2>
      <p className="mt-1 text-xs text-muted">{t("hint")}</p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.key} className="surface-tight">
            <p className="text-sm text-foreground">{row.key}</p>
            <p className="mt-0.5 text-xs text-muted">{row.description}</p>
            <div role="radiogroup" aria-label={row.key} className="mt-2 flex flex-wrap gap-1.5">
              {AUDIENCES.map((a) => {
                const on = state[row.key] === a;
                return (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={saving === row.key}
                    onClick={() => void choose(row.key, a)}
                    data-testid={`flag-${row.key}-${a}`}
                    className={`min-h-[44px] rounded-item px-3 text-xs transition-colors duration-150 disabled:opacity-50 ${
                      on ? "bg-foreground/10 font-medium text-foreground" : "text-muted hover:bg-panel-hover hover:text-foreground"
                    }`}
                  >
                    {label[a]}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
