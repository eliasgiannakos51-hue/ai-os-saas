/**
 * THE JUDGEMENT OF THE FIRST TWO RUNNING AGENTS, AS PURE FUNCTIONS.
 *
 * Both are autonomy 1: they read and report, they change nothing. The
 * reading (a database query, an HTTP call) is in run.ts; what is decided
 * from what was read is here, with no I/O, so scripts/tests/
 * company-agents.test.mjs can feed it every shape — an empty table, a
 * table that could not be read, a capped read, an app that answers but
 * says it is not ok — and require the right word each time.
 *
 * THE RULE BOTH FOLLOW: a check that could not be run says
 * "unverified", never "ok". "ok" is a claim that something was looked at
 * and found fine; when the read failed, nothing was looked at.
 * `unverified` on the result lists what a green row did NOT cover, so a
 * reader cannot take "ok" for more than it measured.
 *
 * THE THRESHOLDS ARE CHOSEN, NOT MEASURED. "One open error is a warning"
 * is a starting rule written on 2026-11-06, not a figure derived from the
 * product's history; there is no history of runs yet to derive one from.
 * Revisit it when company_agent_runs has some.
 */

export type RunStatus = "ok" | "warn" | "fail" | "unverified";

export type AgentResult = {
  status: RunStatus;
  summary: string;
  evidence: Record<string, unknown>;
  unverified: string[];
};

export type ErrorRow = { route: string; occurrenceCount: number; resolved: boolean };

/** The most rows the error analyst reads. When it gets exactly this many,
 *  older rows exist that it did not see, and it says so. */
export const ERROR_READ_LIMIT = 500;

/** production_errors → one result. `rows` is null when the read failed. */
export function analyzeErrors(rows: ErrorRow[] | null, limit: number = ERROR_READ_LIMIT): AgentResult {
  if (rows === null) {
    return {
      status: "unverified",
      summary: "Could not read production_errors, so nothing was checked.",
      evidence: {},
      unverified: ["every open error: the read failed"],
    };
  }
  const open = rows.filter((r) => !r.resolved);
  const occurrences = open.reduce((sum, r) => sum + r.occurrenceCount, 0);
  const worst = [...open].sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0];
  const unverified = ["how serious each open error is: the agent counts rows, it does not judge severity"];
  if (rows.length >= limit) unverified.push(`older rows: the read stops at ${limit} and ${rows.length} came back`);
  if (open.length === 0) {
    return { status: "ok", summary: "No open production errors.", evidence: { open: 0, rowsRead: rows.length }, unverified };
  }
  return {
    status: "warn",
    summary: `${open.length} open production error(s), ${occurrences} occurrence(s). Most frequent: ${worst.route} (${worst.occurrenceCount}).`,
    evidence: { open: open.length, occurrences, worstRoute: worst.route, worstOccurrences: worst.occurrenceCount, rowsRead: rows.length },
    unverified,
  };
}

/** What the HTTP call to /api/health saw. `null` when it was not attempted. */
export type HealthProbe = { reached: boolean; httpStatus: number | null; ok: boolean | null; ms: number } | null;

/** The health probe → one result. */
export function analyzeHealth(probe: HealthProbe): AgentResult {
  const unverified = [
    "whether the pages themselves render: /api/health is the app's own answer, not a visit",
    "what individual users experience: one call, from the server, once",
  ];
  if (probe === null) {
    return {
      status: "unverified",
      summary: "No site address is configured (NEXT_PUBLIC_SITE_URL), so the app was not called.",
      evidence: {},
      unverified: ["the app's liveness: it was not called", ...unverified],
    };
  }
  if (!probe.reached) {
    return { status: "fail", summary: "The app did not answer /api/health.", evidence: { reached: false, ms: probe.ms }, unverified };
  }
  if (probe.httpStatus !== 200) {
    return { status: "fail", summary: `/api/health answered with HTTP ${probe.httpStatus}.`, evidence: { httpStatus: probe.httpStatus, ms: probe.ms }, unverified };
  }
  if (probe.ok !== true) {
    return { status: "fail", summary: "/api/health answered but reports that the app is not ok.", evidence: { httpStatus: 200, ok: probe.ok, ms: probe.ms }, unverified };
  }
  return { status: "ok", summary: `The app answered /api/health and says it is ok (${probe.ms} ms).`, evidence: { httpStatus: 200, ok: true, ms: probe.ms }, unverified };
}

