// Shared reliability constants for the Website Builder background job
// (api/websites/generate/process/route.ts writes, api/websites/status/
// route.ts reads) — one source of truth so the "how many attempts" and
// "how stale before we give up" numbers can never drift between the two
// routes that each enforce one half of the same guarantee: every
// generation reaches a terminal status (completed/failed) within a
// bounded time, no matter what goes wrong server-side.

// Hard circuit-breaker backstop against ANY scenario that could cause the
// AI-calling route to run more than once for the same website row
// (client bug, double-submit race, a retried keepalive request) — not a
// real retry mechanism (there isn't one today), just a ceiling nothing
// can cross.
export const MAX_GENERATION_ATTEMPTS = 3;

// If a row has been "pending"/"processing" for longer than this since
// created_at, its worker request almost certainly died without ever
// reaching a terminal status (most likely cause: the platform's function
// execution timeout killed api/websites/generate/process mid-stream) —
// api/websites/status detects this on the client's very next poll and
// force-fails it, so the UI can never spin forever.
export const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000;

// Pure predicate — no I/O, no Date.now() call baked in — so it's directly
// unit-testable with fixed timestamps instead of needing to fake the
// clock or wait for real time to pass. api/websites/status calls this
// with real values; tests call it with constructed ones.
export function isGenerationJobStale(
  status: "pending" | "processing" | "completed" | "failed",
  createdAt: string,
  now: Date
): boolean {
  if (status !== "pending" && status !== "processing") return false;
  const ageMs = now.getTime() - new Date(createdAt).getTime();
  return ageMs > STALE_JOB_TIMEOUT_MS;
}
