"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function ManageBillingButton() {
  const tCommon = useTranslations("common");
  const t = useTranslations("settings.billing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing-portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not open the billing portal.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? tCommon("loading") : t("manageBilling")}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
