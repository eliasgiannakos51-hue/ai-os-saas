"use client";

import { useEffect } from "react";
import { markJobConsumed } from "@/lib/jobs/consume";

/**
 * Renders nothing and reports one thing: this job's result is on screen.
 *
 * IT IS A COMPONENT RATHER THAN A useEffect IN THE PARENT ON PURPOSE.
 * Placed inside the preview's own JSX, it can only mount when the preview
 * itself mounts — so "the user has seen it" is decided by what was
 * actually rendered, not by a state change that was supposed to lead to a
 * render. A parent effect keyed on `preview !== null` fires identically
 * whether the preview reached the screen or was replaced in the same
 * commit by an error, and a result marked seen that was never shown is a
 * result the user has to pay for twice.
 */
export function JobSeen({ jobId }: { jobId: string | null | undefined }) {
  useEffect(() => {
    void markJobConsumed(jobId);
  }, [jobId]);
  return null;
}
