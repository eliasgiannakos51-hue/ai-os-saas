/**
 * ONE TRUNCATOR.
 *
 * ------------------------------------------------------------------
 * SEVEN IMPLEMENTATIONS, THREE ANSWERS, ONE CONTRACT NOBODY KEPT
 * ------------------------------------------------------------------
 *
 * Found by scanning for the BEHAVIOUR — a slice with an ellipsis — rather
 * than for a name, because they were called clamp, clampOneLine,
 * truncate, excerpt, cleanText, clip and autoTitleFromMessage. Run
 * against the same input they give three different answers, and six of
 * the seven break the only promise the parameter makes:
 *
 *   "hello world this is long", max=10
 *       "hello wor…"   clamp, clampOneLine, truncate, excerpt, cleanText
 *       "hello worl…"  autoTitle, clip          ← ELEVEN characters
 *
 *   max=0
 *       "hello world this is lon…"  clamp, truncate, excerpt, cleanText
 *       ""                          clampOneLine
 *       "…"                         autoTitle, clip
 *
 * That last row is the one worth staring at. `slice(0, max - 1)` with
 * max = 0 is `slice(0, -1)`, and a negative end index counts FROM THE
 * END: it drops the last character and keeps everything else. Four
 * implementations return a twenty-four character string when asked for
 * zero. Nothing throws, nothing warns, and the result looks like text
 * because it is.
 *
 * Only clampOneLine was right at every boundary, and only because
 * somebody had hit the problem and added `if (max <= 1) return ""` to
 * that one copy. Which is the whole shape: the fix existed, in the file
 * where the accident happened, and nowhere else.
 *
 * ------------------------------------------------------------------
 * THE CONTRACT
 * ------------------------------------------------------------------
 *
 * The result is NEVER longer than `max`. That is the entire promise, it
 * holds at 0 and 1 as well as at 400, and it is what
 * scripts/tests/truncate.test.mjs measures across the whole range rather
 * than at a couple of convenient values.
 */

/** The character that marks a cut. One code point, not three dots. */
export const ELLIPSIS = "…";

export type TruncateOptions = {
  /**
   * Collapse every run of whitespace to a single space first.
   *
   * Four of the seven did this and three did not, which is a real
   * difference rather than an accident: an excerpt of a chat message
   * wants one line, and a title the user typed should keep its shape.
   * So it stays a choice — but an explicit one.
   */
  collapseWhitespace?: boolean;
};

/**
 * Cut `text` to at most `max` characters, marking the cut.
 *
 * `max <= 0` gives "", because there is no length at which an ellipsis
 * fits into zero characters and returning one anyway is how four of the
 * old copies came to exceed their own limit.
 */
export function truncate(text: unknown, max: number, options: TruncateOptions = {}): string {
  const raw = typeof text === "string" ? text : "";
  const collapsed = options.collapseWhitespace ? raw.replace(/\s+/g, " ") : raw;
  const trimmed = collapsed.trim();

  // INFINITY IS NOT NONSENSE, IT IS "NO LIMIT" — and the first version of
  // this function returned "" for it, because `!Number.isFinite(max)`
  // swept it in with NaN. That is silent data loss dressed as a guard,
  // and it is the same class of accident as the slice(0, -1) this
  // function was written to replace: a boundary whose behaviour fell out
  // of an expression rather than being decided.
  //
  // Caught by scripts/tests/numeric-boundaries.test.mjs on its first run,
  // against the function that gate exists because of.
  if (max === Infinity) return trimmed;
  // NaN, undefined and negatives are a limit that could not be computed.
  // Empty is the safe direction: the promise is "never longer than max",
  // and there is no length that satisfies it when max is not a number.
  if (!Number.isFinite(max) || max <= 0) return "";
  if (trimmed.length <= max) return trimmed;
  if (max === 1) return ELLIPSIS;

  // trimEnd() so a cut never lands mid-space, leaving "word …". It can
  // only make the result shorter, so the contract holds either way.
  return `${trimmed.slice(0, max - 1).trimEnd()}${ELLIPSIS}`;
}
