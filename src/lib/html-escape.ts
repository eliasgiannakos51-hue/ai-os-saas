/**
 * ONE HTML ESCAPER.
 *
 * ------------------------------------------------------------------
 * WHY THIS FILE EXISTS: THERE WERE EIGHT, AND THEY DISAGREED
 * ------------------------------------------------------------------
 *
 * Measured across src/ during the V4.6 audit — ELEVEN of them, and the
 * count started at eight: a grep for `function escapeHtml` found eight,
 * and the gate written to replace it found three more named escapeAttr
 * and escapeText. Two of those three write into a PUBLISHED customer
 * page's attributes.
 *
 *   4 escaped  & < > " '     the complete set
 *   3 escaped  & < > "       missing the apostrophe
 *   3 escaped  & " < >       the seo/ pair, missing the apostrophe
 *   1 escaped  & < >         missing both quotes
 *
 * None of the three weaker ones was exploitable, and that is the point.
 * They are safe because every one of their call sites happens to
 * interpolate into text content or into a DOUBLE-quoted attribute — a
 * property of eight files that nothing states and nothing checks. Copy
 * the four-character version into a template that uses `href='...'` and
 * it is an injection, with no diff anywhere that looks wrong.
 *
 * This is the same shape as the fourteen copies of the Resend sender
 * address, and it fails the same way: OPEN. A weaker escaper does not
 * throw, does not warn, and produces output that looks correct until the
 * one input that matters.
 *
 * ------------------------------------------------------------------
 * TWO FUNCTIONS, NOT ONE, AND THE SECOND IS NOT A WEAKER COPY
 * ------------------------------------------------------------------
 *
 * lib/notify/channels/telegram.ts genuinely needs a narrower escape, and
 * it was the file escaping the fewest characters — which read as the
 * worst drift and was the one deliberate case. Telegram's HTML parse mode
 * accepts a small fixed tag set and its documentation names exactly three
 * characters to replace. Sending it `&quot;` risks the entity being
 * rendered literally in a chat message rather than parsed.
 *
 * So the narrow one is exported, named for its single purpose, and
 * scripts/tests/html-escape.test.mjs holds it to being used ONLY there.
 * A deliberate exception with a name is a different object from an
 * accidental copy that happens to be shorter.
 */

/** Escape for HTML text content and for attributes in either quote style. */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Telegram's HTML parse mode, which is not HTML.
 *
 * ONLY for lib/notify/channels/telegram.ts, and only for TEXT CONTENT —
 * the three interpolations there sit inside `<b>` or stand alone, never
 * in an attribute. Telegram's API documentation says: "you must replace
 * the characters '<', '>' and '&' with the corresponding HTML entities".
 * Escaping quotes as well is not safer here, it is a different bug: the
 * entity can reach the reader as literal text.
 *
 * If a Telegram message ever needs an `<a href="...">` built from user
 * text, that is escapeHtml's job and this is the wrong function.
 */
export function escapeTelegramHtml(value: string): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
