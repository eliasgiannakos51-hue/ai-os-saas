"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Bell, Sparkles, Wrench, ArrowUpRight } from "lucide-react";
import { useChangelog } from "@/components/changelog/changelog-context";
import { formatRelativeTime } from "@/lib/format-time";

/**
 * The bell (V3 Task 13). The badge counts UNSEEN published updates for
 * this viewer's plan; opening the dropdown lists them and marks them
 * seen — which is also the tracking ("who saw it") side, one insert per
 * viewer per update.
 */
export function ChangelogBell() {
  const t = useTranslations("changelog");
  const { updates, unseenCount, markSeen } = useChangelog();
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unseenCount > 0) {
      markSeen(updates.filter((u) => !u.seen).map((u) => u.id));
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={t("bellLabel")}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel hover:text-foreground"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unseenCount > 0 && (
          <span
            aria-label={t("unseenBadge", { count: unseenCount })}
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-black"
          >
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-panel p-2 shadow-lg">
          <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t("whatsNew")}
          </p>
          {updates.length === 0 ? (
            <p className="px-2 pb-2 text-xs text-muted">{t("empty")}</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {updates.slice(0, 8).map((update) => (
                <li key={update.id} className="rounded-lg p-2 hover:bg-panel-hover">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    {update.type === "feature" ? (
                      <Sparkles className="h-3 w-3 shrink-0 text-orange-400" aria-hidden="true" />
                    ) : (
                      <Wrench className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{update.title}</span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted">
                    {update.description}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted/70">
                    {formatRelativeTime(update.publishedAt, locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/changelog"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-orange-400 hover:bg-panel-hover"
          >
            {t("viewAll")}
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
