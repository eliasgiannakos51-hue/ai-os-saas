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
