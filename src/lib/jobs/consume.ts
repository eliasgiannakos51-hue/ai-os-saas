"use client";

/**
 * Tells the server that a finished result has been put in front of the
 * user, so the next page-open does not offer it again.
 *
 * WHY THE SERVER AND NOT THIS BROWSER. The reason /api/jobs offers
 * finished work at all is that the browser remembers nothing reliable: a
 * second tab, another machine and a cleared cache each produce a client
 * with no idea what has been shown. A localStorage flag would re-offer the
 * draft the other tab is displaying right now.
 *
 * THE IN-MEMORY SET IS NOT THAT FLAG. It is a same-page duplicate guard —
 * React mounts an effect twice in development on purpose, and a preview
 * that is rendered and then discarded reports the same id from two places.
 * It is never consulted to decide whether to SHOW anything; the row
 * decides that.
 */
const reported = new Set<string>();

export async function markJobConsumed(jobId: string | null | undefined): Promise<void> {
  if (!jobId || reported.has(jobId)) return;
  reported.add(jobId);
  try {
    // keepalive because the commonest moment for this to fire is a user
    // leaving: Discard and then navigate, or a preview unmounting as the
    // page changes. Without it the request is cancelled with the document
    // and the result is offered again on the next visit.
    const response = await fetch(`/api/jobs/${jobId}/consume`, {
      method: "POST",
      keepalive: true,
    });
    if (!response.ok) throw new Error(`consume responded ${response.status}`);
  } catch {
    // A dropped mark is recoverable and a permanent one is not, so this
    // forgets the attempt. The worst case is that the result is offered
    // once more on the next visit — which is the behaviour of a job that
    // was never seen, i.e. the safe direction. Swallowing the failure AND
    // remembering it would silently lose the mark forever.
    reported.delete(jobId);
  }
}

/** Test seam: the guard is module-level state, and a test that exercises
 *  two ids in one process needs to be able to start clean. */
export function resetConsumeGuardForTests(): void {
  reported.clear();
}
