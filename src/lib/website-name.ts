/**
 * A NAME FOR A SITE NOBODY WAS ASKED TO NAME.
 *
 * THE FORM THIS REPLACES. /dashboard/website-builder opened a panel with
 * a required "Website name" text input above the description, and
 * `handleGenerate` returned early on an empty one. So the first thing
 * the product asked a person who wanted a website was what to call the
 * record of it — before anything existed to look at, and in a field
 * whose answer nothing downstream shows them.
 *
 * A chat box asks for one thing. Measured 2026-09-27 by
 * scripts/measure-make-steps.mjs, the Website Builder's generate button
 * waited on two user inputs where every other drawn Make row waits on
 * one or none.
 *
 * THE DERIVATION ALREADY EXISTED, in one code path, which is the whole
 * argument that this is safe. A brief arriving from Create Studio
 * (`?brief=`) filled the name with `brief.slice(0, MAX_NAME_LENGTH)` and
 * submitted without anybody typing a name. That path has worked since
 * the studio did. This makes it the rule instead of the exception.
 *
 * WHAT THE NAME IS FOR, so that the derivation can be judged against it
 * rather than against taste:
 *
 *   - it is the row's label in the list of sites;
 *   - `api/websites/generate` uses (user_id, name) to notice a second
 *     press within two minutes and return the pending row instead of
 *     starting a second generation.
 *
 * The second is why this is DETERMINISTIC and takes no clock, no random
 * and no model: the same description must produce the same name, or the
 * duplicate check stops working on the double-press it exists for.
 *
 * NO LANGUAGE IS ASSUMED. It cuts on whitespace and on a small set of
 * punctuation, which behaves the same in Greek, Arabic, Chinese and
 * English; anything smarter would need to know which language it is
 * reading, and this product ships in ten.
 */

/** The longest a stored site name may be — the column and the old input agreed on 100. */
export const MAX_WEBSITE_NAME_LENGTH = 100;

/**
 * A site name from what the person asked for.
 *
 * Returns "" for an empty description, and the caller decides: the route
 * still refuses a request with no description at all, which is the one
 * thing it cannot derive anything from.
 */
export function websiteNameFrom(description: string): string {
  const text = String(description ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  // THE FIRST CLAUSE, not the first hundred characters. A description
  // usually opens with what the site is ("a site for a coffee shop in
  // Thessaloniki, with the menu and opening hours") and the part before
  // the first full stop, newline or comma is the part a person would
  // have typed into the box that is gone.
  const firstClause = text.split(/[.!?;\n·،。，、]/)[0].trim() || text;
  const candidate = firstClause.length > 0 ? firstClause : text;
  if (candidate.length <= MAX_WEBSITE_NAME_LENGTH) return candidate;
  // CUT ON A WORD BOUNDARY WHERE THERE IS ONE. Chinese and Japanese
  // write without spaces, so `lastIndexOf(" ")` returns -1 there and the
  // hard slice is correct rather than a fallback — a cut mid-word is
  // what those scripts do at a line break too.
  const hard = candidate.slice(0, MAX_WEBSITE_NAME_LENGTH);
  const lastSpace = hard.lastIndexOf(" ");
  return (lastSpace > MAX_WEBSITE_NAME_LENGTH / 2 ? hard.slice(0, lastSpace) : hard).trim();
}
