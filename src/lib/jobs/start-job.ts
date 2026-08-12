import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { reserveCredits, releaseReservation } from "@/lib/billing/reservations";
import { kickJob } from "@/lib/jobs/run-job";
import { stepCount, JOB_STEPS, type JobKind } from "@/lib/jobs/job-types";

/**
 * Creates a job, holds the credits for it, and starts a worker — without
 * waiting for any of the work.
 *
 * ORDER MATTERS AND IS THE POINT.
 *
 *   reserve -> insert row -> kick
 *
 * Reserving first means a user who cannot afford the job is told so
 * immediately, by the route, with a 402 they can act on — rather than
 * being handed a job id for work that will fail thirty seconds later in a
 * worker they are not watching.
 *
 * Inserting before kicking means the worker can never arrive before the
 * row it is meant to claim exists. The reverse ordering produces a
 * "not_found" that looks exactly like a deleted job.
 *
 * And if the insert fails after a successful reserve, the hold is given
 * straight back here. Nothing else would ever release it: there is no row
 * for the reaper to find.
 */
export type StartJobResult =
  | { ok: true; jobId: string; kicked: boolean }
  | { ok: false; reason: "insufficient"; available: number; needed: number }
  | { ok: false; reason: "error"; message: string };

export async function startJob(params: {
  userId: string;
  kind: JobKind;
  input: Record<string, unknown>;
  /** 0 for a bypass account or a free action — reserveCredits already
   *  treats 0 as "nothing to hold" and returns ok. */
  reserve: number;
  reserveMetadata?: Record<string, unknown>;
}): Promise<StartJobResult> {
  const { userId, kind, input, reserve, reserveMetadata = {} } = params;

  const reservation = await reserveCredits(userId, reserve, kind, reserveMetadata);
  if (!reservation.ok) {
    if (reservation.reason === "insufficient") {
      return { ok: false, reason: "insufficient", available: reservation.available, needed: reservation.needed };
    }
    return { ok: false, reason: "error", message: reservation.message };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ai_jobs")
      .insert({
        user_id: userId,
        kind,
        status: "queued",
        input,
        reservation_id: reservation.reservationId || null,
        step: 0,
        step_total: stepCount(kind),
        step_label: JOB_STEPS[kind][0] ?? null,
      })
      .select("id")
      .single();

    if (error || !data?.id) throw error ?? new Error("job row was not created");

    const jobId = String(data.id);
    // Not awaited for its result — see kickJob. The job id is returned to
    // the caller whether or not the kick lands, because the client's first
    // poll can also start it.
    const kicked = await kickJob(jobId);
    return { ok: true, jobId, kicked };
  } catch (err) {
    logApiError("jobs:start", err, { userId, kind });
    // The hold has no row to be settled against. Give it back now or it
    // sits until the reservation sweep expires it.
    if (reservation.reservationId) await releaseReservation(userId, reservation.reservationId);
    return { ok: false, reason: "error", message: "The job could not be started." };
  }
}
