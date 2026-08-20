"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Watches a background job and reports what it is doing.
 *
 * THE ONE RULE THIS ENFORCES: what is running is derived from the ROW, not
 * from a click. Deep Research was reported as "it stopped when I changed
 * the page" and it never stopped — the client tracked `running` in React
 * state set by pressing Start, so navigating away cleared it and the page
 * came back with nothing polling. The work was fine; the only thing
 * watching it had been thrown away.
 *
 * So this takes a job id (which can be restored from anywhere — a prop,
 * the URL, storage) and polls the row. Mount it with an id from a previous
 * visit and it picks the job straight back up, because the row is the
 * truth and this is only a window onto it.
 *
 * THE NUDGE. If a job is still queued after a few polls, the kick never
 * landed — no CRON_SECRET, a dropped outbound request, a cold start that
 * timed out. Rather than spin forever, the client asks the continue
 * endpoint to run it, authorised by the user's own session. The worker's
 * claim makes that safe: if the real kick did land, the nudge loses the
 * lock and does nothing.
 */

export type AiJob = {
  id: string;
  kind: string;
  status: "queued" | "running" | "done" | "failed";
  step: number;
  stepTotal: number;
  stepLabel: string | null;
  percent: number;
  result: Record<string, unknown> | null;
  error: string | null;
  creditsCharged: number | null;
  attempts: number;
  createdAt: string;
  finishedAt: string | null;
};

const POLL_MS = 2000;
/** Polls to wait before nudging a job that is still queued. Two is enough
 *  to let a healthy kick land and short enough that nobody notices. */
const NUDGE_AFTER_POLLS = 2;

export function useAiJob(jobId: string | null): {
  job: AiJob | null;
  isRunning: boolean;
  /** True when polls keep failing to SEE the job at all. The work may be
   *  fine — this is "progress cannot be shown", which the UI must say
   *  rather than showing nothing. */
  watchLost: boolean;
  refresh: () => Promise<void>;
} {
  const [job, setJob] = useState<AiJob | null>(null);
  const queuedPolls = useRef(0);
  const nudged = useRef(false);
  // Consecutive polls that could not see the job AT ALL (404, 500). One
  // or two is a race with the insert; a steady stream means the row is
  // invisible to this user — on the broken deployment that was a missing
  // RLS policy, and the UI showed NOTHING for a build that succeeded.
  // watchLost turns that silence into a sentence.
  const missedPolls = useRef(0);
  const [watchLost, setWatchLost] = useState(false);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      const data = await response.json();
      if (data.ok) {
        setJob(data.job as AiJob);
        missedPolls.current = 0;
        setWatchLost(false);
      } else {
        missedPolls.current += 1;
        if (missedPolls.current >= 4) setWatchLost(true);
      }
    } catch {
      // A dropped poll is not a dead job. Leave the last known state and
      // let the next tick try again — clearing it here would make a
      // flaky network look exactly like a job that vanished.
    }
  }, [jobId]);

  useEffect(() => {
    queuedPolls.current = 0;
    nudged.current = false;
    missedPolls.current = 0;
    setWatchLost(false);
    setJob(null);
    if (!jobId) return;

    let cancelled = false;
    void refresh();

    const timer = setInterval(() => {
      if (cancelled) return;
      void (async () => {
        await refresh();
      })();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, refresh]);

  // Stop polling the moment there is an outcome. A finished job cannot
  // change, and a page left open on a completed job should not keep asking.
  useEffect(() => {
    if (!job) return;
    if (job.status === "done" || job.status === "failed") return;

    if (job.status === "queued") {
      queuedPolls.current += 1;
      if (queuedPolls.current >= NUDGE_AFTER_POLLS && !nudged.current && jobId) {
        nudged.current = true;
        // Fire and forget: if it starts the job, the next poll will show
        // it running; if it lost the claim, nothing happened and that is
        // the correct outcome.
        void fetch(`/api/jobs/${jobId}/continue`, { method: "POST", keepalive: true }).catch(() => undefined);
      }
    } else {
      queuedPolls.current = 0;
    }
  }, [job, jobId]);

  return {
    job,
    isRunning: Boolean(job && (job.status === "queued" || job.status === "running")),
    watchLost,
    refresh,
  };
}
