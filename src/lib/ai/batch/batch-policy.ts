/**
 * #13 — WHICH WORK CAN WAIT, AND WHAT HAPPENS WHEN IT DOES.
 *
 * Anthropic's Message Batches API is half price for work submitted
 * asynchronously and returned within 24 hours. Half price is a large
 * number on the biggest recurring cost in this product, and the whole
 * question is which work can honestly accept the delay.
 *
 * ============================================================
 * (α) WHICH JOBS
 * ============================================================
 *
 * THE TEST IS "IS ANYBODY WAITING", not "is it expensive".
 *
 *   YES — a SCHEDULED agent run that delivers by email or Slack. Nobody
 *   is looking at a screen. The agent already runs on a timetable the
 *   user chose, and the result already arrives as a message rather than
 *   on a page.
 *
 *   NO — a MANUAL agent run. Somebody pressed Run and is watching a
 *   spinner. A 50% saving is not worth a feature that appears broken.
 *
 *   NO — chat, Create, the website builder, Deep Research, file
 *   questions. Every one of them has a person in front of it.
 *
 *   NO — an agent that runs more often than the batch window. An hourly
 *   agent with a 24-hour ceiling can have twenty-four submissions
 *   outstanding at once, each one a hold on credits and a row nobody can
 *   interpret. Daily or slower only, and even then only one outstanding
 *   batch per agent (enforced in SQL, not here — see the migration).
 *
 * ============================================================
 * (β) THE DELAY
 * ============================================================
 *
 * IT IS NAMED, NOT HIDDEN. A batched run is written as `queued` with the
 * submission time, so the agent's history says "queued 06:00, delivered
 * 06:04" rather than showing a four-minute run that started at 06:04. A
 * user comparing their 07:00 briefing against yesterday's can see what
 * happened.
 *
 * IT IS OFF UNTIL AN OPERATOR TURNS IT ON. AI_BATCH_ENABLED defaults to
 * false. Deciding on somebody's behalf that a delay does not matter to
 * them is exactly the move this policy exists to avoid, and a 07:00
 * briefing that starts arriving "sometime before 07:00 tomorrow" is a
 * product change, not an optimisation.
 *
 * ============================================================
 * (γ) WHEN IT FAILS
 * ============================================================
 *
 * Three distinct failures, three different answers:
 *
 *   THE BATCH EXPIRED (24 hours, vendor-side). Anthropic does not charge
 *   for an expired request. The run falls back to a SYNCHRONOUS run on
 *   the next cron tick, at full price, and the user gets their result
 *   late rather than not at all.
 *
 *   ONE REQUEST INSIDE THE BATCH ERRORED. Only that agent falls back;
 *   the others in the same batch are unaffected. This is why results are
 *   settled per request rather than per batch.
 *
 *   THE SUBMISSION ITSELF FAILED (5xx, timeout). Nothing was queued, so
 *   there is nothing to clean up: the run is executed synchronously in
 *   the same tick, exactly as it would have been with batching off.
 *
 * A FALLBACK IS NOT A RETRY LOOP. `fallbackAttemptsAllowed` is 1: if the
 * synchronous run also fails, the existing agent retry/pause machinery
 * owns it (lib/agents/execute-agent.ts), and a second cost-saving
 * mechanism layered on top of a failure path is how a cheap feature
 * becomes an expensive incident.
 *
 * ============================================================
 * THE MONEY
 * ============================================================
 *
 * CREDITS ARE NOT HELD ACROSS THE WINDOW. A reservation lives 60 minutes
 * (RESERVATION_TTL_MINUTES) and a batch may take 24 hours, so a hold
 * cannot span it; holding for a day would also freeze credits the user
 * could be spending. Affordability is checked at SUBMIT and the charge is
 * taken at SETTLE, from measured usage, at the batch rate.
 *
 * The gap is real and is stated rather than papered over: a user who
 * spends their balance between submission and delivery is charged at
 * settlement against whatever is left, and an agent that cannot be paid
 * for is paused by the same path that already handles it. The exposure is
 * bounded by one run of one agent, at half price.
 *
 * Pure module: no SDK, no network, no database. The build gate reads it.
 */

/** Anthropic's batch discount: half, on input and output alike. */
export const BATCH_DISCOUNT = 0.5;

/** The vendor's ceiling. Most batches return in minutes; this is the
 *  number the POLICY has to be safe against, not the typical one. */
export const BATCH_WINDOW_HOURS = 24;

