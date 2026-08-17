/**
 * The rules a background job obeys, with no database and no network in
 * them — so every one of them can be tested for what it is.
 *
 * Deep Research proved the shape (lib/research/run-research.ts): state on
 * a row, a worker that outlives the request, a lock that makes each step
 * exactly-once, and a reaper for the worker that dies without running a
 * catch block. What follows is that shape with the Deep-Research-specific
 * parts taken out, so the other long actions can have it too.
 */

/** Every kind of work that runs in the background. */
export const JOB_KINDS = ["agent_build", "agent_run", "mission_plan", "create", "file_ask"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export type JobStatus = "queued" | "running" | "done" | "failed";

export function isJobKind(value: unknown): value is JobKind {
  return typeof value === "string" && (JOB_KINDS as readonly string[]).includes(value);
}

/** Still owed an outcome — the states a reaper cares about. */
export function isJobActive(status: string): boolean {
  return status === "queued" || status === "running";
}

/**
 * How many times a job may be attempted in total.
 *
 * Two, not "until it works". Every attempt is a real model call against a
 * real card, and the failures that retrying actually fixes are transient
 * (a 529, a dropped socket). A job failing on a malformed input would
 * retry forever and the only signal would be the bill.
 */
export const MAX_JOB_ATTEMPTS = 2;

export function canRetry(attempts: number): boolean {
  return attempts < MAX_JOB_ATTEMPTS;
}

/**
 * How long a claimed job may go without a heartbeat before it is presumed
 * dead.
 *
 * It has to be longer than the longest legitimate silence, which is one
 * whole function invocation, or a healthy slow job would be reaped
 * mid-flight and refunded while still running — and then settled twice.
 * Fifteen minutes is comfortably above the 800-second platform ceiling.
 */
export const JOB_STALE_MS = 15 * 60 * 1000;

/**
 * Is this job dead rather than slow?
 *
 * Measured from the last time anything was written (updated_at), not from
 * the start: a job that is stepping forward every ninety seconds is alive
 * however long it has been going, and a job that has written nothing for
 * fifteen minutes is not.
 *
 * An unparseable timestamp is NOT stale. Reaping on a parse failure would
 * refund and fail a job that is running perfectly well, which is the one
 * outcome worse than leaving a dead row alone.
 */
export function isJobStale(
  status: string,
  updatedAt: string | null,
  createdAt: string | null,
  now: Date = new Date()
): boolean {
  if (!isJobActive(status)) return false;
  const stamp = updatedAt ?? createdAt;
  if (!stamp) return false;
  const at = Date.parse(stamp);
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at > JOB_STALE_MS;
}

/**
 * The steps each kind reports, in order.
 *
 * Real steps, not a fake percentage that creeps up on a timer: every entry
 * here corresponds to something the worker actually finishes, and the
 * worker writes the index as it passes each one. A bar that moves because
 * time passed is worse than no bar, because it keeps moving after the work
 * has died.
 */
export const JOB_STEPS: Record<JobKind, string[]> = {
  agent_build: ["understanding", "drafting", "checking", "saving"],
  agent_run: ["preparing", "working", "delivering"],
  mission_plan: ["reading", "planning", "saving"],
  create: ["understanding", "creating", "saving"],
  // "combining" happens only when the documents took more than one pass
  // to read. A one-pass question goes 1 -> 2 -> 4 and never shows it,
  // which is right: a step that did not happen must not be claimed.
  file_ask: ["reading", "answering", "combining", "checking"],
};

export function stepCount(kind: JobKind): number {
  return JOB_STEPS[kind].length;
}

/**
 * Progress as a percentage, clamped and never claiming completion it has
 * not reached.
 *
 * A finished job is 100 whatever its step counter says; an unfinished one
 * is capped at 99, because a bar sitting full while the spinner turns is
 * how "it is stuck" gets reported about work that is fine.
 */
export function jobPercent(step: number, stepTotal: number, status: string): number {
  if (status === "done") return 100;
  if (!Number.isFinite(step) || !Number.isFinite(stepTotal) || stepTotal <= 0) return 0;
  const raw = Math.round((Math.max(0, step) / stepTotal) * 100);
  return Math.max(0, Math.min(99, raw));
}

/**
 * The credit outcome a finished job must have.
 *
 * Stated as a function so the invariant is one place rather than repeated
 * in five workers: work that produced something settles on what it
 * measured, and work that produced nothing gives the hold back. There is
 * no third option, and in particular "failed, and we keep the reservation"
 * is not one — that is the state an uncaught kill leaves behind, and it is
 * the bug this whole mechanism exists to remove.
 */
export function creditActionForOutcome(status: JobStatus): "settle" | "refund" | "none" {
  if (status === "done") return "settle";
  if (status === "failed") return "refund";
  return "none";
}
