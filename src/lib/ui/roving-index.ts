/**
 * WHERE AN ARROW KEY GOES, WHEN NOTHING IS FOCUSED YET.
 *
 * Both keyboard menus in this app computed it inline and both got the same
 * half of it wrong, for the same reason: they asked `list.indexOf(active)`
 * and then treated the answer as a position without asking whether there
 * WAS one.
 *
 *     const current = list.indexOf(document.activeElement);   // -1
 *     const next = down ? (current + 1) % len                 // 0   ✓
 *                       : (current - 1 + len) % len;          // len-2 ✗
 *
 * -1 is not "one before the first". It means the focused element is not in
 * the list at all — which is the state a menu is in the moment it opens,
 * because focus is still on the trigger. Down happened to be right by
 * arithmetic accident (-1 + 1 = 0). Up landed on the SECOND-TO-LAST item
 * of a freshly opened menu: with three items it opened on the middle one,
 * with two on the first. The menu pattern says Up from the trigger goes to
 * the LAST item, and the people this hurts are the ones navigating by
 * keyboard, who are also the least likely to be the ones filing the bug.
 *
 * So the arithmetic lives here once, with the not-found case as a real
 * branch rather than a coincidence, and scripts/tests/roving-index.test.mjs
 * puts 0, 1, -1, NaN, Infinity, undefined and the length itself through it.
 */

export type ArrowDirection = "next" | "previous";

/**
 * The index to focus after an arrow key.
 *
 * @param current the index of what is focused now, or -1 (or anything else
 *                that is not a real index) when focus is outside the list
 * @param length  how many items there are
 * @returns the index to focus, or null when there is nothing to focus
 */
export function rovingIndex(
  current: number,
  length: number,
  direction: ArrowDirection
): number | null {
  // A LENGTH THAT IS NOT A COUNT. `(x) % 0` is NaN and `list[NaN]` is
  // undefined, which one caller then read a property off — a crash rather
  // than a no-op. Non-integers, negatives and NaN arrive from the same
  // place a zero does: a list that is not there yet.
  if (!Number.isFinite(length) || length < 1) return null;
  const size = Math.floor(length);

  // NOT IN THE LIST. Down opens at the first item, up at the last — the
  // menu pattern, and the case that was wrong.
  if (!Number.isInteger(current) || current < 0 || current >= size) {
    return direction === "next" ? 0 : size - 1;
  }

  return direction === "next" ? (current + 1) % size : (current - 1 + size) % size;
}
