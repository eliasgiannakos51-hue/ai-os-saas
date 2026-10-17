/**
 * THE RATING ON A CHAT ANSWER: thumbs up (1), thumbs down (-1), or none
 * (null). Read by src/app/api/chat/messages/[id]/rating/route.ts and by the
 * row under each answer (src/components/chat/answer-actions.tsx), so the
 * three values are written down once.
 *
 * Pressing the thumb that is already lit takes the rating back, which is
 * what every rating row a person has used does; `nextRating` is that rule.
 */
export type AnswerRating = 1 | -1 | null;

export function parseRating(value: unknown): { ok: true; rating: AnswerRating } | { ok: false } {
  if (value === null) return { ok: true, rating: null };
  if (value === 1 || value === -1) return { ok: true, rating: value };
  return { ok: false };
}

export function nextRating(current: AnswerRating, pressed: 1 | -1): AnswerRating {
  return current === pressed ? null : pressed;
}
