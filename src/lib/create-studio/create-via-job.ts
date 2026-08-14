"use client";

import { startAndWatchJob } from "@/lib/jobs/start-and-watch";
import { alignSuggestions } from "@/lib/clarification-client";

/**
 * Create Anything, started as a background job, reported in the shape its
 * three callers already expect.
 *
 * There are three of them — use-create-anything, use-create-studio and the
 * Mission Control step card — and they read the same handful of fields.
 * Normalising here means the conversion is one changed line in each rather
 * than three separate rewrites of the same result handling, and the three
 * cannot drift apart afterwards.
 *
 * The route now answers 202 with a job id. The work outlives the request:
 * closing the page leaves the worker running, and the entry it creates is
 * in the module when the user comes back.
 */
export type CreateOutcome = {
  ok: boolean;
  /** True while the worker is still going and this page stopped watching.
   *  NOT a failure — the entry will still be created, so a caller must not
   *  report it as one or invite a duplicate submission. */
  stillRunning?: boolean;
  matched?: boolean;
  needsClarification?: boolean;
  questions?: string[];
  /** Tappable answers, aligned by index with `questions` — always the
   *  same length, so a question with none offered has an empty array
   *  rather than a missing one. */
  questionSuggestions?: string[][];
  outOfCredits?: boolean;
  moduleTitle?: string;
  href?: string;
  message?: string;
  error?: string;
  /** Which module the entry landed in, and the one-line summary of it —
   *  read by the Mission Control step card, which records both on the
   *  step so a completed step shows what it actually produced. */
  module?: string;
  outputSummary?: string;
};

export async function createViaJob(body: Record<string, unknown>): Promise<CreateOutcome> {
  const outcome = await startAndWatchJob("/api/create", body);

  if (!outcome.ok) {
    if (outcome.code === "still_running") return { ok: true, stillRunning: true, matched: false };
    if (outcome.code === "insufficient") return { ok: false, outOfCredits: true, message: outcome.error };
    return { ok: false, error: outcome.error || "Something went wrong." };
  }

  const r = outcome.result as Record<string, unknown>;
  if (r.needsClarification) {
    const questions = (r.questions ?? []) as string[];
    return {
      ok: true,
      needsClarification: true,
      questions,
      // Realigned rather than trusted: a job that finished before
      // suggestions existed carries none, and since finished-but-unseen
      // jobs are offered back for 24 hours (lib/jobs/resumable.ts) that
      // older shape can still reach this code.
      questionSuggestions: alignSuggestions(questions, r.questionSuggestions),
    };
  }
  // An insert that failed saved nothing and was refunded — reported as an
  // error rather than as an unmatched classification, which would read to
  // the user as "the AI could not place this" when in fact it could.
  if (r.insertFailed) {
    return { ok: false, error: "Could not save the entry. No credits were charged — please try again." };
  }
  return {
    ok: true,
    matched: Boolean(r.matched),
    module: r.module == null ? undefined : String(r.module),
    moduleTitle: r.moduleTitle == null ? undefined : String(r.moduleTitle),
    href: r.href == null ? undefined : String(r.href),
    outputSummary: r.outputSummary == null ? undefined : String(r.outputSummary),
    message: String(r.message ?? ""),
  };
}