/** Daily or slower. See (α) above for the pile-up this prevents. */
export const MIN_INTERVAL_MINUTES_FOR_BATCH = BATCH_WINDOW_HOURS * 60;

/** One synchronous re-run after a batch failure, and then the ordinary
 *  agent machinery owns it. */
export const FALLBACK_ATTEMPTS_ALLOWED = 1;

export const BATCH_ENABLED_ENV_VAR = "AI_BATCH_ENABLED";

/** OFF unless an operator says otherwise. A cost feature that changes
 *  when results arrive is an operator's decision, not a default. */
export function batchEnabled(env: Record<string, string | undefined>): boolean {
  return String(env[BATCH_ENABLED_ENV_VAR] ?? "").trim().toLowerCase() === "true";
}

export type BatchCandidate = {
  triggerSource: "schedule" | "manual";
  /** Minutes between this agent's runs, from its cron expression. */
  intervalMinutes: number;
  /** Per-agent opt-out. Undefined means "follow the deployment default",
   *  which is to batch when everything else qualifies. */
  batchOptOut?: boolean;
  /** True when this agent already has a batch in flight. */
  hasOutstandingBatch: boolean;
  /**
   * True when the agent's configuration asks for web research.
   *
   * THOSE STAY SYNCHRONOUS. The research rounds are separate calls with
   * Anthropic's server-side search tool, and a batch carrying only the
   * final synthesis would answer from training data alone — a report
   * that looks exactly like a researched one and is not. Half price is
   * not worth a result that is quietly wrong.
   */
  needsWebSearch: boolean;
};

export type BatchDecision = { batch: boolean; reason: string };

/**
 * The whole of (α), as one function a test can exhaust.
 *
 * Returns the REASON either way, because "why did my agent not get the
 * cheap path" is a question somebody will ask, and a boolean cannot
 * answer it.
 */
export function batchDecision(
  candidate: BatchCandidate,
  env: Record<string, string | undefined>
): BatchDecision {
  if (!batchEnabled(env)) {
    return { batch: false, reason: `${BATCH_ENABLED_ENV_VAR} is not true` };
  }
  if (candidate.batchOptOut === true) {
    return { batch: false, reason: "this agent opted out of batching" };
  }
  if (candidate.triggerSource !== "schedule") {
    return { batch: false, reason: "a manual run has somebody waiting for it" };
  }
  if (candidate.needsWebSearch) {
    return {
      batch: false,
      reason: "needs live web research, which the batch path cannot do without answering from memory instead",
    };
  }
  if (candidate.hasOutstandingBatch) {
    return { batch: false, reason: "this agent already has a batch in flight" };
  }
  if (!Number.isFinite(candidate.intervalMinutes) || candidate.intervalMinutes < MIN_INTERVAL_MINUTES_FOR_BATCH) {
    return {
      batch: false,
      reason:
        `runs every ${Math.round(candidate.intervalMinutes)} minutes, which is inside the ` +
        `${BATCH_WINDOW_HOURS}-hour batch window — submissions would pile up`,
    };
  }
  return { batch: true, reason: `scheduled, runs every ${Math.round(candidate.intervalMinutes)} minutes, nobody waiting` };
}

/** When a batch submitted now must be treated as dead. */
export function batchExpiresAt(submittedAtMs: number): Date {
  return new Date(submittedAtMs + BATCH_WINDOW_HOURS * 3_600_000);
}

export function batchHasExpired(submittedAtMs: number, nowMs: number): boolean {
  return nowMs >= batchExpiresAt(submittedAtMs).getTime();
}

/**
 * The states a batched run can be in, and which of them mean "give up and
 * run it normally".
 *
 * `canceled` is in the fallback list because a cancelled batch produces
 * no result and the user is still owed one. `expired` likewise. `errored`
 * is per-request, not per-batch, and is handled the same way.
 */
export const BATCH_STATUSES = ["submitted", "succeeded", "errored", "canceled", "expired"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export function shouldFallBackToSync(status: BatchStatus): boolean {
  return status === "errored" || status === "canceled" || status === "expired";
}

/**
 * The batch price of a cost already computed at standard rates.
 *
 * DELIBERATELY A FUNCTION AND NOT A CONSTANT AT THE CALL SITE. This is
 * the only place the discount is applied, so there is exactly one place
 * it can be applied twice — the failure that would halve a charge that
 * was already halved and put the margin under 4x while every log read
 * healthy.
 */
export function batchAdjustedUsd(standardUsd: number): number {
  if (!Number.isFinite(standardUsd) || standardUsd <= 0) return 0;
  return standardUsd * BATCH_DISCOUNT;
}
