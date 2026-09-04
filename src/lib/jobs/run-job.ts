import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { getSiteUrl } from "@/lib/site-url";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { internalHandoffToken, INTERNAL_HANDOFF_HEADER } from "@/lib/function-limits";
import {
  isJobKind,
  canRetry,
  stepCount,
  type JobKind,
  type JobStatus,
} from "@/lib/jobs/job-types";
import { JOB_HANDLERS } from "@/lib/jobs/handlers";
import { StoppedByUserError, STOPPED_MESSAGE, isStopRequested } from "@/lib/stop-requests";

// The worker that outlives the request.
//
// THE PATTERN, copied from lib/research/run-research.ts because it is the
// one already proven in production:
//
//   1. The route creates a row, reserves credits, kicks a worker and
//      returns the job id. It never awaits the work.
//   2. The worker claims the row with a conditional update — the claim IS
//      the lock, so a duplicated kick cannot run the same job twice.
//   3. It writes progress as it passes each real step.
//   4. It settles on success, refunds on failure, and never leaves a hold
//      behind.
//
// WHAT MAKES IT SURVIVE THE PAGE CLOSING. The work is not attached to the
// request at all. The kick is a fire-and-forget POST to our own endpoint,
// authenticated with the internal token; the browser's fetch can be
// aborted, the tab can be closed, and the job is unaffected because
// nothing it needs lives in that connection.

export type JobRunOutcome =
  | { ran: true; status: "done" | "failed"; creditsCharged: number }
  | { ran: false; reason: "locked" | "not_found" | "finished" | "no_handler" };

type JobRow = {
  id: string;
  user_id: string;
  kind: string;
  status: string;
  input: Record<string, unknown> | null;
  usage_entries: unknown;
  reservation_id: string | null;
  attempts: number | null;
};

/**
 * Everything a handler is given, and the only way it talks to the outside.
 *
 * Handlers do NOT touch the job row, settle credits or decide retries —
 * that is all here, once, so five features cannot get it five different
 * ways. A handler does the work, reports progress and returns a result.
 */
export type JobContext = {
  jobId: string;
  userId: string;
  input: Record<string, unknown>;
  costs: CostAccumulator;
  apiKey: string;
  /** Advance the visible progress. Awaited, so a kill cannot lose the
   *  step that just completed. THROWS StoppedByUserError when the owner
   *  has pressed Stop and there is still work after this step — see the
   *  note in runJob; a handler does not catch it. */
  progress: (step: number, label: string) => Promise<void>;
  /** For a handler with its own long loop (an agent run's research
   *  rounds): has the owner pressed Stop? Cheap, one read by key. */
  shouldStop: () => Promise<boolean>;
};

export type JobHandlerResult = {
  result: Record<string, unknown>;
  /** Overrides the credit outcome for a job that "succeeded" but produced
   *  nothing worth charging for — a question the documents did not answer
   *  still costs tokens, but a handler may decide otherwise. */
  refund?: boolean;
  /**
   * The handler did its own reserve and settle.
   *
   * agent_run is the one case: executeAgent has always owned the whole
   * billing cycle for a run, because a scheduled run happens with no
   * request at all and had to. Settling again here would write a SECOND
   * cost-log row for the same work — zero-cost, because this job's
   * accumulator never saw the tokens, and therefore a row with a margin of
   * zero that would drag the feature's average down and fire the
   * below-target alert for a feature that is fine.
   */
  selfBilled?: boolean;
  /**
   * Settle under a DIFFERENT feature name than the job kind.
   *
   * For the case where one job kind produces two structurally different
   * actions. agent_build is the example: a run that stops at the
   * clarifying-questions pre-check made ONE small call, while a run that
   * builds made two and did ten times the work. Logging both as
   * "agent_build" blends them into a single average, and the blend is not
   * a number that describes anything — it is the arithmetic mean of a
   * €0.001 row and a €0.03 row.
   *
   * That blend is exactly how a healthy system reads as a broken one. Two
   * rows of one interaction, each margin-guaranteed on its own cost,
   * invite being compared one-at-a-time against the interaction's TOTAL
   * cost on the Anthropic Console — which shows half the cost accounted
   * for and half the margin earned. api/websites/generate already avoids
   * this by settling its pre-check as "website_generate_precheck"; this
   * field is how a background job does the same thing.
   */
  feature?: string;
};

