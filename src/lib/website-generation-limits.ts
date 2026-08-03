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
// Three tiers, from cheapest to most expensive generation:
//   1. base (no images, normal-length description) — 5 min
//   2. has reference images — 12 min (Claude's vision input adds real
//      processing time on top of the base generation)
//   3. "large request" (description > LARGE_REQUEST_DESCRIPTION_CHARS,
//      i.e. >5000 chars, OR image count >= LARGE_REQUEST_IMAGE_COUNT,
//      i.e. >=10) — 25 min. Both a very long, detailed brief and a large
//      batch of reference images measurably slow generation beyond what
//      the has-images tier alone budgets for; this tier supersedes tier
//      2, it isn't stacked with it.
// is_large_request is computed once at creation time (api/websites/
// generate/route.ts, from the same request the user actually submitted)
// and stored, rather than re-derived here, since the description/image
// count aren't otherwise available to api/websites/status at poll time.
//
// Every tier is set with headroom above api/websites/generate/process's
// maxDuration (see that route for the current value and the platform-
// specific ceiling it's chosen against) so the platform's own execution
// timeout is always what kills a truly stuck job first — this is purely
// the client-visible backstop for when even that doesn't happen.
export const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000;
export const STALE_JOB_TIMEOUT_WITH_IMAGES_MS = 12 * 60 * 1000;
export const STALE_JOB_TIMEOUT_LARGE_REQUEST_MS = 25 * 60 * 1000;

export const LARGE_REQUEST_DESCRIPTION_CHARS = 5000;
export const LARGE_REQUEST_IMAGE_COUNT = 10;

export function isLargeGenerationRequest(descriptionLength: number, imageCount: number): boolean {
  return descriptionLength > LARGE_REQUEST_DESCRIPTION_CHARS || imageCount >= LARGE_REQUEST_IMAGE_COUNT;
}

// Pure predicate — no I/O, no Date.now() call baked in — so it's directly
// unit-testable with fixed timestamps instead of needing to fake the
// clock or wait for real time to pass. api/websites/status calls this
// with real values; tests call it with constructed ones.
export function isGenerationJobStale(
  status: "pending" | "processing" | "completed" | "failed" | "flagged",
  createdAt: string,
  now: Date,
  hasReferenceImages: boolean,
  isLargeRequest: boolean
): boolean {
  if (status !== "pending" && status !== "processing") return false;
  const ageMs = now.getTime() - new Date(createdAt).getTime();
  const timeoutMs = isLargeRequest
    ? STALE_JOB_TIMEOUT_LARGE_REQUEST_MS
    : hasReferenceImages
      ? STALE_JOB_TIMEOUT_WITH_IMAGES_MS
      : STALE_JOB_TIMEOUT_MS;
  return ageMs > timeoutMs;
}
