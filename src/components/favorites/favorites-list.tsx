"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { formatRelativeTime } from "@/lib/format-time";
import { moduleBadgeColor } from "@/lib/module-colors";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import type { FavoriteEntry } from "@/lib/favorites";

export function FavoritesList({ entries }: { entries: FavoriteEntry[] }) {
  const t = useTranslations("dashboard.favorites");

  if (entries.length === 0) {
    return <EmptyState icon={Star}>{t("emptyState")}</EmptyState>;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-3 rounded-2xl border border-border bg-panel p-4 transition-all duration-200 hover:border-orange-500/40"
        >
          <span
            className={`mt-0.5 inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${moduleBadgeColor(
              entry.moduleSlug
            )}`}
          >
            {entry.moduleTitle}
          </span>
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
  );
}
