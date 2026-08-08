/**
 * The pure rules of the learning profile (V3 Task 14) — split from
 * lib/learning.ts (the server-side writer) so they can be unit-tested
 * without a database client in scope.
 */

export const LEARNED_CATEGORIES = ["dismissals", "modules", "design"] as const;
export type LearnedCategory = (typeof LEARNED_CATEGORIES)[number];

/** Sightings → confidence: 1 sighting is a coincidence (0.2), five or
 *  more is a pattern (capped at 1.0). Derived, never invented. */
export function confidenceFromEvidence(evidenceCount: number): number {
  return Math.min(1, Math.max(1, Math.floor(evidenceCount)) / 5);
}

export type LearnedPreference = {
  category: string;
  observation: string;
  confidence: number;
  evidence_count: number;
};

/** What the AI context is allowed to use: repeated observations only.
 *  One sighting is a coincidence and must not steer anything. */
export function contextWorthy(preferences: LearnedPreference[]): LearnedPreference[] {
  return preferences.filter((p) => p.evidence_count >= 2).slice(0, 10);
}
