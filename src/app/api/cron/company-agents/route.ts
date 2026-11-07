import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { runCompanyAgents } from "@/lib/company-agents/run";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * THE DAILY RUN OF THE COMPANY'S OWN AGENTS.
 *
 * SCHEDULED in vercel.json, once a day. The agents are autonomy 1: they
 * read production_errors and call /api/health, judge what they saw, and
 * write one row each into company_agent_runs. Nothing else is changed.
 * Which agents run is src/lib/company-agents/run.ts; what each decides is
 * src/lib/company-agents/agents.ts; the owner reads the rows in the
 * "Company agents" section of /dashboard/system-health.
 *
 * Auth: CRON_SECRET, fail-closed, same as every other cron route.
 * A failure to SAVE (the migration not run yet) is in the response and in
 * the log, and the results are returned regardless.
 */
export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const report = await runCompanyAgents();
    return NextResponse.json({
      ok: true,
      saved: report.saved,
      saveError: report.saveError,
      results: report.results.map(({ agentId, result }) => ({ agentId, status: result.status, summary: result.summary })),
    });
  } catch (err) {
    // runCompanyAgents is written not to throw; this is the net under it,
    // so an unexpected failure reaches production_errors instead of vanishing.
    logApiError("/api/cron/company-agents", err, { stage: "run" });
    return NextResponse.json({ ok: false, error: "run failed" }, { status: 500 });
  }
}