// ---------------------------------------------------------------------------
// SECOND BATCH (2026-11-07): four agents that read the database or the site,
// and two that read the other agents' own rows. Same rules as above: pure
// functions, no I/O, a read that failed is "unverified", never "ok".
// Every threshold below is CHOSEN on 2026-11-07, not derived from history.
// ---------------------------------------------------------------------------

/** One row of public.db_exposure_report(). `null` for the whole input when the call failed. */
export type ExposureRow = { checkKey: string; found: number; expected: number; ok: boolean };

/** database-health: the database's own exposure report, read as it stands. */
export function analyzeDatabase(rows: ExposureRow[] | null): AgentResult {
  const unverified = [
    "whether each policy is correct: the report counts exposure, it does not read policy logic",
    "backups and restores: this agent does not look at them",
  ];
  if (rows === null) {
    return { status: "unverified", summary: "Could not read db_exposure_report(), so nothing was checked.", evidence: {}, unverified: ["every exposure check: the read failed", ...unverified] };
  }
  if (rows.length === 0) {
    return { status: "unverified", summary: "db_exposure_report() answered with no rows, so nothing was checked.", evidence: { checks: 0 }, unverified: ["every exposure check: no rows came back", ...unverified] };
  }
  const bad = rows.filter((r) => !r.ok);
  if (bad.length === 0) {
    return { status: "ok", summary: `All ${rows.length} exposure checks pass.`, evidence: { checks: rows.length, failing: 0 }, unverified };
  }
  return {
    status: "fail",
    summary: `${bad.length} of ${rows.length} exposure check(s) fail: ${bad.map((r) => `${r.checkKey} (found ${r.found}, expected ${r.expected})`).join("; ")}.`,
    evidence: { checks: rows.length, failing: bad.length, failingKeys: bad.map((r) => r.checkKey) },
    unverified,
  };
}

/** One hour of AI spend, as cost_hourly_calls() returns it. */
export type CostHour = { hour: string; calls: number; costEur: number };

/** A day's spend must be this many times the daily average of the week before it, AND this much above it in euro, to warn. */
export const COST_SPIKE_RATIO = 2;
export const COST_SPIKE_MIN_EUR = 1;

/** cost-optimizer: the last 24 hours of AI spend against the 7 days before them. */
export function analyzeCost(hours: CostHour[] | null, nowMs: number): AgentResult {
  const unverified = [
    "whether any spend was wasteful: the agent compares totals, it does not look at what was bought",
    "infrastructure bills (Vercel, Supabase): only the AI cost log is read",
  ];
  if (hours === null) {
    return { status: "unverified", summary: "Could not read cost_hourly_calls(), so nothing was checked.", evidence: {}, unverified: ["AI spend: the read failed", ...unverified] };
  }
  const DAY = 24 * 3600_000;
  let recent = 0;
  let baseline = 0;
  for (const h of hours) {
    const t = Date.parse(h.hour);
    if (Number.isNaN(t)) continue;
    if (t >= nowMs - DAY && t <= nowMs) recent += h.costEur;
    else if (t >= nowMs - 8 * DAY && t < nowMs - DAY) baseline += h.costEur;
  }
  const perDay = baseline / 7;
  const round = (n: number) => Math.round(n * 100) / 100;
  const evidence = { last24hEur: round(recent), prior7dDailyAverageEur: round(perDay) };
  if (perDay === 0 && recent === 0) {
    return { status: "ok", summary: "No AI spend in the last 24 hours and none in the 7 days before.", evidence, unverified };
  }
  if (perDay === 0) {
    return { status: "unverified", summary: `€${round(recent)} spent in the last 24 hours, but the 7 days before had none to compare with.`, evidence, unverified: ["whether this is unusual: there is no earlier week to compare with", ...unverified] };
  }
  if (recent >= perDay * COST_SPIKE_RATIO && recent - perDay >= COST_SPIKE_MIN_EUR) {
    return { status: "warn", summary: `Last 24h spend €${round(recent)} is ${round(recent / perDay)}x the previous week's daily average (€${round(perDay)}).`, evidence, unverified };
  }
  return { status: "ok", summary: `Last 24h spend €${round(recent)}; previous week's daily average €${round(perDay)}.`, evidence, unverified };
}

