import { Sparkles } from "lucide-react";

// Pure server-computed summary — every number behind `summary` comes
// straight from the same COUNT queries the rest of the Overview page
// already runs (see dashboard/overview/page.tsx), no AI/Claude call
// involved, so it's instant and free to render on every load. Text is
// resolved (via getTranslations) by the page itself and passed down
// already-formatted, same pattern as StatCard/RecentEntriesCard — none of
// Overview's other cards call next-intl themselves.
// NOTE: there is deliberately no "thinking" indicator on this card. The
// summary is computed synchronously from COUNT queries the page already
// ran — nothing is ever in flight here, so an animated "analysing..."
// state would be pure theatre. The real indicator lives where real AI
// work happens (components/ui/thinking-indicator.tsx, used by Mission
// Control while a step is actually building).
export function AiCoachCard({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="glass-panel mt-6 flex items-start gap-3 rounded-2xl p-4">
      <span className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/30 to-purple-500/20 text-orange-300 ring-1 ring-inset ring-white/10">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="relative z-[1] min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{summary}</p>
      </div>
    </div>
  );
}
