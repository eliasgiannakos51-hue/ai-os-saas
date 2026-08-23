import { TrendingUp } from "lucide-react";

// Real COUNT-query numbers only (see overview/page.tsx's summaries
// aggregation) — no synthetic "productivity score" or gamified framing,
// just how many entries were actually created across every module in
// each window. Same pattern as StatCard: translation happens in the
// Server Component parent (getTranslations), this stays presentational.
export function ProgressCard({
  title,
  stats,
}: {
  title: string;
  stats: { label: string; value: number }[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-[linear-gradient(160deg,rgb(var(--panel))_0%,rgb(var(--panel))_65%,rgba(249,115,22,0.035)_100%)] p-5">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
        <TrendingUp className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-xs uppercase tracking-wide text-muted">{title}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <p className="truncate text-xl font-bold text-foreground">{stat.value}</p>
            <p className="truncate text-[11px] text-muted/80">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
