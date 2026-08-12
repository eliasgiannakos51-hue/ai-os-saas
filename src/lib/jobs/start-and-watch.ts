"use client";

import type { AiJob } from "@/lib/jobs/use-ai-job";

/**
 * Starts a background job and follows it to an outcome.
 *
 * WHAT THIS IS AND IS NOT. It still leaves the caller awaiting a result,
 * which looks like the behaviour being replaced — but the thing that
 * matters has changed underneath it. The WORK is no longer attached to the
 * request: if the page closes now, the worker finishes, the mission is
 * saved, and the user finds it waiting when they come back. Before, the
 * work died with the fetch.
 *
 * It exists so a caller that only needs "start it and tell me when it is
 * done" does not have to grow its own polling state. A screen that wants
 * to RENDER progress uses useAiJob instead and stays mounted on the row.
 *
 * onProgress is called with each poll, so a caller can show the real step
 * without owning the loop.
 */
export type JobOutcome =
  | { ok: true; result: Record<string, unknown>; creditsCharged: number | null }
  | { ok: false; error: string; code: string | null };

const POLL_MS = 2000;
/** A ceiling on the watching, not on the job. Reaching it means only that
 *  this page stopped looking — the worker carries on and the row is still
 *  there to be found on the next visit. */
const MAX_WATCH_MS = 10 * 60 * 1000;

export async function startAndWatchJob(
  url: string,
  body: unknown,
  options: { onProgress?: (job: AiJob) => void } = {}
): Promise<JobOutcome & { jobId?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // keepalive so navigating away in the second between the press and the
    // 202 cannot lose the request that creates the job.
    keepalive: true,
    body: JSON.stringify(body),
  });
  const started = await response.json();
  if (!started.ok || !started.jobId) {
    return { ok: false, error: String(started.error ?? started.message ?? ""), code: started.reason ?? null };
  }
  const jobId = String(started.jobId);
  const outcome = await watchJob(jobId, options.onProgress);
  return { ...outcome, jobId };
}

export async function watchJob(
  jobId: string,
  onProgress?: (job: AiJob) => void
): Promise<JobOutcome> {
  const deadline = Date.now() + MAX_WATCH_MS;
  let nudged = false;
  let queuedPolls = 0;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    let job: AiJob | null = null;
    try {
      const data = await (await fetch(`/api/jobs/${jobId}`)).json();
      if (data.ok) job = data.job as AiJob;
    } catch {
      // A dropped poll is not a dead job — keep looking.
      continue;
    }
    if (!job) continue;
    onProgress?.(job);

    if (job.status === "done") {
      return { ok: true, result: (job.result ?? {}) as Record<string, unknown>, creditsCharged: job.creditsCharged };
    }
    if (job.status === "failed") {
      return { ok: false, error: job.error ?? "", code: job.error ?? null };
    }

    // The safety net for a kick that never landed (no CRON_SECRET, a
    // dropped outbound request, a cold start that timed out). Safe because
    // the worker's claim decides: if the real kick did land, this loses the
    // lock and does nothing.
    if (job.status === "queued") {
      queuedPolls += 1;
      if (queuedPolls >= 2 && !nudged) {
        nudged = true;
        void fetch(`/api/jobs/${jobId}/continue`, { method: "POST", keepalive: true }).catch(() => undefined);
      }
    } else {
      queuedPolls = 0;
    }
  }
  // Not a failure of the job — a failure of this page's patience. Said
  // that way round because the work is still running and the result will
  // be there.
  return { ok: false, error: "still_running", code: "still_running" };
}