/** What monthlyRecurringRevenue() returned, or null when its input could not be read. */
export type RevenueFigure = { eur: number; complete: boolean; unpricedSubscribers: number; unpricedTiers: string[] } | null;

/** revenue-tracker: recurring revenue as the billing code computes it. */
export function analyzeRevenue(rev: RevenueFigure): AgentResult {
  const unverified = [
    "cash actually received: this is subscription arithmetic from plan prices, not Stripe's balance",
    "refunds, failed payments and one-off charges",
  ];
  if (rev === null) {
    return { status: "unverified", summary: "Could not read mrr_inputs(), so revenue was not computed.", evidence: {}, unverified: ["recurring revenue: the read failed", ...unverified] };
  }
  const evidence = { mrrEur: rev.eur, complete: rev.complete, unpricedSubscribers: rev.unpricedSubscribers, unpricedTiers: rev.unpricedTiers };
  if (!rev.complete) {
    return { status: "warn", summary: `Recurring revenue is at least €${rev.eur}/month; ${rev.unpricedSubscribers} subscriber(s) on ${rev.unpricedTiers.join(", ")} have no listed price, so the real figure is higher.`, evidence, unverified };
  }
  return { status: "ok", summary: `Recurring revenue €${rev.eur}/month, every subscriber priced.`, evidence, unverified };
}

/** The response headers the site sent on its home page. `null` when no probe was made. */
export type HeadersProbe = { reached: boolean; httpStatus: number | null; headers: Record<string, string> } | null;

/** headers-checker: the baseline security headers on the public home page. */
export function analyzeHeaders(probe: HeadersProbe): AgentResult {
  const unverified = [
    "whether the Content-Security-Policy is strict enough: only its presence is checked",
    "headers on other routes: one page is fetched",
  ];
  if (probe === null) {
    return { status: "unverified", summary: "No site address is configured (NEXT_PUBLIC_SITE_URL), so no headers were read.", evidence: {}, unverified: ["every header: the site was not called", ...unverified] };
  }
  if (!probe.reached || probe.httpStatus === null) {
    return { status: "unverified", summary: "The home page did not answer, so its headers were not read (the uptime monitor reports the outage).", evidence: {}, unverified: ["every header: no response", ...unverified] };
  }
  const h = Object.fromEntries(Object.entries(probe.headers).map(([k, v]) => [k.toLowerCase(), v]));
  const missing: string[] = [];
  if (!h["strict-transport-security"]) missing.push("Strict-Transport-Security");
  if ((h["x-content-type-options"] ?? "").toLowerCase() !== "nosniff") missing.push("X-Content-Type-Options: nosniff");
  if (!h["referrer-policy"]) missing.push("Referrer-Policy");
  if (!h["content-security-policy"] && !h["x-frame-options"]) missing.push("Content-Security-Policy or X-Frame-Options");
  if (missing.length === 0) {
    return { status: "ok", summary: "The home page sends HSTS, nosniff, a Referrer-Policy and framing protection.", evidence: { httpStatus: probe.httpStatus, missing: [] }, unverified };
  }
  return { status: "warn", summary: `The home page is missing: ${missing.join("; ")}.`, evidence: { httpStatus: probe.httpStatus, missing }, unverified };
}

