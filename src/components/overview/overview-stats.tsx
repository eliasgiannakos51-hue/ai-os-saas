export function OverviewStats({
  totalEntries,
  recentEntries,
  mostActiveTitle,
  mostActiveCount,
}: {
  totalEntries: number;
  recentEntries: number;
  mostActiveTitle: string | null;
  mostActiveCount: number;
}) {
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-md border border-border bg-panel p-6">
        <p className="text-3xl font-bold text-amber-400">{totalEntries}</p>
        <p className="mt-1 text-xs uppercase tracking-widest text-muted">
          total entries
        </p>
      </div>

      <div className="rounded-md border border-border bg-panel p-6">
        <p className="text-3xl font-bold text-amber-400">{recentEntries}</p>
        <p className="mt-1 text-xs uppercase tracking-widest text-muted">
          last 7 days
        </p>
      </div>

      <div className="rounded-md border border-border bg-panel p-6">
        <p className="truncate text-3xl font-bold text-foreground">
          {mostActiveTitle && mostActiveCount > 0 ? mostActiveTitle : "—"}
        </p>
        <p className="mt-1 text-xs uppercase tracking-widest text-muted">
          most active module
          {mostActiveTitle && mostActiveCount > 0
            ? ` — ${mostActiveCount} ${mostActiveCount === 1 ? "entry" : "entries"}`
            : ""}
        </p>
      </div>
    </div>
  );
}
