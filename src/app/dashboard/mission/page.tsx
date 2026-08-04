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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
