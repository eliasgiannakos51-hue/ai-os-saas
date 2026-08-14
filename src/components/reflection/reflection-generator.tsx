"use client";

import { useState } from "react";
import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { getErrorMessage } from "@/lib/get-error-message";
import { useCredits } from "@/components/credits/credits-context";
import { MessageContent } from "@/components/chat/message-content";
import type { WeeklyReflectionStats } from "@/lib/reflection";

// On-demand only — no auto-generation on page load, since this is a paid
// Claude call (CREDIT_COSTS.weeklyReflection) and nothing is persisted, so
// there's nothing to show until the user actually clicks the button.
//
// `scope`, when set, is Trading Workflow's "Trading Reflection" or
// Product Workflow's "Product Reflection" — passed through to the API as
// { scope } so it only scans workflow-related modules (see
// api/reflection/generate/route.ts). Every existing caller (just
// dashboard/reflection/page.tsx) omits it, so the request stays a bare
// bodyless POST exactly as before — zero change to default behavior.
export function ReflectionGenerator({ scope }: { scope?: "trading" | "product" } = {}) {
  const t = useTranslations("dashboard.reflection");
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const { reportUsage } = useCredits();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reflection, setReflection] = useState<string | null>(null);
  const [stats, setStats] = useState<WeeklyReflectionStats | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      // The locale always goes now, scope or not. A weekly reflection is
      // written from computed stats with no prose in them, so this is the
      // only signal the server has about which language to write in — and
      // without it the prompt fell back to the Greek it was written in.
      const res = await fetch("/api/reflection/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scope ? { scope, locale } : { locale }),
      });
      const data = await res.json();
      // The response carries what this cost; reportUsage refreshes the
      // balance AND says so, where refreshCredits only did the first half.
      void reportUsage(data);

      if (!res.ok || !data.ok) {
        setError(getErrorMessage(data?.error, "Could not generate a reflection."));
        return;
      }
      if (!data.generated) {
        setError(data.message ?? "Could not generate a reflection.");
        return;
      }

      setReflection(data.reflection);
      setStats(data.stats);
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setLoading(false);
    }
  }

  const activeModuleStats = (stats?.moduleStats ?? []).filter(
    (m) => m.thisWeek > 0 || m.lastWeek > 0
  );

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {loading ? t("generating") : t("generateButton")}
      </button>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {stats && (
        <div className="rounded-2xl border border-border bg-panel p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{t("entriesTitle")}</p>
            <span
              className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${
                stats.totalThisWeek >= stats.totalLastWeek ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {stats.totalThisWeek >= stats.totalLastWeek ? (
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {stats.totalThisWeek} / {stats.totalLastWeek}
            </span>
          </div>

          {activeModuleStats.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {activeModuleStats.map((m) => (
                <li key={m.moduleTitle} className="flex items-center justify-between text-xs text-muted">
                  <span>{m.moduleTitle}</span>
                  <span className="text-foreground">
                    {m.thisWeek} <span className="text-muted">({m.lastWeek})</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted">{t("noModuleActivity")}</p>
          )}

          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs text-muted">
              {t("missionStepsLabel", {
                completed: stats.missionStats.stepsCompleted,
                pending: stats.missionStats.stepsPending,
              })}
            </p>
          </div>
        </div>
      )}

      {reflection && (
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.03] p-5">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-orange-400">
            {t("reflectionLabel")}
          </p>
          <MessageContent content={reflection} />
        </div>
      )}
    </div>
  );
}
