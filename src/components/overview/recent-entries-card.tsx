import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Clock } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-time";

export type RecentEntry = {
  id: string;
  title: string;
  moduleTitleKey: string;
  href: string;
  createdAt: string;
};

export async function RecentEntriesCard({ entries }: { entries: RecentEntry[] }) {
  const t = await getTranslations("dashboard.overview.recentEntries");
  const locale = await getLocale();
  const tKey = await getTranslations();

  // NO col-span HERE ANY MORE. `sm:col-span-2 lg:col-span-1` was left
  // over from the three-column row this card used to sit in, which the
  // Home rework removed. A span class on a card that its only caller now
  // places in a two-column grid is not inert: spanning 2 inside a
  // one-column grid makes CSS create an implicit second column, and the
  // row silently doubles in width. The caller owns the layout.
  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
          <Clock className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-[15px] font-semibold text-foreground">{t("title")}</p>
      </div>

      {entries.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Clock className="h-4 w-4 shrink-0 text-muted/80" aria-hidden="true" />
          {t("empty")}
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={entry.href}
                className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 transition-colors duration-150 hover:bg-panel-hover"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{entry.title}</p>
                  <p className="text-xs text-muted">{tKey(entry.moduleTitleKey)}</p>
                </div>
                <span
                  className="shrink-0 text-xs text-muted"
                  title={new Date(entry.createdAt).toLocaleString(locale)}
                  suppressHydrationWarning
                >
                  {formatRelativeTime(entry.createdAt, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