/** A previous run's row, as task-auditor needs it. */
export type PastRun = { agentId: string; ranAt: string };

/** An agent whose last row is older than this has stopped running. Chosen: the runner is daily, so 36h allows one late run. */
export const STALE_AFTER_HOURS = 36;

/** task-auditor: did each scheduled agent actually produce a row recently. `rows` are rows from BEFORE this run. */
export function analyzeStaleness(rows: PastRun[] | null, expectedIds: readonly string[], nowMs: number): AgentResult {
  const unverified = [
    "whether a row's content is right: only that a row exists and is recent",
    "work that is not an agent run (pull requests, deploys)",
  ];
  if (rows === null) {
    return { status: "unverified", summary: "Could not read company_agent_runs, so nothing was checked.", evidence: {}, unverified: ["every agent's last run: the read failed", ...unverified] };
  }
  const last = new Map<string, number>();
  for (const r of rows) {
    const t = Date.parse(r.ranAt);
    if (!Number.isNaN(t) && t > (last.get(r.agentId) ?? 0)) last.set(r.agentId, t);
  }
  const stale: string[] = [];
  const never: string[] = [];
  for (const id of expectedIds) {
    const t = last.get(id);
    if (t === undefined) never.push(id);
    else if (nowMs - t > STALE_AFTER_HOURS * 3600_000) stale.push(id);
  }
  const evidence = { expected: expectedIds.length, stale, neverRun: never };
  if (stale.length > 0) {
    return { status: "warn", summary: `${stale.length} agent(s) have not produced a row in ${STALE_AFTER_HOURS}h: ${stale.join(", ")}.`, evidence, unverified };
  }
  if (never.length > 0) {
    return { status: "unverified", summary: `${never.length} agent(s) have no earlier row to judge (new, or the table was empty): ${never.join(", ")}.`, evidence, unverified: [`whether these ran before: ${never.join(", ")}`, ...unverified] };
  }
  return { status: "ok", summary: `All ${expectedIds.length} scheduled agents have a row from the last ${STALE_AFTER_HOURS}h.`, evidence, unverified };
}

/** daily-reporter: one line over everything this run found. */
export function summarizeRun(results: { agentId: string; result: AgentResult }[]): AgentResult {
  const unverified = [
    "every roster agent that is not running: only agents that ran in this pass are in this report",
    "anything an agent did not itself check: see each agent's own 'not covered' list",
  ];
  if (results.length === 0) {
    return { status: "unverified", summary: "No agent results to report.", evidence: {}, unverified };
  }
  const by = (s: RunStatus) => results.filter((r) => r.result.status === s).map((r) => r.agentId);
  const counts = { ok: by("ok").length, warn: by("warn").length, fail: by("fail").length, unverified: by("unverified").length };
  const needs = results.filter((r) => r.result.status !== "ok").map((r) => `${r.agentId}: ${r.result.status}`);
  const status: RunStatus = counts.fail > 0 ? "fail" : counts.warn > 0 ? "warn" : counts.unverified > 0 ? "unverified" : "ok";
  const head = `${results.length} agents: ${counts.ok} ok, ${counts.warn} warn, ${counts.fail} fail, ${counts.unverified} unverified.`;
  return { status, summary: needs.length === 0 ? head : `${head} Needs a look: ${needs.join("; ")}.`, evidence: counts, unverified };
}

// ---------------------------------------------------------------------------
// THIRD BATCH (2026-11-07): five more database readers. Same rules.
// ---------------------------------------------------------------------------

/** An ai_jobs row that has not finished. */
export type OpenJob = { status: string; updatedAt: string };

/** A background job untouched for this long is stuck, not slow. Chosen 2026-11-07. */
export const STUCK_JOB_MINUTES = 30;

