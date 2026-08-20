// What the generated site is still MISSING, read off the page itself.
//
// The generation prompt forbids inventing a phone number, an address, a
// price or an opening time, and instead requires a visible bracketed
// placeholder in the right position ("SHOW A GAP, NEVER HIDE ONE"). That
// is the correct behaviour — a plausible-looking fake is far worse,
// because the owner ships it without noticing.
//
// But a gap the owner has to FIND is only half a promise kept: the
// report was "it did not put in the numbers", from somebody who had not
// spotted the placeholders sitting in the footer. So the page is scanned
// after generation and the blanks are listed, in one place, next to the
// preview. No model call, no second source of truth — the list IS what
// is on the page.
//
// Pure and dependency-free (no "server-only") so both the API route and
// the client can use it, same split as lib/website-image-placeholders.ts.

/** One unfilled blank, as it appears on the page. */
export type UnfilledPlaceholder = {
  /** The bracketed text, without the brackets. */
  text: string;
  /** How many times it appears. */
  count: number;
};

// Bracketed text inside the BODY content, not inside a tag. Deliberately
// narrow: 2–60 characters, no angle brackets (so it cannot span markup),
// no other brackets (so nested junk is skipped), and at least one letter
// — which excludes "[1]", "[0]" and CSS/JS array indexing that survives
// the tag strip.
const BRACKETED = /\[([^[\]<>\n]{2,60})\]/g;

/** Elements whose text is code or metadata, never visible prose. */
const NON_PROSE = /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Every bracketed blank still on the page, most frequent first.
 *
 * Scans only visible text: script/style bodies are dropped whole, and
 * tags are removed before matching, so a `[` inside an attribute or a
 * stylesheet cannot be reported as something the owner must fill in.
 */
export function findUnfilledPlaceholders(html: string): UnfilledPlaceholder[] {
  const visible = html
    .replace(NON_PROSE, " ")
    .replace(/<[^>]*>/g, " ");

  const counts = new Map<string, { text: string; count: number }>();
  BRACKETED.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRACKETED.exec(visible))) {
    const text = match[1].trim();
    if (!text || !/\p{L}/u.test(text)) continue;
    const key = text.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { text, count: 1 });
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}
