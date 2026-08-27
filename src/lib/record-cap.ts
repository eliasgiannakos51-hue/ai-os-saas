/**
 * How many rows a list page reads before it stops, and says so.
 *
 * EVERY MODULE PAGE READ EVERY ROW THE ACCOUNT HAD EVER CREATED, with
 * every column: `.select("*")` with an `order` and no `limit`. On a young
 * account that is invisible. On an account that has been used for a year
 * it is the whole table over the wire on every visit, parsed into the
 * server render, serialised into the HTML, and then paginated in the
 * BROWSER — the pagination controls at the bottom of those pages never
 * saved a single byte, because everything they page through has already
 * arrived.
 *
 * FIVE HUNDRED, AND THE REASON IS NOT PERFORMANCE. A cap is a promise
 * that the page is complete, and breaking that promise silently is worse
 * than being slow: somebody scrolls to the bottom, sees their oldest
 * entry is missing, and concludes the product lost it. So the number is
 * high enough that almost nobody reaches it, and every list that reaches
 * it SAYS SO, in words, with a way to find the rest.
 *
 * THE SENTENCE HAS TO STAY TRUE. "Older entries are still there — search
 * finds them" is only honest while search reads the database rather than
 * the page: /dashboard/memory queries the module tables server-side, so
 * it does. If that ever changes, this copy is wrong before the cap is.
 */
export const RECORD_CAP = 500;

/**
 * Whether a list came back full, and is therefore probably cut off.
 *
 * `>=` rather than `===`: a caller that passes a different limit, or a
 * future page that reads with `range`, must still trip this. An exact
 * comparison would quietly stop warning the day the number moved.
 */
export function isCapped(rows: { length: number }, cap: number = RECORD_CAP): boolean {
  return rows.length >= cap;
}
