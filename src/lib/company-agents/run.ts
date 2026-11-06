import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { scrubSecrets } from "@/lib/scrub-secrets";
import {
  analyzeErrors,
  analyzeHealth,
  ERROR_READ_LIMIT,
  type AgentResult,
  type ErrorRow,
  type HealthProbe,
} from "@/lib/company-agents/agents";

/**
 * THE RUNNER: gather what each agent reads, judge it, write one row per
 * agent. Called by /api/cron/company-agents once a day.
 *
 * EACH AGENT STANDS ALONE. A read that throws turns THAT agent's row into
 * "unverified" and the others still run: one broken source must not take
 * down the report on the rest, and must not be recorded as "fine".
 *
 * IT NEVER THROWS AND NEVER CHANGES ANYTHING BUT ITS OWN TABLE. Both
 * agents are autonomy 1. The only write is the insert into
 * company_agent_runs; if that fails (the migration has not been run), the
 * failure is returned and logged, not hidden — the results are still
 * returned to the caller either way.
 *
 * The agent ids written here must equal RUNNING_AGENT_IDS in roster.ts;
 * company-agents.test.mjs holds that both ways.
 */

const HEALTH_TIMEOUT_MS = 10_000;

export type RunReport = {
  results: { agentId: string; result: AgentResult }[];
  saved: boolean;
  saveError: string | null;
};

async function readErrors(): Promise<ErrorRow[] | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("production_errors")
      .select("route, occurrence_count, resolved")
      .order("occurred_at", { ascending: false })
      .limit(ERROR_READ_LIMIT);
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      route: String(r.route ?? "unknown"),
      occurrenceCount: Number(r.occurrence_count ?? 0),
      resolved: Boolean(r.resolved),
    }));
  } catch (err) {
    logApiError("/api/cron/company-agents", err, { stage: "read production_errors" });
    return null;
  }
}

async function probeHealth(): Promise<HealthProbe> {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (origin === "") return null;
  const started = Date.now();
  try {
    const res = await fetch(`${origin}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    let ok: boolean | null = null;
    try {
      const body = (await res.json()) as { ok?: unknown };
      ok = typeof body.ok === "boolean" ? body.ok : null;
    } catch {
      ok = null;
    }
    return { reached: true, httpStatus: res.status, ok, ms: Date.now() - started };
  } catch {
    return { reached: false, httpStatus: null, ok: null, ms: Date.now() - started };
  }
}

/** One agent, isolated: a throw becomes an "unverified" row, not a crash. */
async function runOne(agentId: string, work: () => Promise<AgentResult>): Promise<{ agentId: string; result: AgentResult }> {
  try {
    return { agentId, result: await work() };
  } catch (err) {
    logApiError("/api/cron/company-agents", err, { stage: agentId });
    const message = scrubSecrets(err instanceof Error ? err.message : String(err)).slice(0, 200);
    return {
      agentId,
      result: {
        status: "unverified",
        summary: `The agent crashed before it could judge anything: ${message}`,
        evidence: {},
        unverified: ["everything: the agent did not finish"],
      },
    };
  }
}

export async function runCompanyAgents(): Promise<RunReport> {
  const results = [
    await runOne("error-log-analyst", async () => analyzeErrors(await readErrors())),
    await runOne("api-uptime-monitor", async () => analyzeHealth(await probeHealth())),
  ];

  let saveError: string | null = null;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("company_agent_runs").insert(
      results.map(({ agentId, result }) => ({
        agent_id: agentId,
        status: result.status,
        summary: result.summary,
        evidence: result.evidence,
        unverified: result.unverified,
      }))
    );
    if (error) throw error;
  } catch (err) {
    logApiError("/api/cron/company-agents", err, { stage: "save company_agent_runs" });
    saveError = scrubSecrets(err instanceof Error ? err.message : JSON.stringify(err)).slice(0, 200);
  }
  return { results, saved: saveError === null, saveError };
}
