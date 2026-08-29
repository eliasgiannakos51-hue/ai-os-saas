"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { RECORD_DESTINATIONS } from "@/lib/sidebar-nav";
import { ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import { normalizeForSearch } from "@/lib/text/search-match";

/**
 * The nineteen log screens, on one page, with a filter.
 *
 * They were nineteen sidebar rows of exactly the same shape — a list of
 * rows you typed — spread across three groups called Tracking, Business
 * and Strategy, which is a distinction in the codebase and not in
 * anybody's day. One row in the sidebar points here; the routes
 * themselves are untouched, so every bookmark, every link the classifier
 * hands back and every favourite still resolves.
 *
 * FILTERING, NOT NAVIGATING AWAY TO FILTER. The box narrows the grid as
 * you type, on the translated label — which is the word the user is
 * actually looking at. normalizeForSearch is the same fold every other
 * list in this app uses, so "καφε" still finds "Καφές" and "analitics"
 * does not find Analytics for the wrong reason.
 */
export function RecordsHub() {
  const t = useTranslations();
  const tRecords = useTranslations("dashboard.records");
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () =>
      RECORD_DESTINATIONS.map((item) => ({
        item,
        label: t(`sidebar.items.${ITEM_LABEL_KEYS[item.label] ?? item.label}`),
      })),
    [t],
  );

  const q = normalizeForSearch(query.trim());
  const shown = q ? rows.filter((r) => normalizeForSearch(r.label).includes(q)) : rows;

  return (
    <div>
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tRecords("filterPlaceholder")}
          aria-label={tRecords("filterPlaceholder")}
          // 16px, not smaller: anything under it makes iOS Safari zoom
          // the whole page on focus.
          className="min-h-[44px] w-full rounded-xl border border-border bg-input py-2 pl-9 pr-3 text-base text-foreground outline-none transition-colors duration-150 placeholder:text-muted focus:border-orange-500"
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-border bg-panel/60 p-6 text-center text-sm text-muted">
          {tRecords("noMatch", { query: query.trim() })}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(({ item, label }) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-testid={`records-${item.href}`}
                  className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-border bg-panel/60 px-3 py-2.5 text-sm text-foreground transition-colors duration-150 hover:border-orange-500/60 hover:bg-panel"
                >
                  <Icon className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-center text-xs text-muted">
        {tRecords("count", { shown: shown.length, total: rows.length })}
      </p>
    </div>
  );
}
