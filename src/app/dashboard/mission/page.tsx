import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { MissionForm } from "@/components/mission/mission-form";
import { MissionList } from "@/components/mission/mission-list";
import { ScheduledRunsList } from "@/components/mission/scheduled-runs-list";
import { MISSION_ICON } from "@/lib/module-icons";
import type { Mission } from "@/types/mission";
import type { ScheduledAgentRun } from "@/types/scheduled-agent-run";

export const metadata: Metadata = { title: "Mission Control" };

// Explicit, not just implicit-via-cookies(): Next.js App Router's fetch
// Data Cache can, in some versions/edge cases, still cache a GET request
// made by a library (like supabase-js) even inside a route that's
// otherwise dynamically rendered. This route reads real, frequently-
// changing ai_missions rows, so it must never serve a cached result —
// force-dynamic removes any ambiguity rather than relying on cookies()
// alone to imply it.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// "AI Company" concept, deliberately kept to 3 agents (Planner, Builder,
// Reviewer) and user-driven at every step — not autonomous. Planner runs
// server-side in /api/mission/plan (lib/mission-agents.ts); Builder is just
// the ALREADY-EXISTING /api/create ("Create Anything"), called once per
// step from mission-card.tsx when the user clicks "Create with AI";
// Reviewer runs server-side in /api/mission/review once every step is
// done. Nothing here runs on its own.
export default async function MissionPage() {
  const t = await getTranslations("dashboard.mission");
  const supabase = createClient();

  // TEMPORARY diagnostic logging for the "missions disappear on refresh"
  // investigation — every request to this page logs its own auth + query
  // outcome so a real refresh-loop can be traced from Vercel's function
  // logs. Safe to remove once the root cause (see next.config.mjs's
  // staleTimes comment) is confirmed live and no longer reproduces.
  const reqId = Math.random().toString(36).slice(2, 8);
  // eslint-disable-next-line no-console
  console.error(`[mission-diag ${reqId}] request start at ${new Date().toISOString()}`);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // eslint-disable-next-line no-console
  console.error(
    `[mission-diag ${reqId}] auth.getUser() -> user=${user?.id ?? "null"} error=${userError?.message ?? "none"}`
  );

  if (!user) {
    // eslint-disable-next-line no-console
    console.error(`[mission-diag ${reqId}] no user, redirecting to /login`);
    redirect("/login");
  }

  const [{ data: missions, error }, { data: scheduledRuns }] = await Promise.all([
    supabase.from("ai_missions").select("*").order("created_at", { ascending: false }),
    supabase
      .from("scheduled_agent_runs")
      .select("*")
      .eq("status", "pending")
      .order("scheduled_for", { ascending: true }),
  ]);

  // eslint-disable-next-line no-console
  console.error(
    `[mission-diag ${reqId}] ai_missions query -> rows=${missions?.length ?? "null"} error=${error?.message ?? "none"} ids=${
      (missions as Mission[] | null)?.map((m) => m.id.slice(0, 8)).join(",") ?? "-"
    }`
  );

  const pendingRuns = (scheduledRuns as ScheduledAgentRun[] | null) ?? [];
  const scheduledStepIndicesByMission: Record<string, number[]> = {};
  for (const run of pendingRuns) {
    const list = scheduledStepIndicesByMission[run.mission_id] ?? [];
    list.push(run.step_index);
    scheduledStepIndicesByMission[run.mission_id] = list;
  }

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={MISSION_ICON} title={t("title")} description={t("description")} />

        <div className="mb-6">
          <MissionForm />
        </div>

        <ScheduledRunsList runs={pendingRuns} />

        {error && <ErrorMessage message={`loading missions: ${error.message}`} />}

        <MissionList
          missions={(missions as Mission[] | null) ?? []}
          scheduledStepIndicesByMission={scheduledStepIndicesByMission}
        />
      </div>
    </main>
  );
}
