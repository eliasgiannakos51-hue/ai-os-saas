import { normalizeForSearch } from "@/lib/text/search-match";
import { truncate } from "@/lib/text/truncate";

/**
 * THE NUMBERS THE CHATS PAGE'S CONTENT SEARCH IS BOUND BY, in one place
 * so the route enforces them and the screen can state them.
 *
 * A cap that only the route knows is a cap the person cannot see: they
 * search, they get four results, and they have no way to tell "there
 * were four" from "we stopped looking". Both ends read these.
 */
/** Newest messages read per query. The ceiling that makes the ILIKE
 *  affordable without an index on `content`. */
export const CONTENT_ROWS_SCANNED = 400;
/** Distinct conversations reported back. */
export const CONTENT_MATCHES_CAP = 50;
/** Below this the page filters titles only — see the route's header. */
export const MIN_CONTENT_QUERY = 2;
/** Characters of the matching message shown under the title. */
export const SNIPPET_CHARS = 120;

/**
 * `%` and `_` are wildcards and `\` escapes them, so a search for "100%"
 * must not become a search for "100<anything>". The same helper
 * components/entity-links/link-to-modal.tsx uses, moved here because a
 * second copy of an escaping rule is a second chance to get it wrong.
 */
export function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
}

/**
 * The line to show under a hit: the message, cut around where the words
 * actually matched rather than from the start.
 *
 * MATCHED WITH THE SAME FOLDING THE TITLES USE (normalizeForSearch:
 * case, accents, Greek final sigma, Greeklish), and then the window is
 * taken from the ORIGINAL text — so the person reads their own
 * sentence, accents and all, and not its folded shadow. The two strings
 * have the same length because foldForMatch
 * (lib/text/unicode-patterns.ts) refuses any fold where
 * `stripped.length === ch.length` does not hold — that guard is what
 * makes the index transferable from the folded string to the original,
 * and a fold that changed the length would put this window in the
 * wrong place.
 */
export function contentSnippet(content: string, query: string): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (text.length <= SNIPPET_CHARS) return text;
  const at = normalizeForSearch(text).indexOf(normalizeForSearch(query));
  // CUT FROM THE FRONT WITH truncate(), NOT WITH slice() AND AN
  // ELLIPSIS. lib/text/truncate.ts exists because the hand-rolled
  // version was off by one — the ellipsis was appended AFTER slicing to
  // the full length, so every cut string was one character over the
  // limit it was supposed to respect — and truncate.test.mjs now
  // forbids the shape repo-wide.
  if (at < 0) return truncate(text, SNIPPET_CHARS);
  const start = Math.max(0, at - Math.floor(SNIPPET_CHARS / 3));
  // The TAIL is cut by the same function; the HEAD gets its own
  // ellipsis because nothing shared trims a string's beginning, and a
  // window that starts mid-sentence has to say so.
  const tail = truncate(text.slice(start), SNIPPET_CHARS);
  return start > 0 ? `…${tail}` : tail;
}

/**
 * How many conversations the Chats page renders.
 *
 * "Όλες οι συνομιλίες" is the promise, and this is the number that
 * keeps it honest: an account with ten thousand of them would
 * otherwise send ten thousand rows to a phone. The page READS this
 * constant too and says when it has been reached, because a silently
 * truncated "all" is the same screen as a broken one.
 */
export const CHATS_LIST_CAP = 500;
