import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { scrubSecrets } from "@/lib/scrub-secrets";
import {
  analyzeAnomalies,
  analyzeBudget,
  analyzeConcentration,
  analyzeCost,
  analyzeExpenses,
  analyzeFeatureCosts,
  analyzeQueue,
  analyzeDatabase,
  analyzeErrors,
  analyzeHeaders,
  analyzeHealth,
  analyzeLapse,
  analyzePaidShare,
  analyzeRetention,
  analyzeSignups,
  analyzeUpsell,
  analyzeUsage,
  analyzeRevenue,
  analyzeStaleness,
  summarizeRun,
  ERROR_READ_LIMIT,
  type AgentResult,
  type CostHour,
  type DayCost,
  type FeatureCost,
  type OpenJob,
  type UserCost,
  type ErrorRow,
  type ExposureRow,
  type HeadersProbe,
  type Kpis,
  type HealthProbe,
  type PastRun,
  type RevenueFigure,
} from "@/lib/company-agents/agents";
import { monthlyRecurringRevenue, type MrrInputRow } from "@/lib/billing/monthly-revenue";
import { RUNNING_AGENT_IDS } from "@/lib/company-agents/roster";

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

/** One database function, or null when it could not be called. */
async function callRpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>[] | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc(name, args);
    if (error) throw error;
    return (data ?? []) as Record<string, unknown>[];
  } catch (err) {
    logApiError("/api/cron/company-agents", err, { stage: `rpc ${name}` });
    return null;
  }
}

async function readExposure(): Promise<ExposureRow[] | null> {
  const rows = await callRpc("db_exposure_report", {});
  if (rows === null) return null;
  return rows.map((r) => ({ checkKey: String(r.check_key ?? "unknown"), found: Number(r.found ?? 0), expected: Number(r.expected ?? 0), ok: r.ok === true }));
}

async function readCost(): Promise<CostHour[] | null> {
  const rows = await callRpc("cost_hourly_calls", { p_hours: 24 * 8 });
  if (rows === null) return null;
  return rows.map((r) => ({ hour: String(r.hour), calls: Number(r.calls ?? 0), costEur: Number(r.cost_eur ?? 0) }));
}

async function readRevenue(): Promise<RevenueFigure> {
  const rows = await callRpc("mrr_inputs", {});
  if (rows === null) return null;
  return monthlyRecurringRevenue(
    rows.map((r): MrrInputRow => ({ tier: String(r.tier), billingInterval: String(r.billing_interval), subscribers: Number(r.subscribers ?? 0), seats: Number(r.seats ?? 0) }))
  );
}

async function probeHeaders(): Promise<HeadersProbe> {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (origin === "") return null;
  try {
    const res = await fetch(`${origin}/`, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { reached: true, httpStatus: res.status, headers };
  } catch {
    return { reached: false, httpStatus: null, headers: {} };
  }
}

async function readOpenJobs(): Promise<{ open: OpenJob[]; failed24h: number | null } | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ai_jobs")
      .select("status, updated_at")
      .in("status", ["queued", "running"])
      .order("updated_at", { ascending: true })
      .limit(500);
    if (error) throw error;
    const open = ((data ?? []) as Record<string, unknown>[]).map((r) => ({ status: String(r.status), updatedAt: String(r.updated_at) }));
    let failed24h: number | null = null;
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const failed = await admin.from("ai_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", since);
    if (!failed.error) failed24h = failed.count ?? 0;
    return { open, failed24h };
  } catch (err) {
    logApiError("/api/cron/company-agents", err, { stage: "read ai_jobs" });
    return null;
  }
}

async function readCallsToday(): Promise<number | null> {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await admin.from("daily_ai_spend_tracking").select("total_calls").eq("date", today).maybeSingle();
    if (error) throw error;
    return Number((data as { total_calls?: unknown } | null)?.total_calls ?? 0);
  } catch (err) {
    logApiError("/api/cron/company-agents", err, { stage: "read daily_ai_spend_tracking" });
    return null;
  }
}

