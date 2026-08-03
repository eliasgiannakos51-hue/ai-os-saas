"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { ScheduledAgentRun } from "@/types/scheduled-agent-run";

// "Scheduled for later" — every pending scheduled_agent_runs row across
// all of the user's missions, so they can see what will run and when
// without opening each mission individually. Purely a status list plus a
// cancel action; the actual execution is entirely api/cron/scheduled-runs'
// job, never triggered from here.
export function ScheduledRunsList({ runs }: { runs: ScheduledAgentRun[] }) {
  const t = useTranslations("dashboard.mission");
  const router = useRouter();
  const supabase = createClient();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  if (runs.length === 0) return null;

  async function cancelRun(id: string) {
    if (cancellingId) return;
    setCancellingId(id);
    const { error } = await supabase.from("scheduled_agent_runs").delete().eq("id", id);
    setCancellingId(null);
    if (!error) {
      router.refresh();
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-border bg-panel p-4">
      <div className="mb-2 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-orange-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">{t("scheduledSectionTitle")}</p>
      </div>
      <ul className="space-y-1.5">
        {runs.map((run) => (
          <li
            key={run.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-input px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{run.step_text}</span>
            <span className="shrink-0 text-[11px] text-muted">
              {t("scheduledForDate", { date: run.scheduled_for })}
            </span>
            <button
              type="button"
              onClick={() => cancelRun(run.id)}
              disabled={cancellingId === run.id}
              aria-label={t("cancelScheduled")}
              title={t("cancelScheduled")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