/** queue-monitor: background jobs (ai_jobs) that are queued or running and have not moved. */
export function analyzeQueue(open: OpenJob[] | null, failedLast24h: number | null, nowMs: number): AgentResult {
  const unverified = [
    "why a job is stuck: the agent sees timestamps, not the worker",
    "jobs older than the 500 newest open rows it reads",
  ];
  if (open === null) {
    return { status: "unverified", summary: "Could not read ai_jobs, so the queue was not checked.", evidence: {}, unverified: ["every open job: the read failed", ...unverified] };
  }
  const stuck = open.filter((j) => {
    const t = Date.parse(j.updatedAt);
    return !Number.isNaN(t) && nowMs - t > STUCK_JOB_MINUTES * 60_000;
  });
  const evidence = { open: open.length, stuck: stuck.length, failedLast24h };
  const failedNote = failedLast24h === null ? "" : ` ${failedLast24h} job(s) failed in the last 24h.`;
  if (stuck.length > 0) {
    return { status: "warn", summary: `${stuck.length} of ${open.length} open job(s) have not moved for over ${STUCK_JOB_MINUTES} minutes.${failedNote}`, evidence, unverified };
  }
  return { status: "ok", summary: `${open.length} open job(s), none stuck.${failedNote}`, evidence, unverified: failedLast24h === null ? ["failed jobs: that count could not be read", ...unverified] : unverified };
}

/** budget-monitor: today's AI calls against the platform's own daily cap. */
export function analyzeBudget(callsToday: number | null, cap: number): AgentResult {
  const unverified = [
    "euro spend against a euro budget: the cap in force is a CALL count, there is no euro budget to compare with",
  ];
  if (callsToday === null) {
    return { status: "unverified", summary: "Could not read daily_ai_spend_tracking, so the cap was not checked.", evidence: { cap }, unverified: ["today's call count: the read failed", ...unverified] };
  }
  const evidence = { callsToday, cap, share: cap > 0 ? Math.round((callsToday / cap) * 1000) / 1000 : null };
  if (cap <= 0) {
    return { status: "unverified", summary: "The daily cap is not a positive number, so the share could not be computed.", evidence, unverified };
  }
  if (callsToday >= cap) return { status: "fail", summary: `${callsToday} AI calls today: the platform daily cap of ${cap} is reached and the circuit breaker is refusing requests.`, evidence, unverified };
  if (callsToday >= cap * 0.8) return { status: "warn", summary: `${callsToday} AI calls today, ${Math.round((callsToday / cap) * 100)}% of the daily cap of ${cap}.`, evidence, unverified };
  return { status: "ok", summary: `${callsToday} AI calls today, ${Math.round((callsToday / cap) * 100)}% of the daily cap of ${cap}.`, evidence, unverified };
}

/** One user's spend over the window. */
export type UserCost = { userId: string; costEur: number; calls: number };

/** fraud-alert: one account being most of a day's AI spend. */
export const CONCENTRATION_SHARE = 0.5;
export const CONCENTRATION_MIN_EUR = 2;

export function analyzeConcentration(users: UserCost[] | null): AgentResult {
  const unverified = [
    "whether the spend is abuse: a heavy legitimate user looks the same as a bad one",
    "payment fraud: nothing here sees cards or Stripe",
  ];
  if (users === null) {
    return { status: "unverified", summary: "Could not read cost_user_totals(), so nothing was checked.", evidence: {}, unverified: ["per-account spend: the read failed", ...unverified] };
  }
  const total = users.reduce((s, u) => s + u.costEur, 0);
  if (users.length === 0 || total <= 0) {
    return { status: "ok", summary: "No AI spend in the last 24 hours.", evidence: { totalEur: 0, accounts: 0 }, unverified };
  }
  const top = [...users].sort((a, b) => b.costEur - a.costEur)[0];
  const share = top.costEur / total;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const evidence = { totalEur: round2(total), accounts: users.length, topAccount: top.userId.slice(0, 8), topEur: round2(top.costEur), topShare: Math.round(share * 100) / 100 };
  if (share >= CONCENTRATION_SHARE && top.costEur >= CONCENTRATION_MIN_EUR && users.length > 1) {
    return { status: "warn", summary: `Account ${top.userId.slice(0, 8)} is ${Math.round(share * 100)}% of the last 24h AI spend (€${round2(top.costEur)} of €${round2(total)}).`, evidence, unverified };
  }
  return { status: "ok", summary: `${users.length} account(s) spent €${round2(total)} in 24h; the largest is ${Math.round(share * 100)}%.`, evidence, unverified };
}

