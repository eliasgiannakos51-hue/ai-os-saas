/**
 * WHAT A QUESTION THAT GOT NO ANSWER SAYS, IN THE READER'S LANGUAGE (the
 * package check of 2026-10-08).
 *
 * Both Files screens showed `outcome.error` as it came: for a refused
 * start that is the sentence api/files/ask writes in English ("Not enough
 * credits for this question."), and for a job that failed it is the row's
 * error, which lib/jobs/run-job.ts (failJob) fills with the thrown error's
 * own message — for an overloaded provider, the SDK's status line and the
 * API's JSON. On a Greek screen, both.
 *
 * So the screens show a key from here, never the text. The route says
 * which refusal it is in `reason` (lib/jobs/start-and-watch.ts hands that
 * on as `code`); a job that ran and failed (it has an id) says only that
 * the AI did not answer and that nothing was charged, which failJob makes
 * true by giving the hold back before it writes the row.
 *
 * Used by components/files/files-shell.tsx and files-workspace.tsx; held
 * by scripts/tests/file-pages.test.mjs.
 */
export type AskFailure = "askStillRunning" | "askStalled" | "askNoCredits" | "askRateLimited" | "askFailed" | "askError";

export function askFailure(outcome: { code: string | null; jobId?: string | null }): AskFailure {
  if (outcome.code === "still_running") return "askStillRunning";
  if (outcome.code === "stalled") return "askStalled";
  if (outcome.jobId) return "askFailed";
  if (outcome.code === "insufficient") return "askNoCredits";
  if (outcome.code === "rate_limited") return "askRateLimited";
  return "askError";
}
