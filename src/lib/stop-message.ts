/**
 * THE ONE SENTENCE A STOPPED RUN CARRIES — V4.6, client-safe.
 *
 * Workers write it into the row's error column (ai_jobs.error,
 * research_reports.error, user_websites.error_message) so a log line and
 * a curl say what happened. The browser must NOT show it: a person reads
 * their locale's aiSteps.stopped instead, and to know when to do that it
 * has to recognise the sentence — which is why the constant lives here,
 * in a module with no server import, and lib/stop-requests.ts (server
 * only) re-exports it rather than owning it.
 */
export const STOPPED_MESSAGE = "Stopped by you. Only the work already done was charged.";

/** True for the sentence above and for the website worker's longer form. */
export function isStoppedMessage(text: string | null | undefined): boolean {
  return typeof text === "string" && text.startsWith("Stopped by you.");
}
