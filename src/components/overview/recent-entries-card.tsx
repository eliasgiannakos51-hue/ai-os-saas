import Link from "next/link";
import { Clock } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-time";

export type RecentEntry = {
  id: string;
  title: string;
  moduleTitle: string;
  href: string;
  createdAt: string;
};

export function RecentEntriesCard({ entries }: { entries: RecentEntry[] }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-5 sm:col-span-2 lg:col-span-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Recent Entries
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No entries yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={entry.href}
                className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 transition-colors duration-150 hover:bg-panel-hover"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{entry.title}</p>
                  <p className="text-xs text-muted">{entry.moduleTitle}</p>
                </div>
                <span
                  className="shrink-0 text-xs text-muted"
                  title={new Date(entry.createdAt).toLocaleString()}
                  suppressHydrationWarning
                >
                  {formatRelativeTime(entry.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
