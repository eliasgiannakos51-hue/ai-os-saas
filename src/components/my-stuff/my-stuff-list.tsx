"use client";

import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { formatDateTime } from "@/lib/format-number";
import type { MyStuffItem } from "@/lib/my-stuff/load";
import { KIND_ICON } from "@/components/my-stuff/kind-icon";

/**
 * THE LEFT COLUMN of the new My Stuff screen («1. MY STUFF: ΝΕΑ ΟΘΟΝΗ»,
 * the owner's message, 2026-10-28, Κομμάτι 1) — a row per item, press one
 * to select it, the right column (my-stuff-details.tsx) shows it. This
 * REPLACES my-stuff-browse.tsx's own list (which navigated away on press)
 * because the new screen's whole point is list-left/details-right on the
 * SAME screen, not a side panel that sends you elsewhere.
 *
 * The search box here is the plain substring search that already existed
 * (lib/my-stuff/load.ts, unchanged) — Κομμάτι 2 is where it also learns
 * to answer a question, in the SAME field, per the owner's own "one field
 * for search and questions" (ΔΕΝ φτιάχνεις δεύτερο πεδίο).
 */
export function MyStuffList({
  items,
  loading,
  query,
  onQueryChange,
  selectedKey,
  onSelect,
}: {
  items: MyStuffItem[];
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  selectedKey: string | null;
  onSelect: (item: MyStuffItem) => void;
}) {
  const t = useTranslations("dashboard.myStuff");
  const locale = useLocale();
  const formatRelativeTime = useFormatRelativeTime();

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="my-stuff-list">
      <div className="shrink-0 px-3 pt-3">
        <label className="relative block">
          <span className="sr-only">{t("browse.searchLabel")}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("browse.searchPlaceholder")}
            data-testid="my-stuff-search"
            className="search-pill-input"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {!loading && items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted" data-testid="my-stuff-empty">
            {t("browse.empty")}
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const active = item.key === selectedKey;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    aria-current={active ? "true" : undefined}
                    data-testid="my-stuff-list-item"
                    data-kind={item.kind}
                    className={`flex min-h-[44px] w-full flex-col gap-0.5 rounded-item px-3 py-2 text-start transition-colors duration-150 ${
                      active ? "bg-panel text-foreground" : "text-muted hover:bg-panel-hover hover:text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {t(`kinds.${item.kind}`)}
                      <span className="ms-auto shrink-0" title={formatDateTime(item.createdAt, locale)} suppressHydrationWarning>
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </span>
                    {/* FULL NAMES, TWO LINES IF NEEDED (the owner's quality
                        criterion) — break-words, never truncate. */}
                    <span className="break-words text-sm font-medium text-foreground">{item.title || t("browse.untitled")}</span>
                    {item.snippet && <span className="break-words text-xs text-muted">{item.snippet}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
