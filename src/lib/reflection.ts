import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINKABLE_MODULES } from "@/lib/knowledge-graph";
import { logApiError } from "@/lib/log-error";
import type { Mission } from "@/types/mission";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type ModuleWeeklyStat = {
  moduleTitle: string;
  thisWeek: number;
  lastWeek: number;
};

export type MissionWeeklyStat = {
  activeMissions: number;
  stepsCompleted: number;
  stepsPending: number;
  // Missions are per-row, not per-step, so "completed this week" can't be
  // known precisely without a per-step timestamp (not part of the given
  // schema) — a mission's updated_at moves every time one of its steps is
  // completed (see set_updated_at trigger + mission-card.tsx's buildStep),
  // so "missions touched this week" is used as an honest proxy for
  // mission-related activity instead of a fabricated precise count.
  missionsTouchedThisWeek: number;
  missionsTouchedLastWeek: number;
};

export type WeeklyReflectionStats = {
  moduleStats: ModuleWeeklyStat[];
  totalThisWeek: number;
  totalLastWeek: number;
  missionStats: MissionWeeklyStat;
};

// Rolling 7-day windows anchored to "now", not calendar weeks — same
// reasoning as dashboard/overview/page.tsx's sparkline: no reliable
// per-user timezone available server-side, and a rolling window is honest
// about what it actually measures regardless of when in the week this
// runs.
export async function loadWeeklyReflectionStats(
  supabase: SupabaseClient,
  userId: string,
  // Trading Workflow's "Trading Reflection" (see
  // reflection-generator.tsx's `scope` prop) restricts which modules get
  // scanned — undefined (every other caller) scans every LINKABLE_MODULES
  // table exactly as before.
  tableFilter?: string[]
): Promise<WeeklyReflectionStats> {
  const now = Date.now();
  const twoWeeksAgoIso = new Date(now - 2 * WEEK_MS).toISOString();

  const modules = tableFilter
    ? LINKABLE_MODULES.filter((m) => tableFilter.includes(m.table))
    : LINKABLE_MODULES;

  const moduleStats: ModuleWeeklyStat[] = await Promise.all(
    modules.map(async (config) => {
      const { data, error } = await supabase
        .from(config.table)
        .select("created_at")
        .gte("created_at", twoWeeksAgoIso);

      if (error || !data) {
        if (error) {
          logApiError("reflection:loadWeeklyReflectionStats", error, { table: config.table });
        }
        return { moduleTitle: config.title, thisWeek: 0, lastWeek: 0 };
      }

      let thisWeek = 0;
      let lastWeek = 0;
      for (const row of data as { created_at: string }[]) {
        const ageMs = now - new Date(row.created_at).getTime();
        if (ageMs < WEEK_MS) thisWeek += 1;
        else if (ageMs < 2 * WEEK_MS) lastWeek += 1;
      }
      return { moduleTitle: config.title, thisWeek, lastWeek };
    })
  );

  const totalThisWeek = moduleStats.reduce((sum, m) => sum + m.thisWeek, 0);
  const totalLastWeek = moduleStats.reduce((sum, m) => sum + m.lastWeek, 0);

  const { data: missionRows, error: missionError } = await supabase.from("ai_missions").select("*");
  if (missionError) {
    logApiError("reflection:loadWeeklyReflectionStats", missionError, { stage: "missions" });
  }
  const missions = (missionRows as Mission[] | null) ?? [];

  let activeMissions = 0;
  let stepsCompleted = 0;
  let stepsPending = 0;
  let missionsTouchedThisWeek = 0;
  let missionsTouchedLastWeek = 0;

  for (const mission of missions) {
    if (mission.status === "planning" || mission.status === "in_progress") {
      activeMissions += 1;
      const steps = mission.plan_steps?.steps ?? [];
      stepsCompleted += steps.filter((s) => s.status === "completed").length;
      stepsPending += steps.filter((s) => s.status === "pending").length;
    }

    const ageMs = now - new Date(mission.updated_at).getTime();
    if (ageMs < WEEK_MS) missionsTouchedThisWeek += 1;
    else if (ageMs < 2 * WEEK_MS) missionsTouchedLastWeek += 1;
  }

  return {
    moduleStats,
    totalThisWeek,
    totalLastWeek,
    missionStats: {
      activeMissions,
      stepsCompleted,
      stepsPending,
      missionsTouchedThisWeek,
      missionsTouchedLastWeek,
    },
  };
}
