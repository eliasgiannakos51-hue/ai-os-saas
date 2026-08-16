"use client";

import { useMemo, useState } from "react";
import { SearchX, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { moduleBadgeColor } from "@/lib/module-colors";
import { iconForSlug } from "@/lib/module-icons";
import { sidebarKeyForSlug } from "@/lib/favoritable";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { EntityCard, CardGrid } from "@/components/ui/entity-card";
import { ListLayout } from "@/components/ui/list-layout";
import type { FavoriteGroup } from "@/lib/favorites";
import { matchesSearch } from "@/lib/text/search-match";

/**
 * Favorites, grouped by module with a heading and a count.
 *
 * The flat reverse-chronological list this replaced answered "what did I
 * star most recently", which is not why anyone opens this page. They came
 * looking for one specific thing and they remember which module it lived
 * in — so the module is the axis worth organising by, and the count tells
 * them at a glance whether it's worth scanning the section at all.
 *
 * Each entry is the same EntityCard every module list renders. There's no
 * "+ New" here, because there is nothing to create on this page: a
 * favorite is made by starring something somewhere else. Search still
 * applies — with enough starred items, that's the fastest route back to
 * the one you came for.
 */
export function FavoritesList({ groups }: { groups: FavoriteGroup[] }) {
  const formatRelativeTime = useFormatRelativeTime();
  const t = useTranslations("dashboard.favorites");
  const tModule = useTranslations("module");
  const tSidebar = useTranslations("sidebar.items");
  const [query, setQuery] = useState("");

  const totalEntries = useMemo(
    () => groups.reduce((sum, group) => sum + group.entries.length, 0),
    [groups]
  );

  const visibleGroups = useMemo(() => {
    const q = query.trim();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => matchesSearch(entry.headline, q)),
      }))
      .filter((group) => group.entries.length > 0);
  }, [groups, query]);

  const visibleCount = useMemo(
    () => visibleGroups.reduce((sum, group) => sum + group.entries.length, 0),
    [visibleGroups]
  );

  if (groups.length === 0) {
    // No example: a favourite is made by pressing the star on an item,
    // which is somewhere else entirely. Nothing on this page receives text.
    return (
      <EmptyState icon={Star} title={t("empty.title")}>
        {t("empty.why")}
      </EmptyState>
    );
  }

  return (
    <ListLayout
      searchValue={query}
      onSearchChange={setQuery}
      searchPlaceholder={tModule("searchPlaceholder")}
      meta={
        <span className="text-xs text-muted">
          {tModule("resultCount", { count: visibleCount, total: totalEntries })}
        </span>
      }
    >
      {visibleGroups.length === 0 ? (
        <EmptyState icon={SearchX}>{tModule("noMatches", { query })}</EmptyState>
      ) : (
        <div className="space-y-8">
          {visibleGroups.map((group) => {
            // The registry's English title is only a fallback — a module the
            // sidebar can name should be named the same way here.
            const key = sidebarKeyForSlug(group.moduleSlug);
            const label = tSidebar.has(key) ? tSidebar(key) : group.moduleSlug;

            return (
              <section key={group.moduleSlug} aria-labelledby={`fav-${group.moduleSlug}`}>
                <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                  {/* The module's colour moves to the heading now that the
                      section itself names the module — inside a group, a
                      per-row badge repeating that heading is pure noise. */}
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${moduleBadgeColor(
                      group.moduleSlug
                    )}`}
                  >
                    {label}
                  </span>
                  <h2 id={`fav-${group.moduleSlug}`} className="sr-only">
                    {label}
                  </h2>
                  <span className="text-xs font-medium text-muted">({group.entries.length})</span>
                </div>

                <CardGrid>
                  {group.entries.map((entry, i) => (
                    <EntityCard
                      key={entry.id}
                      index={i}
                      icon={iconForSlug(group.moduleSlug, Star)}
                      accentSlug={group.moduleSlug}
                      title={entry.headline}
                      href={entry.href}
                      tags={[
                        {
                          key: "starred",
                          label: t("starredAt", { when: formatRelativeTime(entry.createdAt) }),
                        },
                      ]}
                      corner={
                        <FavoriteButton
                          table={entry.table}
                          recordId={entry.recordId}
                          headline={entry.headline}
                          initialFavorited
                          variant="inline"
                        />
                      }
                    />
                  ))}
                </CardGrid>
              </section>
            );
          })}
        </div>
      )}
    </ListLayout>
  );
}
