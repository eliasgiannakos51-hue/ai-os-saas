"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { CREDIT_PACKS, CURRENCY_SYMBOL } from "@/lib/billing/plans";

export function BuyCredits() {
  const t = useTranslations("settings.billing");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy(packId: string) {
    setLoadingId(packId);
    setError(null);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not start checkout.");
        setLoadingId(null);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Network error — please try again.");
      setLoadingId(null);
    }
  }

  return (
    <div
      id="buy-credits"
      className="mb-6 scroll-mt-20 space-y-3 rounded-2xl border border-border bg-panel p-5"
    >
      <h2 className="text-sm font-semibold text-foreground">{t("buyCredits")}</h2>
      <p className="text-xs text-muted">
        Need more credits this month? Buy a one-time top-up — no subscription change.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CREDIT_PACKS.map((pack) => (
          <button
            key={pack.id}
            type="button"
            onClick={() => handleBuy(pack.id)}
            disabled={loadingId !== null}
            className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border border-border px-3 py-3 text-center transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-sm font-bold text-foreground">
              {CURRENCY_SYMBOL}
              {pack.price}
            </span>
            <span className="text-[11px] text-muted">
              {loadingId === pack.id ? "Loading..." : `${pack.credits.toLocaleString()} credits`}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          error: {error}
        </p>
      )}
    </div>
  );
}
