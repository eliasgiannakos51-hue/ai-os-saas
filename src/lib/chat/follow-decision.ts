// THE FOLLOW DECISION, WITH NO REACT IN IT.
//
// Split out of hooks/use-stick-to-bottom.ts for the same reason
// lib/sidebar-visibility.ts is split out of sidebar-nav.ts: a gate cannot
// execute a module that imports react, so a rule living beside a hook can
// only ever be READ by a test. This one is a race, and a race read is a
// race believed rather than reproduced — scripts/tests/chat-scroll-race.test.mjs
// runs it as five numbers instead.

export const STICK_THRESHOLD_PX = 96;

/**
 * What to do when content below has grown.
 *
 * PURE, AND SEPARATE FROM THE HOOK, because the bug it fixes is a RACE
 * and a race cannot be reproduced by reading the code. As a function of
 * five numbers it can be, exactly, in scripts/tests/chat-scroll-race.test.mjs.
 *
 * WHY THE `sticking` FLAG WAS NOT ENOUGH — the second half of a fix that
 * was reported as complete.
 *
 * The flag is set by the scroll event handler. Scroll events are
 * DISPATCHED ASYNCHRONOUSLY: the browser updates scrollTop first and
 * tells the page afterwards, on its own schedule. A streamed reply
 * re-renders several times a second, and each render calls this. So the
 * order that produces the reported bug is:
 *
 *   1. the reader turns the wheel; the browser moves scrollTop up
 *   2. a stream chunk lands; React re-renders; this runs
 *   3. `sticking` is STILL true — the scroll event has not been
 *      delivered yet — so the view is yanked back down
 *   4. the scroll event finally arrives and sets `sticking` false,
 *      one frame too late to matter
 *
 * scripts/tests/chat-scroll.prodtest.mjs never caught it because it
 * scrolls while IDLE and then sends: the event has long since fired. The
 * user's own words are the untested case — "the AI is writing AND it
 * drags the screen down".
 *
 * So the decision is made from the DOM rather than from an event that
 * may not have been delivered. `lastSetTop` is the scrollTop this
 * function itself last wrote; if the element is no longer there, a human
 * moved it, whatever any flag says.
 *
 * Growth alone does not look like movement: appending content raises
 * scrollHeight and leaves scrollTop where it was, so `scrollTop ===
 * lastSetTop` still holds and the reader keeps being followed.
 */
export type FollowDecision = "scroll" | "notify" | "none";

export function decideFollow({
  scrollTop,
  scrollHeight,
  clientHeight,
  sticking,
  lastSetTop,
  threshold = STICK_THRESHOLD_PX,
}: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  sticking: boolean;
  /** What this hook last set scrollTop to, or null if it never has. */
  lastSetTop: number | null;
  threshold?: number;
}): FollowDecision {
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  const atBottom = distanceFromBottom <= threshold;

  // A single pixel of tolerance: sub-pixel layout and zoom can shift a
  // scrollTop we set by a fraction without anybody touching anything.
  const movedByHuman = lastSetTop !== null && Math.abs(scrollTop - lastSetTop) > 1;

  if (movedByHuman) {
    // Measured, not remembered. If they moved it back to the bottom
    // themselves, follow again; otherwise leave them exactly where they
    // put themselves and say there is something new below.
    return atBottom ? "scroll" : "notify";
  }

  if (sticking) return "scroll";
  return distanceFromBottom > threshold ? "notify" : "none";
}
