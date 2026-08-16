"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { formatDateTime } from "@/lib/format-number";
import { useLocale, useTranslations } from "next-intl";

export type MemoryResult = {
  id: string;
  moduleTitleKey: string;
  moduleHref: string;
  headline: string;
  snippet: string;
  createdAt: string;
};

const MAX_RESULTS_SHOWN = 100;

function matches(result: MemoryResult, query: string): boolean {
  const haystack = `${result.headline} ${result.snippet}`.toLowerCase();
  return haystack.includes(query);
}

export function MemorySearch({ results }: { results: MemoryResult[] }) {
  const locale = useLocale();
  const t = useTranslations("dashboard.memory");
  const tModule = useTranslations("module");
  const tKey = useTranslations();
  const formatRelativeTime = useFormatRelativeTime();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return results;
    return results.filter((result) => matches(result, q));
  }, [results, query]);

  return (
    <div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="input pl-10"
          autoFocus
        />
      </div>

      {results.length > 0 && (
        <p className="mb-4 text-xs text-muted">
          {query.trim()
            ? t("resultCountForQuery", { count: filtered.length, query: query.trim() })
            : t("resultCount", { count: filtered.length })}
        </p>
      )}

      {results.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={SearchX}>{tModule("noMatches", { query })}</EmptyState>
      ) : (
        <>
          <div className="space-y-3">
            {filtered.slice(0, MAX_RESULTS_SHOWN).map((result) => (
              <Link
                key={result.id}
                href={result.moduleHref}
                className="group block rounded-2xl border border-border bg-panel p-4 transition-colors duration-150 hover:border-orange-500/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground">
                    {result.headline}
                  </h3>
                  <span className="inline-flex shrink-0 items-center rounded-full border border-orange-800 bg-orange-950/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-400">
                    {tKey(result.moduleTitleKey)}
                  </span>
                </div>

                {result.snippet && (
                  <p className="mt-1 text-sm text-foreground/90">{result.snippet}</p>
                )}

                <p
                  className="mt-2 text-xs text-muted"
                  title={formatDateTime(result.createdAt, locale)}
                  suppressHydrationWarning
                >
                  {tModule("loggedAt", { when: formatRelativeTime(result.createdAt) })}
                </p>
              </Link>
            ))}
          </div>

          {filtered.length > MAX_RESULTS_SHOWN && (
            <p className="mt-3 text-center text-xs text-muted">
              {t("truncated", { shown: MAX_RESULTS_SHOWN, total: filtered.length })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
