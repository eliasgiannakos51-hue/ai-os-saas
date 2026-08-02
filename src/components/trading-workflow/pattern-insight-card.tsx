import { Activity } from "lucide-react";

// Pure presentational, same convention as overview/ai-coach-card.tsx —
// the page resolves the actual sentence via getTranslations and passes it
// down already-formatted; every number behind it comes straight from
// lib/trading-pattern.ts's pure (no-AI) calculation.
export function PatternInsightCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.03] p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
        <Activity className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{message}</p>
      </div>
    </div>
  );
}
