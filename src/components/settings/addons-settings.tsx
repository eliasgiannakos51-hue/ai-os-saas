"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

/**
 * THE ADD-ONS, AND WHAT EACH ONE ACTUALLY GRANTS.
 *
 * WHAT IS NOT CONFIGURED SAYS SO, rather than offering a button that
 * reaches Stripe with an undefined price and 500s. A customer reads that
 * as "this product is broken"; the env var name reads as "the operator
 * has not set this up", which is the truth.
 *
 * A ONE-OFF PACK CANNOT BE CANCELLED and the panel says so instead of
 * showing a cancel button that fails — the credits were granted at
 * purchase and cannot be un-granted.
 *
 * A RECURRING ADD-ON ENDS AT THE PERIOD END, not on click, because taking
 * the entitlement away immediately would be keeping their money and their
 * agents.
 */

type Addon = {
  slug: string;
  priceEur: number;
  billing: "monthly" | "one_off";
  stackable: boolean;
  available: boolean;
  notConfiguredVar: string | null;
  owned: number;
  canBuy: boolean;
};

export function AddonsSettings() {
  const t = useTranslations("settings.addons");
  const tCommon = useTranslations("common");
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/addons");
      if (!res.ok) return;
      const data = (await res.json()) as { addons: Addon[] };
      setAddons(data.addons);
    } catch {
      // Nothing shown beats a list that might be wrong about what is owned.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!addons) return null;

  async function buy(slug: string) {
    setBusy(slug);
    setError(null);
    try {
      const res = await fetch("/api/billing/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(String(data.detail ?? data.error ?? tCommon("networkError")));
        setBusy(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(tCommon("networkError"));
      setBusy(null);
    }
  }

  async function cancel(slug: string) {
    setBusy(slug);
    setError(null);
    try {
      const res = await fetch(`/api/billing/addons?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(String(data.error ?? tCommon("networkError")));
        return;
      }
      await load();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div id="addons" className="mb-6 scroll-mt-20 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-xs text-muted">{t("description")}</p>
      </div>

      <ul className="space-y-2">
        {addons.map((addon) => (
          <li
            key={addon.slug}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t(`items.${addon.slug}.name`)}</p>
              <p className="text-xs text-muted">
                €{addon.priceEur}
                {addon.billing === "monthly" ? t("perMonth") : t("oneOff")} · {t(`items.${addon.slug}.grants`)}
              </p>
              {addon.owned > 0 ? (
                <p className="mt-1 text-xs text-emerald-400">{t("owned", { count: addon.owned })}</p>
              ) : null}
              {!addon.available && addon.notConfiguredVar ? (
                <p className="mt-1 text-xs text-muted">
                  {t("notConfigured", { envVar: addon.notConfiguredVar })}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {addon.owned > 0 && addon.billing === "monthly" ? (
                <button
                  type="button"
                  onClick={() => cancel(addon.slug)}
                  disabled={busy !== null}
                  className="inline-flex min-h-[36px] items-center gap-2 rounded-xl border border-border px-3 text-xs text-foreground transition-colors duration-150 hover:border-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy === addon.slug ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  {t("cancel")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => buy(addon.slug)}
                disabled={busy !== null || !addon.canBuy}
                className="inline-flex min-h-[36px] items-center gap-2 rounded-xl bg-orange-500 px-3 text-xs font-semibold text-white transition-colors duration-150 hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === addon.slug ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                {addon.billing === "one_off" ? t("buy") : t("subscribe")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* A CANCEL BUTTON THAT WOULD FAIL IS NOT SHOWN AT ALL, and the
          reason is stated once here rather than as a broken control. */}
      <p className="text-xs text-muted">{t("oneOffNote")}</p>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
