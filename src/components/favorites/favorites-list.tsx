"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { moduleBadgeColor } from "@/lib/module-colors";
import { sidebarKeyForSlug } from "@/lib/favoritable";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import type { FavoriteGroup } from "@/lib/favorites";

/**
 * Favorites, grouped by module with a heading and a count.
 *
 * The flat reverse-chronological list this replaced answered "what did I
 * star most recently", which is not why anyone opens this page. They came
 * looking for one specific thing and they remember which module it lived
 * in — so the module is the axis worth organising by, and the count tells
 * them at a glance whether it's worth scanning the section at all.
 */
export function FavoritesList({ groups }: { groups: FavoriteGroup[] }) {
  const formatRelativeTime = useFormatRelativeTime();
  const t = useTranslations("dashboard.favorites");
  const tSidebar = useTranslations("sidebar.items");

  if (groups.length === 0) {
    return <EmptyState icon={Star}>{t("emptyState")}</EmptyState>;
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => {
        // The registry's English title is only a fallback — a module the
        // sidebar can name should be named the same way here.
        const key = sidebarKeyForSlug(group.moduleSlug);
        const label = tSidebar.has(key) ? tSidebar(key) : group.moduleTitle;

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

            <div className="space-y-2">
              {group.entries.map((entry, i) => (
                <div
                  key={entry.id}
                  style={{ "--i": i } as React.CSSProperties}
                  className="list-slide-in relative flex items-start gap-3 rounded-2xl border border-border bg-panel p-4 pr-14 transition-all duration-200 hover:border-orange-500/40"
                >
                  <Link href={entry.href} className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground hover:text-orange-400">
                      {entry.headline}
                    </h3>
                    <p
                      className="mt-0.5 text-xs text-muted"
                      title={new Date(entry.createdAt).toLocaleString()}
                      suppressHydrationWarning
                    >
                      {formatRelativeTime(entry.createdAt)}
                    </p>
                  </Link>
                  <FavoriteButton
                    table={entry.table}
                    recordId={entry.recordId}
                    headline={entry.headline}
                    initialFavorited
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
