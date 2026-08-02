import Link from "next/link";
import { ChevronRight, Rocket } from "lucide-react";

// Read-only digest for the Home page — real progress on the user's most
// recently created active (planning/in_progress) mission, computed from
// the same ai_missions data Mission Control itself reads (see
// lib/mission-progress.ts). No new state, nothing mutated here.
export function ActiveMissionCard({
  title,
  goal,
  progressPercent,
  stepsLabel,
  href,
}: {
  title: string;
  goal: string;
  progressPercent: number;
  stepsLabel: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-panel p-4 transition-all duration-200 hover:border-orange-500/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
        <Rocket className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <span className="shrink-0 text-xs font-semibold text-orange-400">{progressPercent}%</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">{goal}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-input">
          <div
            className="h-full rounded-full bg-orange-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-muted">{stepsLabel}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}
