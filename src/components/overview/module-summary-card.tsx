import Link from "next/link";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { formatRelativeTime } from "@/lib/format-time";

export function ModuleSummaryCard({
  module,
  href,
  count,
  latest,
  loadError,
}: {
  module: ModuleConfig;
  href: string;
  count: number;
  latest: ModuleRecord | null;
  loadError?: string;
}) {
  const headline = latest ? (latest[module.headlineKey] ?? "untitled") : null;

  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-md border border-border bg-panel p-4 transition-colors hover:border-amber-800"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {module.title}
        </h3>
        <span className="shrink-0 rounded border border-border bg-black/30 px-2 py-0.5 text-xs text-amber-400">
          {count} {count === 1 ? "entry" : "entries"}
        </span>
      </div>

      {loadError ? (
        <p className="text-xs text-red-400">error: {loadError}</p>
      ) : latest ? (
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground/90">{headline}</p>
          <p
            className="mt-1 text-xs text-muted"
            title={new Date(latest.created_at).toLocaleString()}
            suppressHydrationWarning
          >
            {formatRelativeTime(latest.created_at)}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">no entries yet</p>
      )}

      <span className="mt-auto text-xs text-amber-500">
        view {module.title.toLowerCase()} →
      </span>
    </Link>
  );
}