async function readUserCosts(): Promise<UserCost[] | null> {
  const rows = await callRpc("cost_user_totals", { p_days: 1 });
  if (rows === null) return null;
  return rows.map((r) => ({ userId: String(r.user_id), costEur: Number(r.cost_eur ?? 0), calls: Number(r.calls ?? 0) }));
}

async function readFeatureCosts(): Promise<FeatureCost[] | null> {
  const rows = await callRpc("cost_by_feature", { p_days: 30 });
  if (rows === null) return null;
  return rows.map((r) => ({ feature: String(r.feature), costEur: Number(r.cost_eur ?? 0), calls: Number(r.calls ?? 0), creditsCharged: Number(r.credits_charged ?? 0) }));
}

async function readDayCosts(): Promise<DayCost[] | null> {
  const rows = await callRpc("cost_daily_totals", { p_days: 14 });
  if (rows === null) return null;
  return rows.map((r) => ({ day: String(r.day), costEur: Number(r.cost_eur ?? 0), calls: Number(r.calls ?? 0) }));
}

async function readKpis(): Promise<Kpis> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("company_kpis");
    if (error) throw error;
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as Record<string, unknown>[]) out[String(r.metric)] = Number(r.value);
    return out;
  } catch (err) {
    logApiError("/api/cron/company-agents", err, { stage: "rpc company_kpis" });
    return null;
  }
}

/** The rows written by earlier runs, for task-auditor. Read BEFORE this run saves its own. */
async function readPastRuns(): Promise<PastRun[] | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("company_agent_runs")
      .select("agent_id, ran_at")
      .in("agent_id", [...RUNNING_AGENT_IDS])
      .order("ran_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ agentId: String(r.agent_id), ranAt: String(r.ran_at) }));
  } catch (err) {
    logApiError("/api/cron/company-agents", err, { stage: "read company_agent_runs" });
    return null;
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
  // One read feeds all seven KPI agents: they judge the same snapshot.
  const kpis = await readKpis();
  const results = [
    await runOne("error-log-analyst", async () => analyzeErrors(await readErrors())),
    await runOne("api-uptime-monitor", async () => analyzeHealth(await probeHealth())),
    await runOne("database-health", async () => analyzeDatabase(await readExposure())),
    await runOne("cost-optimizer", async () => analyzeCost(await readCost(), Date.now())),
    await runOne("revenue-tracker", async () => analyzeRevenue(await readRevenue())),
    await runOne("headers-checker", async () => analyzeHeaders(await probeHeaders())),
    await runOne("queue-monitor", async () => {
      const jobs = await readOpenJobs();
      return analyzeQueue(jobs?.open ?? null, jobs?.failed24h ?? null, Date.now());
    }),
    // Same default as lib/ai-circuit-breaker.ts (5000) and the same env var.
    await runOne("budget-monitor", async () => analyzeBudget(await readCallsToday(), Number(process.env.MAX_DAILY_AI_CALLS) || 5000)),
    await runOne("fraud-alert", async () => analyzeConcentration(await readUserCosts())),
    await runOne("cost-per-agent", async () => analyzeFeatureCosts(await readFeatureCosts())),
    await runOne("expense-tracker", async () => analyzeExpenses(await readDayCosts(), Date.now())),
    await runOne("kpi-monitor", async () => analyzeSignups(kpis)),
    await runOne("usage-monitor", async () => analyzeUsage(kpis)),
    await runOne("churn-predictor", async () => analyzeLapse(kpis)),
    await runOne("retention", async () => analyzeRetention(kpis)),
    await runOne("upsell", async () => analyzeUpsell(kpis)),
    await runOne("anomaly-detector", async () => analyzeAnomalies(kpis)),
    await runOne("sales-analytics", async () => analyzePaidShare(kpis)),
    await runOne("task-auditor", async () => analyzeStaleness(await readPastRuns(), RUNNING_AGENT_IDS, Date.now())),
  ];
  // LAST, because it reports on everything above.
  results.push(await runOne("daily-reporter", async () => summarizeRun(results)));

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
