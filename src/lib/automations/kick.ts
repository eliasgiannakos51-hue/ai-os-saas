/**
 * AFTER AN UPLOAD THAT STARTED AUTOMATIONS (MASTER 16, package 30): the
 * screen that uploaded asks for them to run now, in their own request
 * (api/automations/events), instead of leaving them to the next
 * 15-minute cron. Only when the upload's answer says some were queued
 * (lib/automations/file-event.ts); a failure here is nobody's problem —
 * the cron takes them.
 */
export function startQueuedAutomations(queued: unknown): void {
  if (typeof queued !== "number" || queued <= 0) return;
  void fetch("/api/automations/events", { method: "POST", keepalive: true }).catch(() => undefined);
}
