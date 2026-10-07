"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { History, Library, Star } from "lucide-react";

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
export function TimelineTabs({ view, library = false }: { view: "library" | "all" | "fav"; library?: boolean }) {
  const t = useTranslations("dashboard.timeline");
  const tLibrary = useTranslations("dashboard.library");

  // WITH THE SWITCH "library" ON (package 5) this page opens on the
  // Library, and the entries move one tab along to ?view=entries — read in
  // app/dashboard/timeline/page.tsx. With it off, the two tabs as before.
  const tabs = [
    ...(library ? [{ id: "library" as const, href: "/dashboard/timeline", label: tLibrary("tab"), Icon: Library }] : []),
    { id: "all" as const, href: library ? "/dashboard/timeline?view=entries" : "/dashboard/timeline", label: t("tabAll"), Icon: History },
    // THE STAR GOES TO THE STARRED PAGE. It used to point at
    // /dashboard/timeline?view=fav while /dashboard/favorites redirected
    // here — so the page had an address nobody ever landed on, and the
    // one people had bookmarked bounced. dashboard/favorites/page.tsx is
    // now the page; the query string still renders the same view for
    // anything already linking to it.
    { id: "fav" as const, href: "/dashboard/favorites", label: t("tabStarred"), Icon: Star },
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
                ? "border-foreground/50 bg-foreground/15 font-semibold text-foreground"
                : "border-border text-muted hover:border-foreground/40 hover:text-foreground"
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
