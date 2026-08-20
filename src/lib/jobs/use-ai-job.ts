"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JOB_STEPS, type JobKind } from "@/lib/jobs/job-types";

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

/**
 * How long every step stays on screen, at minimum.
 *
 * THE THIRD "I don't see the steps" REPORT, and why it survived the
 * first two fixes: the labels were real and rendered (fix one made them
 * text, not aria-only) — but the client only SAMPLES the job row every
 * POLL_MS. An agent build that crosses two steps between polls never
 * shows the step in between, and when the terminal poll lands the whole
 * panel swaps to the result in the same frame, so even a sampled label
 * could be visible for 0ms. Fast work looked like no work.
 *
 * So the DISPLAYED job is allowed to lag the real one: every step —
 * including the ones the polling jumped over, whose tokens are known
 * from the JOB_STEPS catalogue — is shown for at least this long, and
 * the completed state waits its turn behind them. The steps genuinely
 * ran; showing each for 800ms narrates what happened rather than
 * inventing anything.
 */
export const MIN_STEP_VISIBLE_MS = 800;

/**
 * The same minimum hold, for a surface that tracks only the step LABEL
 * rather than the whole row (the file workspace's ask button).
 *
 * Each distinct value stays for MIN_STEP_VISIBLE_MS before the next one
 * replaces it; values that arrive during a hold are queued, so a step is
 * never skipped and never flashes. `null` means "no job", and it is
 * applied immediately — clearing is not a step.
 */
export function useHeldStepLabel(value: string | null): string | null {
  const [held, setHeld] = useState<string | null>(value);
  const queue = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<string | null>(value);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (value === null) {
      queue.current = [];
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      current.current = null;
      setHeld(null);
      return;
    }
    if (value === current.current || queue.current[queue.current.length - 1] === value) return;

    const pump = () => {
      const next = queue.current.shift();
      if (next === undefined) {
        timer.current = null;
        return;
      }
      current.current = next;
      setHeld(next);
      timer.current = setTimeout(pump, MIN_STEP_VISIBLE_MS);
    };

    queue.current.push(value);
    if (!timer.current) pump();
  }, [value]);

  return held;
}

/**
 * The smoothed VIEW of a job row: what the progress line should render.
 *
 * Give it the raw polled row; it returns a row that never skips a step
 * and never leaves one visible for less than MIN_STEP_VISIBLE_MS. A job
 * first observed already finished (a restored page) is shown finished
 * immediately — the replay only happens for work this mount actually
 * watched run.
 */
export function useSmoothedJob(raw: AiJob | null): AiJob | null {
  const [display, setDisplay] = useState<AiJob | null>(null);
  const queue = useRef<AiJob[]>([]);
  const draining = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Highest step already displayed or enqueued for this job id. */
  const lastStep = useRef(0);
  /** True once this mount saw the job in a non-terminal state. */
  const sawLive = useRef(false);
  /** The terminal frame is enqueued exactly once per job. */
  const finishedQueued = useRef(false);
  const jobKey = useRef<string | null>(null);
  // The drain reads through a ref so a frame arriving mid-drain is
  // appended, not lost, and unmount stops the timer.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    const key = raw?.id ?? null;
    if (key !== jobKey.current) {
      jobKey.current = key;
      queue.current = [];
      lastStep.current = 0;
      sawLive.current = false;
      finishedQueued.current = false;
      draining.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setDisplay(null);
    }
    if (!raw) return;

    const steps = JOB_STEPS[raw.kind as JobKind] ?? [];
    const total = raw.stepTotal > 0 ? raw.stepTotal : steps.length;
    const terminal = raw.status === "done" || raw.status === "failed";

    const pump = () => {
      const next = queue.current.shift();
      if (!next) {
        draining.current = false;
        timer.current = null;
        return;
      }
      draining.current = true;
      setDisplay(next);
      timer.current = setTimeout(pump, MIN_STEP_VISIBLE_MS);
    };

    if (terminal && !sawLive.current) {
      // First sight of this job is its outcome — nothing to narrate.
      lastStep.current = raw.step;
      setDisplay(raw);
      return;
    }

    if (!terminal) {
      sawLive.current = true;
      // Steps the polling jumped over, then the observed one.
      for (let s = lastStep.current + 1; s <= raw.step; s++) {
        queue.current.push({
          ...raw,
          status: "running",
          step: s,
          stepLabel: steps[s - 1] ?? raw.stepLabel,
        });
      }
      if (raw.step > lastStep.current) {
        lastStep.current = raw.step;
      } else if (queue.current.length === 0 && !draining.current) {
        // Same step, fresher row (percent moved): update in place, no hold.
        setDisplay(raw);
      }
    } else {
      // Finished while we watched: narrate the steps that ran between the
      // last poll and the end, then show the outcome — once. Later polls
      // of the same finished row must not re-enqueue it.
      if (finishedQueued.current) return;
      finishedQueued.current = true;
      for (let s = lastStep.current + 1; s <= total; s++) {
        queue.current.push({
          ...raw,
          status: "running",
          step: s,
          stepLabel: steps[s - 1] ?? raw.stepLabel,
        });
      }
      lastStep.current = total;
      queue.current.push(raw);
    }

    if (!draining.current && queue.current.length > 0) pump();
    // `display` is deliberately not a dependency: this effect reacts to
    // fresh rows, the pump owns the cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  return display;
}

export function useAiJob(jobId: string | null): {
  /** The SMOOTHED row — what progress UIs should render. It never skips
   *  a step and holds each for MIN_STEP_VISIBLE_MS, so it can lag the
   *  truth by a couple of seconds around completion. */
  job: AiJob | null;
  /** The raw polled row, for logic that needs the truth immediately. */
  rawJob: AiJob | null;
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

  // What callers RENDER is the smoothed view; isRunning follows it so the
  // surrounding panel keeps showing progress until the narration drains —
  // swapping to the result on the raw row is how a step could be visible
  // for 0ms.
  const display = useSmoothedJob(job);

  return {
    job: display,
    rawJob: job,
    isRunning: Boolean(display && (display.status === "queued" || display.status === "running")),
    watchLost,
    refresh,
  };
}
