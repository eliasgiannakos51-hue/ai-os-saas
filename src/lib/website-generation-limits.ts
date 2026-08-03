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
//
// Two tiers: a generation with reference images genuinely takes longer
// (Claude's vision input adds real processing time on top of the base
// generation) — the first version of this fix used one flat 5-minute
// window for every job, which was long enough to force-fail complex
// image-attached generations that were still legitimately working. The
// image-attached budget (12 min) is set with headroom above
// api/websites/generate/process's maxDuration (10 min) — see that
// route — so the platform's own timeout is always what kills a truly
// stuck job first, and this is purely the client-visible backstop for
// when even that doesn't happen.
export const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000;
export const STALE_JOB_TIMEOUT_WITH_IMAGES_MS = 12 * 60 * 1000;

// Pure predicate — no I/O, no Date.now() call baked in — so it's directly
// unit-testable with fixed timestamps instead of needing to fake the
// clock or wait for real time to pass. api/websites/status calls this
// with real values; tests call it with constructed ones.
export function isGenerationJobStale(
  status: "pending" | "processing" | "completed" | "failed",
  createdAt: string,
  now: Date,
  hasReferenceImages: boolean
): boolean {
  if (status !== "pending" && status !== "processing") return false;
  const ageMs = now.getTime() - new Date(createdAt).getTime();
  const timeoutMs = hasReferenceImages ? STALE_JOB_TIMEOUT_WITH_IMAGES_MS : STALE_JOB_TIMEOUT_MS;
  return ageMs > timeoutMs;
}
