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
