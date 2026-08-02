import { Activity } from "lucide-react";

// Pure presentational, same convention as overview/ai-coach-card.tsx —
// the page resolves each sentence via getTranslations and passes them
// down already-formatted; every number behind them comes straight from
// lib/trading-pattern.ts's pure (no-AI) calculations. One card, one or
// more insight lines (loss-streak, hour-of-day, day-of-week, symbol —
// only whichever ones the page found enough data for).
export function PatternInsightCard({ title, messages }: { title: string; messages: string[] }) {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.03] p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
        <Activity className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <ul className="mt-0.5 space-y-1">
          {messages.map((message, index) => (
            <li key={index} className="text-sm text-muted">
              {message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
