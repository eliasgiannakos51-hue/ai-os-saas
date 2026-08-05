import type { Metadata } from "next";
import { diagLog } from "@/lib/diag";
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
  diagLog(`[mission-diag ${reqId}] request start at ${new Date().toISOString()}`);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  diagLog(`[mission-diag ${reqId}] auth.getUser() -> user=${user?.id ?? "null"} error=${userError?.message ?? "none"}`);

  if (!user) {
    diagLog(`[mission-diag ${reqId}] no user, redirecting to /login`);
    redirect("/login");
  }

  // DEFECT 2 (fixed here): this query used to carry NO user filter at all
  // and relied entirely on RLS to scope it. That is correct for security,
  // but it makes two very different outcomes indistinguishable:
  //
  //   - "this user genuinely has no missions"      -> 0 rows, no error
  //   - "the session degraded to anonymous"        -> 0 rows, no error
  //
  // PostgREST does not error when RLS filters everything out; it returns
  // an empty set. So a lost session rendered the empty state instead of
  // an error, which is precisely the reported symptom: the missions
  // "disappear" and the page looks normal.
  //
  // The explicit .eq() does not replace RLS (RLS still enforces it) — it
  // puts the intent in the code, and it lets the check below tell the two
  // cases apart by comparing against a count taken with the same filter.
  const [{ data: missions, error }, { data: scheduledRuns }] = await Promise.all([
    supabase
      .from("ai_missions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("scheduled_agent_runs")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("scheduled_for", { ascending: true }),
  ]);

  diagLog(`[mission-diag ${reqId}] ai_missions query -> rows=${missions?.length ?? "null"} error=${error?.message ?? "none"} ids=${
      (missions as Mission[] | null)?.map((m) => m.id.slice(0, 8)).join(",") ?? "-"
    }`);

  // The one check that separates "no missions" from "no session". A
  // degraded session cannot read the row it is asking about, so a
  // head-count that comes back null while getUser() reported a user is a
  // session problem, not an empty account — and must NOT render as the
  // friendly empty state.
  const { count: ownedCount, error: countError } = await supabase
    .from("ai_missions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const sessionDegraded = countError !== null || ownedCount === null;

  diagLog(`[mission-diag ${reqId}] ownership count -> count=${ownedCount ?? "null"} error=${
      countError?.message ?? "none"
    } sessionDegraded=${sessionDegraded}`);

  diagLog(`[mission-diag ${reqId}] render -> missionsPassedToComponent=${
      (missions as Mission[] | null)?.length ?? 0
    } pendingRuns=${(scheduledRuns as ScheduledAgentRun[] | null)?.length ?? 0}`);

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

        {/* A degraded session must never render as "you have no missions".
            Showing a reload prompt instead is the difference between the
            user thinking their data was deleted and the user pressing
            reload once, which is all the recovery this needs now that the
            middleware keeps the refresh-token chain intact. */}
        {!error && sessionDegraded && (
          <ErrorMessage message={t("sessionExpired")} />
        )}

        {!sessionDegraded && (
          <MissionList
            missions={(missions as Mission[] | null) ?? []}
            scheduledStepIndicesByMission={scheduledStepIndicesByMission}
          />
        )}
      </div>
    </main>
  );
}
