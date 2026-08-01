import { Sparkles } from "lucide-react";

// Pure server-computed summary — every number behind `summary` comes
// straight from the same COUNT queries the rest of the Overview page
// already runs (see dashboard/overview/page.tsx), no AI/Claude call
// involved, so it's instant and free to render on every load. Text is
// resolved (via getTranslations) by the page itself and passed down
// already-formatted, same pattern as StatCard/RecentEntriesCard — none of
// Overview's other cards call next-intl themselves.
export function AiCoachCard({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.03] p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{summary}</p>
      </div>
    </div>
  );
}