export type JobHandler = (ctx: JobContext) => Promise<JobHandlerResult>;

/**
 * Starts a worker for this job without waiting for it.
 *
 * Fire and forget on purpose: awaiting the response would hold the caller
 * open for the whole of the job, which is exactly the behaviour being
 * replaced. The 2-second abort is on the HANDSHAKE, not the work — by then
 * the receiving invocation has the job id and is running independently.
 */
export async function kickJob(jobId: string): Promise<boolean> {
  const token = internalHandoffToken();
  if (!token) {
    // Without CRON_SECRET there is no authenticated way to call ourselves.
    // The job is NOT lost — the row exists and the client's next poll can
    // start it (see api/jobs/[id]/continue, which also accepts the owner's
    // session). But the "works with the tab closed" guarantee is gone, so
    // this is an error rather than a debug line.
    logApiError("jobs:kick", new Error("CRON_SECRET is not set — a job cannot start itself"), {
      jobId,
      hint: "set CRON_SECRET so background work continues with the page closed",
    });
    return false;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    void fetch(`${getSiteUrl()}/api/jobs/${jobId}/continue`, {
      method: "POST",
      headers: { [INTERNAL_HANDOFF_HEADER]: token, "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
      signal: controller.signal,
    })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
    return true;
  } catch (err) {
    logApiError("jobs:kick", err, { jobId });
    return false;
  }
}

/**
 * Takes the lock on a job.
 *
 * The conditional update is the whole mechanism: `.eq("running", false)`
 * means exactly one caller can flip it, and everyone else gets zero rows
 * back and returns. Reading the row and then writing it would reopen the
 * race this closes.
 */
export async function claimJob(jobId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_jobs")
    .update({ running: true, status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("running", false)
    .in("status", ["queued", "running"])
    .select("id");
  if (error) {
    logApiError("jobs:claim", error, { jobId });
    return false;
  }
  return (data ?? []).length === 1;
}

/** Who the user is for billing purposes — the same three questions
 *  settleReservation needs, asked once. */
async function billingIdentity(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  // The REAL user object, not a stub. resolveEffectivePlan and
  // hasActiveBetaBypass both read user_metadata (stripe_customer_id, beta
  // flags), so a `{id, email}` cast would silently classify every beta
  // tester and every pack purchaser as a plain plan user — and settle
  // their jobs at the wrong credit price.
  const account = {
    id: userId,
    email: data?.user?.email ?? null,
    user_metadata: (data?.user?.user_metadata ?? null) as Record<string, unknown> | null,
  };
  const [plan, beta] = await Promise.all([
    resolveEffectivePlan(account),
    hasActiveBetaBypass(account),
  ]);
  return { plan, bypass: isAdminEmail(account.email) || beta };
}

/**
 * Runs one job to completion, or fails it cleanly.
 *
 * "Cleanly" is the load-bearing word. Every exit from here — success,
 * handler throw, missing handler, retry exhausted — leaves the row in a
 * terminal state with the credit hold either settled or given back. The
 * state this replaces is the one an uncaught platform kill produces:
 * status stuck at running, no settlement, and the user's credits held
 * against work they never received.
 */
export async function runJob(params: { jobId: string; apiKey: string }): Promise<JobRunOutcome> {
  const { jobId, apiKey } = params;
  const admin = createAdminClient();

  const { data: raw, error } = await admin.from("ai_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error || !raw) {
    logApiError("jobs:run", error ?? new Error("job not found"), { jobId });
    return { ran: false, reason: "not_found" };
  }
  const job = raw as JobRow;
  if (job.status === "done" || job.status === "failed") return { ran: false, reason: "finished" };
  // Bound to a local so the narrowing survives to the call site — reading
  // JOB_HANDLERS[kind] again below would be a fresh, unnarrowed lookup.
  const kind: JobKind | null = isJobKind(job.kind) ? job.kind : null;
  const handler = kind ? JOB_HANDLERS[kind] : undefined;
  if (!kind || !handler) {
    await failJob(jobId, job, "This kind of job is no longer supported.");
    return { ran: false, reason: "no_handler" };
  }
  const costs = CostAccumulator.restore(Array.isArray(job.usage_entries) ? job.usage_entries : []);
  // THE COUNT BEFORE THIS ATTEMPT, because the accumulator is RESTORED.
  // A job that hands off to itself resumes with every earlier call
  // already in `costs`, so recording costs.callCount at the end would
  // count the first chunk again on every continuation.
  const callsBeforeThisAttempt = costs.callCount;
  const attempts = (job.attempts ?? 0) + 1;
  await admin.from("ai_jobs").update({ attempts, step_total: stepCount(kind) }).eq("id", jobId);

  const ctx: JobContext = {
    jobId,
    userId: job.user_id,
    input: (job.input ?? {}) as Record<string, unknown>,
    costs,
    apiKey,
    progress: async (step, label) => {
      // Usage is snapshotted with every step, not only at the end: a kill
      // between two steps must not lose the tokens already spent, or the
      // eventual settlement under-charges for work really done.
      await admin
        .from("ai_jobs")
        .update({ step, step_label: label, usage_entries: costs.snapshot() })
        .eq("id", jobId);
      // THE STOP BUTTON LANDS HERE — V4.6. A step boundary is the one
      // place a job can stop without wasting what it has: the previous
      // step is finished and paid for, the next has not begun. NOT at
      // the last step: by then the expensive work is done and only the
      // save remains, and stopping there would throw away a result the
      // account has already paid for. (An agent run's own rounds ask
      // shouldStop themselves, between research passes.)
      if (step < stepCount(kind) && (await isStopRequested(admin, "ai_jobs", jobId))) {
        throw new StoppedByUserError();
      }
    },
    shouldStop: () => isStopRequested(admin, "ai_jobs", jobId),
  };

  try {
    const handled = await handler(ctx);

    // THE PLATFORM BREAKER'S COUNTER, which this path never touched.
    //
    // checkDailyPlatformCap() reads daily_ai_spend_tracking.total_calls,
    // and lib/jobs/handlers/file-ask.ts and create.ts make real Anthropic
    // calls without ever incrementing it — file-ask makes one per pass
    // plus a synthesis. So the number the breaker gates the whole
    // platform on was low by everything background jobs spend, and the
    // two heaviest features were outside it in both directions: not
    // counted, and not blocked.
    //
    // Recorded HERE, once, after the handler has finished and before any
    // branch: every provider call this attempt was going to make has been
    // made, so the delta is final and there is one place to find it
    // rather than one per call site.
    //
    // COST 0, said plainly rather than left to be discovered: the euros
    // are written to ai_cost_log by settleReservation below and that is
    // the authoritative money record. What this fixes is the CALL COUNT,
    // which is the column the breaker actually gates on.
    void recordAiCallForDailySpend(0, costs.callCount - callsBeforeThisAttempt);

    const { plan, bypass } = await billingIdentity(job.user_id);

    if (handled.refund) {
      // Produced nothing worth charging for. The hold goes back whole.
      if (job.reservation_id) await releaseReservation(job.user_id, job.reservation_id);

      // …but the WORK still happened, and we still paid Anthropic for it.
      //
      // This branch used to return here, writing credits_charged = 0 and
      // no cost-log row at all. The refund was correct and the silence
      // was not: a refunded job's real spend appeared in nobody's
      // margin report, so the one number that says how much saying "no"
      // costs us was structurally unobservable. As refunds become a
      // deliberate product behaviour — a request an agent cannot do is
      // now refunded on purpose — that blind spot stops being academic.
      //
      // Settled with bypassCharge, which is the existing mechanism for
      // exactly this shape: log the real cost, charge nothing, and
      // record what it WOULD have cost. The hold is already released
      // above, so an empty reservation id is passed and the RPC treats
      // it as charge-only.
      if (costs.callCount > 0) {
        await settleReservation({
          userId: job.user_id,
          reservationId: "",
          feature: `${handled.feature ?? kind}_refunded`,
          costs,
          plan,
          bypassCharge: true,
          metadata: { jobId, kind, attempts, refunded: true },
        });
      }
      await admin
        .from("ai_jobs")
        .update({
          status: "done",
          running: false,
          result: handled.result,
          credits_charged: 0,
          usage_entries: costs.snapshot(),
          step: stepCount(kind),
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return { ran: true, status: "done", creditsCharged: 0 };
    }

    if (handled.selfBilled) {
      // Nothing to settle here — see selfBilled. The row still records
      // what the handler reported it charged, so the UI and the job
      // history agree.
      await admin
        .from("ai_jobs")
        .update({
          status: "done",
          running: false,
          result: handled.result,
          credits_charged: Number(handled.result.creditsCharged ?? 0),
          usage_entries: costs.snapshot(),
          step: stepCount(kind),
          step_label: null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return { ran: true, status: "done", creditsCharged: Number(handled.result.creditsCharged ?? 0) };
    }

    const settlement = await settleReservation({
      userId: job.user_id,
      reservationId: job.reservation_id ?? "",
      feature: handled.feature ?? kind,
      costs,
      plan,
      // `kind` is kept in metadata even when the feature is overridden, so
      // the two rows of one interaction can still be found together.
      bypassCharge: bypass,
      metadata: { jobId, kind, attempts },
    });

    await admin
      .from("ai_jobs")
      .update({
        status: "done",
        running: false,
        result: handled.result,
        credits_charged: settlement.creditsCharged,
        usage_entries: costs.snapshot(),
        step: stepCount(kind),
        step_label: null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return { ran: true, status: "done", creditsCharged: settlement.creditsCharged };
  } catch (err) {
    if (err instanceof StoppedByUserError) {
      // STOPPED. Settle for the steps that ran, release the rest, and say
      // so on the row. Not a retry — the person asked for this — and not
      // failJob, which refunds everything: the calls before the boundary
      // were real work, delivered as far as it got, and are charged.
      const { plan, bypass } = await billingIdentity(job.user_id);
      let creditsCharged = 0;
      if (costs.callCount > 0) {
        const settlement = await settleReservation({
          userId: job.user_id,
          reservationId: job.reservation_id ?? "",
          feature: `${kind}_stopped`,
          costs,
          plan,
          bypassCharge: bypass,
          metadata: { jobId, kind, attempts, stopped: true },
        });
        creditsCharged = settlement.creditsCharged;
      } else if (job.reservation_id) {
        await releaseReservation(job.user_id, job.reservation_id);
      }
      await admin
        .from("ai_jobs")
        .update({
          status: "failed",
          running: false,
          error: STOPPED_MESSAGE,
          credits_charged: creditsCharged,
          usage_entries: costs.snapshot(),
          step_label: null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return { ran: true, status: "failed", creditsCharged };
    }

    logApiError("jobs:run", err, { jobId, kind, attempts });

    // RETRY, BOUNDED. The failures worth retrying are transient — an
    // overloaded API, a dropped socket. A malformed input fails
    // identically every time, so an unbounded retry would just spend the
    // reservation over and over with nothing to show.
    if (canRetry(attempts)) {
      await admin
        .from("ai_jobs")
        .update({
          status: "queued",
          running: false,
          error: null,
          step_label: null,
          usage_entries: costs.snapshot(),
        })
        .eq("id", jobId);
      await kickJob(jobId);
      return { ran: true, status: "failed", creditsCharged: 0 };
    }

    await failJob(jobId, job, err instanceof Error ? err.message : "The job could not be completed.");
    return { ran: true, status: "failed", creditsCharged: 0 };
  }
}

/**
 * The terminal failure path, and the only one.
 *
 * Refunds first, then writes the row: if the write failed after a refund
 * the reaper would find the row and refund an already-released hold, which
 * releaseReservation treats as a no-op. The other order would leave a
 * failed job whose credits were never returned, which is money.
 */
export async function failJob(jobId: string, job: { user_id: string; reservation_id: string | null }, message: string) {
  const admin = createAdminClient();
  if (job.reservation_id) {
    await releaseReservation(job.user_id, job.reservation_id);
  }
  await admin
    .from("ai_jobs")
    .update({
      status: "failed",
      running: false,
      error: message,
      credits_charged: 0,
      step_label: null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/**
 * Fails and refunds a job whose worker died without running a catch block.
 *
 * Conditioned on the status it read, so a job that finished between the
 * read and the write is not clobbered — the same guard
 * api/research/[id] uses for the same reason.
 */
export async function reapJob(job: {
  id: string;
  user_id: string;
  status: string;
  reservation_id: string | null;
}): Promise<boolean> {
  const admin = createAdminClient();
  if (job.reservation_id) await releaseReservation(job.user_id, job.reservation_id);
  const { data } = await admin
    .from("ai_jobs")
    .update({
      status: "failed" satisfies JobStatus,
      running: false,
      // A code as well as the prose. The prose is for the log; the code
      // is what the client translates, so a Greek user is not shown an
      // English sentence at the one moment something has gone wrong.
      error: "stalled",
      credits_charged: 0,
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", job.status)
    .select("id");
  return (data ?? []).length === 1;
}
