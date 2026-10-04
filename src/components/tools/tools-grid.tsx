"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP, sidebarGroups, type SidebarItem } from "@/lib/sidebar-nav";
import { GROUP_HEADING_KEYS, ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import { filterAndRankCandidates } from "@/lib/command-palette-match";
import { aliasesFor } from "@/lib/palette-aliases";
import { isBetaTool } from "@/lib/nav/tool-status";

/**
 * ALL TOOLS AS TILES (docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN, «ALL TOOLS»):
 * small tiles in groups, a search on top, an icon and a name on each, the
 * description on hover, a discreet beta tag, and all of it on one desktop
 * screen with no scroll.
 *
 * THE SAME LIST AS EVERYWHERE ELSE. The groups are lib/sidebar-nav.ts
 * through sidebarGroups() with the owner filter — the tools, then the
 * Settings block last — so every gate on that list holds over this page.
 *
 * THE SAME SEARCH AS ⌘K. A tile answers to its name on screen, its
 * English name, the words in lib/palette-aliases.ts and its description,
 * ranked by lib/command-palette-match.ts — so "slides" finds
 * Presentations here exactly as it does in the palette (BUILD-SPECS 2.4,
 * scenario 10).
 */
export function ToolsGrid({ isOwner }: { isOwner: boolean }) {
  const t = useTranslations("dashboard.tools");
  const tSidebar = useTranslations("sidebar");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [query, setQuery] = useState("");

  const groups = useMemo(
    () => [...sidebarGroups(MAIN_SIDEBAR_GROUPS, isOwner), ...sidebarGroups([SETTINGS_GROUP], isOwner)],
    [isOwner]
  );
  const heading = (h: string) => (GROUP_HEADING_KEYS[h] ? tSidebar(`groups.${GROUP_HEADING_KEYS[h]}`) : h);
  const label = (item: SidebarItem) =>
    item.label === "Create Studio"
      ? tCommon("createStudio")
      : ITEM_LABEL_KEYS[item.label]
        ? tSidebar(`items.${ITEM_LABEL_KEYS[item.label]}`)
        : item.label;
  const hint = (item: SidebarItem) => (item.hintKey ? tSidebar(`hints.${item.hintKey}`) : "");

  const results = query.trim()
    ? filterAndRankCandidates(
        groups
          .flatMap((g) => g.items)
          .map((item) => ({
            item,
            candidates: [label(item), item.label, ...aliasesFor(ITEM_LABEL_KEYS[item.label] ?? "", locale), hint(item)],
          })),
        query
      )
    : null;

  const tile = (item: SidebarItem) => {
    const Icon = item.icon;
    const description = hint(item);
    return (
      <li key={item.href}>
        <Tooltip content={description} side="top">
          <Link
            href={item.href}
            data-testid="tool-tile"
            className="flex min-h-[44px] items-center gap-2.5 rounded-item px-3 py-2 text-sm text-foreground transition-colors duration-150 hover:bg-panel-hover"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="min-w-0 break-words">{label(item)}</span>
            {description && <span className="sr-only">{description}</span>}
            {isBetaTool(item.href) && (
              <span className="ms-auto shrink-0 rounded-full bg-tag px-1.5 py-0.5 text-[10px] leading-none text-muted">
                {t("beta")}
                <span className="sr-only">{t("betaHint")}</span>
              </span>
            )}
          </Link>
        </Tooltip>
      </li>
    );
  };

  const GRID = "grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5";

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">{t("searchLabel")}</span>
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          data-testid="tools-search"
          className="min-h-[44px] w-full rounded-field border border-border bg-panel py-2 pe-3 ps-9 text-sm text-foreground outline-none placeholder:text-muted focus:border-foreground/60"
        />
      </label>

      {results ? (
        results.length > 0 ? (
          <ul className={`mt-4 ${GRID}`}>{results.map(tile)}</ul>
        ) : (
          <p className="mt-6 text-sm text-muted">{t("noMatch", { query: query.trim() })}</p>
        )
      ) : (
        <div className="mt-5 space-y-4">
          {groups.map((group) => (
            <section key={group.heading} aria-labelledby={`tools-${group.heading}`}>
              <h2 id={`tools-${group.heading}`} className="mb-1 px-3 text-xs text-muted">
                {heading(group.heading)}
              </h2>
              <ul className={GRID}>{group.items.map(tile)}</ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
