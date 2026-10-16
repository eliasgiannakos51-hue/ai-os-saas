
import { truncate } from "@/lib/text/truncate";
/**
 * The one place that decides how long a conversation title may be.
 *
 * IT IS SHARED ON PURPOSE. The cap has to exist on the server — a title
 * written by anything that skips the sidebar is still a title the sidebar
 * has to draw — but a server-only cap means the user types 140 characters,
 * sees them, and watches 40 of them disappear on save. So the input caps
 * too, and both read this constant rather than each carrying a 100 that
 * can drift apart.
 *
 * 100 characters is roughly two lines in a 256px sidebar. Longer titles
 * are not refused, they are trimmed: a rename is an edit to a label, and
 * refusing the whole edit over its length would lose text the user typed
 * for no benefit.
 */
export const MAX_CONVERSATION_TITLE_LENGTH = 100;

/**
 * Trim, collapse runs of whitespace, then cut to the limit. The collapse
 * matters because a title pasted out of a document arrives with newlines
 * in it, and a newline in a sidebar row is invisible — it just makes the
 * row taller with a gap nobody can explain.
 *
 * Returns an empty string for input that is only whitespace. The caller
 * decides what that means; the route refuses it rather than storing a
 * blank label.
 */
export function normaliseConversationTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_CONVERSATION_TITLE_LENGTH);
}

/**
 * The name a conversation gets when nobody has named it: its first
 * message, shortened.
 *
 * THERE IS NO auto_title COLUMN, deliberately. The automatic name has
 * always been a pure function of the first user message, so it can be
 * recomputed at any time from a row that is already there — and a stored
 * copy would be a second source of truth that goes stale the moment
 * anything edits the message it came from. Recomputing also works for
 * every conversation created before this existed, which a backfill would
 * have had to guess at.
 *
 * Forty characters rather than the hundred a person may type: this is a
 * label nobody chose, and a long one crowds out the ones somebody did.
 */
export const AUTO_TITLE_MAX_LENGTH = 40;

export function autoTitleFromMessage(message: string): string {
  // WAS max+1. The ellipsis was appended AFTER slicing to the full
  // length, so every truncated title was one character over the limit
  // this constant exists to state. See lib/text/truncate.ts.
  return truncate(message, AUTO_TITLE_MAX_LENGTH, { collapseWhitespace: true });
}

/**
 * The title a conversation has before anything is said in it.
 *
 * NOT A UI STRING — it is the DEFAULT ON THE COLUMN,
 * `title text not null default 'New conversation'`
 * (20260803000000_baseline_schema.sql), so it is the literal English
 * sitting in the database for every conversation nobody has written to.
 * Every list therefore has to recognise it and show the reader's own
 * language instead, and it was being recognised by a bare string
 * comparison written out twice. Named here so the day the default
 * changes there is one place that is wrong instead of two silently
 * printing "New conversation" to a Greek reader.
 */
export const STORED_DEFAULT_TITLE = "New conversation";

/** The name to show, or null when the stored one is just the column's
 *  default and the caller should use its own translated fallback. */
export function displayConversationTitle(title: string | null | undefined): string | null {
  const t = (title ?? "").trim();
  return t && t !== STORED_DEFAULT_TITLE ? t : null;
}
