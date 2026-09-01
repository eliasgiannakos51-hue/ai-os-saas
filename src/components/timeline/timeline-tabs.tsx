"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { History, Star } from "lucide-react";

/**
 * The two views this one page now carries — V4.6 #3.
 *
 * Favorites, History and "search my records" were three sidebar rows for
 * one question: "where is the thing I made?" They are one row now, and
 * these are its two answers: everything, newest first, and starred only.
 *
 * The starred view is NOT the timeline filtered. loadTimelineEntries
 * scans 60 rows per module and keeps 200, so filtering its output would
 * have silently dropped older favorites; and favorites also cover chats,
 * published sites, missions and documents, none of which the timeline
 * scans at all. Each tab reads its own source, which is why this is a
 * link and not a checkbox.
 */
export function TimelineTabs({ view }: { view: "all" | "fav" }) {
  const t = useTranslations("dashboard.timeline");

  const tabs = [
    { id: "all" as const, href: "/dashboard/timeline", label: t("tabAll"), Icon: History },
    { id: "fav" as const, href: "/dashboard/timeline?view=fav", label: t("tabStarred"), Icon: Star },
  ];

  return (
    <div role="tablist" aria-label={t("title")} className="mb-4 flex flex-wrap gap-1.5">
      {tabs.map(({ id, href, label, Icon }) => {
        const active = view === id;
        return (
          <Link
            key={id}
            href={href}
            role="tab"
            aria-selected={active}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors duration-150 ${
              active
                ? "border-orange-500/50 bg-orange-500/15 font-semibold text-orange-200"
                : "border-border text-muted hover:border-orange-500/40 hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