/** One feature's 30-day cost, from cost_by_feature(). */
export type FeatureCost = { feature: string; costEur: number; calls: number; creditsCharged: number };

/** cost-per-agent: 30-day AI cost by product feature (the unit the cost log records). */
export const UNCHARGED_MIN_CALLS = 20;

export function analyzeFeatureCosts(rows: FeatureCost[] | null): AgentResult {
  const unverified = [
    "cost per COMPANY agent: the cost log is keyed by product feature, and these agents make no AI calls yet",
    "whether a feature is priced right: that is the margin report's job",
  ];
  if (rows === null) {
    return { status: "unverified", summary: "Could not read cost_by_feature(), so nothing was checked.", evidence: {}, unverified: ["feature costs: the read failed", ...unverified] };
  }
  const total = rows.reduce((s, r) => s + r.costEur, 0);
  if (rows.length === 0 || total <= 0) {
    return { status: "ok", summary: "No AI cost recorded in the last 30 days.", evidence: { totalEur: 0, features: 0 }, unverified };
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const sorted = [...rows].sort((a, b) => b.costEur - a.costEur);
  const top3 = sorted.slice(0, 3).map((r) => `${r.feature} €${round2(r.costEur)}`);
  const uncharged = rows.filter((r) => r.costEur > 0 && r.creditsCharged === 0 && r.calls >= UNCHARGED_MIN_CALLS).map((r) => r.feature);
  const evidence = { totalEur: round2(total), features: rows.length, top3, unchargedFeatures: uncharged };
  if (uncharged.length > 0) {
    return { status: "warn", summary: `30-day AI cost €${round2(total)}. Cost with no credits charged (${UNCHARGED_MIN_CALLS}+ calls): ${uncharged.join(", ")}. Top: ${top3.join(", ")}.`, evidence, unverified };
  }
  return { status: "ok", summary: `30-day AI cost €${round2(total)} across ${rows.length} feature(s). Top: ${top3.join(", ")}.`, evidence, unverified };
}

/** One day of AI cost, from cost_daily_totals(). */
export type DayCost = { day: string; costEur: number; calls: number };

/** expense-tracker: the last 7 days of AI cost against the 7 before them. A report with a trend, not a verdict. */
export function analyzeExpenses(days: DayCost[] | null, nowMs: number): AgentResult {
  const unverified = [
    "any expense that is not AI usage: hosting, database, domains and tools are not in the cost log",
    "whether the trend is good or bad: the agent reports it, it does not judge it",
  ];
  if (days === null) {
    return { status: "unverified", summary: "Could not read cost_daily_totals(), so nothing was checked.", evidence: {}, unverified: ["AI expenses: the read failed", ...unverified] };
  }
  const DAY = 24 * 3600_000;
  let last7 = 0;
  let prev7 = 0;
  for (const d of days) {
    const t = Date.parse(d.day);
    if (Number.isNaN(t)) continue;
    const age = nowMs - t;
    if (age >= -DAY && age < 7 * DAY) last7 += d.costEur;
    else if (age >= 7 * DAY && age < 14 * DAY) prev7 += d.costEur;
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const evidence = { last7Eur: round2(last7), prev7Eur: round2(prev7) };
  return { status: "ok", summary: `AI cost last 7 days €${round2(last7)}, the 7 days before €${round2(prev7)}.`, evidence, unverified };
}
