/**
 * THE ONE THING LEFT HERE: HOW LONG A TURN MAY BE.
 *
 * Until 2026-10-18 this file held five fixed operations (generate,
 * explain, find_bugs, convert, write_tests), their prompts, and the
 * four absences stated as a permanent box on the screen. The owner's
 * own words that day — «Το Coding καταλαβαίνει μόνο του τι ζητάω» —
 * replaced all of that with a conversation: lib/coding/coding-prompt.ts
 * now owns the prompt (buildTurnPrompt / buildEditPrompt), the four
 * absences (said in the model's own reply, in one sentence, only when
 * what was asked assumes one of them — not a box), and the history
 * list's title (deriveConversationTitle). None of that needed an
 * "operation" to be chosen first, so CODE_OPERATIONS, OPERATION_SPECS,
 * CODE_LIMITS, CODE_LANGUAGES and buildCodePrompt went with it.
 *
 * What stays is the one rule that was never about an operation: a turn
 * over MAX_INPUT_CHARS is a project, not a paste, and this product does
 * not do whole projects — refused with that reason rather than quietly
 * truncated, which is a decision coding-prompt.ts still reads from here
 * rather than re-declaring its own ceiling.
 *
 * Pure — no SDK, no database. scripts/tests/coding.test.mjs and
 * scripts/tests/coding-prompt.test.mjs both read this file.
 */

/** Longer than this and the request is a project, which is the thing
 *  this explicitly does not do. Refused with that sentence rather than
 *  truncated — silently analysing the first half of somebody's file and
 *  reporting on it is worse than saying no. */
export const MAX_INPUT_CHARS = 24_000;
export const MIN_INPUT_CHARS = 10;

export type InputVerdict = { ok: true } | { ok: false; reason: "too_short" | "too_long"; limit: number };

export function checkInput(input: string): InputVerdict {
  const length = input.trim().length;
  if (length < MIN_INPUT_CHARS) return { ok: false, reason: "too_short", limit: MIN_INPUT_CHARS };
  if (length > MAX_INPUT_CHARS) return { ok: false, reason: "too_long", limit: MAX_INPUT_CHARS };
  return { ok: true };
}
