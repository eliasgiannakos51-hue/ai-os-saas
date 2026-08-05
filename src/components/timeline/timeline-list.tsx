"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2, History } from "lucide-react";
import { useTranslations } from "next-intl";
import { PaginationControls } from "@/components/pagination-controls";
import { EmptyState } from "@/components/empty-state";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { moduleBadgeColor } from "@/lib/module-colors";
import type { TimelineEntry } from "@/lib/timeline";

const PAGE_SIZE = 20;

export function TimelineList({ entries }: { entries: TimelineEntry[] }) {
  const formatRelativeTime = useFormatRelativeTime();
  const t = useTranslations("dashboard.timeline");
  const [page, setPage] = useState(1);

  if (entries.length === 0) {
    return <EmptyState icon={History}>{t("emptyState")}</EmptyState>;
  }

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const paginated = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="space-y-2">
        {paginated.map((entry) => (
          <Link
            key={entry.key}
            href={entry.href}
            className="group flex items-start gap-3 rounded-2xl border border-border bg-panel p-4 transition-all duration-200 hover:border-orange-500/40 hover:shadow-[0_14px_32px_-18px_rgba(249,115,22,0.3)]"
          >
            <span
              className={`mt-0.5 inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${moduleBadgeColor(
                entry.moduleSlug
              )}`}
            >
              {entry.moduleTitle}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-sm font-semibold text-foreground">{entry.headline}</h3>
                {entry.linked.length > 0 && (
                  <span
                    className="flex shrink-0 items-center text-orange-400"
                    title={`Linked to: ${entry.linked.map((l) => l.headline).join(", ")}`}
                  >
                    <Link2 className="h-3 w-3" aria-hidden="true" />
                  </span>
                )}
              </div>
              {entry.excerpt && (
                <p className="mt-1 truncate text-xs text-muted">{entry.excerpt}</p>
              )}
            </div>
            <p
              className="shrink-0 text-xs text-muted"
              title={new Date(entry.createdAt).toLocaleString()}
              suppressHydrationWarning
            >
              {formatRelativeTime(entry.createdAt)}
            </p>
          </Link>
        ))}
      </div>
      <PaginationControls page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
