"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FlaskConical } from "lucide-react";

/**
 * "See it with sample data" — the way out of an empty account.
 *
 * V4.6 #6. An empty product is an invisible one: the charts have no
 * shape, the chat has nothing to be impressive about, and the person
 * deciding whether this is worth their time is looking at zeroes.
 *
 * NO CREDITS ARE SPENT PRESSING THIS. Nothing behind it calls a model —
 * the rows are a constant in lib/sample-data/dataset.ts — and the label
 * says so, because a button that might cost something and does not say
 * is the problem V4.6 has been about throughout.
 */
export function LoadSampleButton({ className = "" }: { className?: string }) {
  const t = useTranslations("sampleData");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/sample-data", { method: "POST" });
      // 409 means it is already there, which is the state the caller
      // wanted — refreshing shows it rather than reporting a failure.
      if (!res.ok && res.status !== 409) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setFailed(true);
      setLoading(false);
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors duration-150 hover:border-orange-500/50 hover:text-orange-200 disabled:opacity-60"
      >
        <FlaskConical className="h-4 w-4 shrink-0 text-emerald-400/70" aria-hidden="true" />
        {loading ? t("loading") : t("load")}
      </button>
      <span className="text-xs text-muted">{t("loadFree")}</span>
      {failed && <span className="text-xs text-red-300">{t("loadFailed")}</span>}
    </div>
  );
}
