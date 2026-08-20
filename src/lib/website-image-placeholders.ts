// Pure, dependency-free logic for resolving the "PLACEHOLDER:<slug>" image
// convention the Website Builder generation/edit system prompts
// (lib/website-builder.ts) instruct Claude to emit when a real photo is
// wanted but no uploaded reference image covers it. Kept free of any
// "server-only"/fs/network import so it's safely unit-testable and
// importable from both the server-side post-processing step
// (lib/website-image-resolver.ts) and tests, same split as
// lib/clarification-client.ts.

export type ImagePlaceholder = { slug: string; query: string };

const IMG_TAG_WITH_PLACEHOLDER = /<img\b[^>]*\bsrc="PLACEHOLDER:([a-zA-Z0-9_-]{1,64})"[^>]*>/g;
const DATA_QUERY_ATTR = /data-image-query="([^"]*)"/;
const ALT_ATTR = /\balt="([^"]*)"/;

// Finds every <img> tag using the PLACEHOLDER:<slug> convention and pulls
// out a search query for it: data-image-query normally, falling back to
// the tag's own alt text (the system prompt always requires one) if
// data-image-query is missing or empty for some reason. Previously a
// missing data-image-query meant the placeholder was skipped entirely —
// its src literal ("PLACEHOLDER:<slug>") shipped straight to the browser
// as a permanently broken image, with no way to recover since nothing
// downstream ever re-checks it. A real photo the user specifically asked
// for silently never appearing is a worse outcome than resolving it from
// a slightly less precise query, so this now only truly gives up (skips
// the tag, leaving PLACEHOLDER:<slug> as-is) when there's no usable text
// at all to search with.
export function findImagePlaceholders(html: string): ImagePlaceholder[] {
  const results: ImagePlaceholder[] = [];
  const seenSlugs = new Set<string>();
  let match: RegExpExecArray | null;
  IMG_TAG_WITH_PLACEHOLDER.lastIndex = 0;
  while ((match = IMG_TAG_WITH_PLACEHOLDER.exec(html))) {
    const [fullTag, slug] = match;
    if (seenSlugs.has(slug)) continue; // dedupe repeated slugs
    const queryMatch = fullTag.match(DATA_QUERY_ATTR);
    const altMatch = fullTag.match(ALT_ATTR);
    const query = queryMatch?.[1]?.trim() || altMatch?.[1]?.trim();
    if (!query) continue;
    seenSlugs.add(slug);
    results.push({ slug, query });
  }
  return results;
}

/**
 * Progressively broader versions of an image query, most specific first.
 *
 * The Unsplash search is exact enough that a good, specific query
 * ("handmade sourdough loaves cooling rack bakery") can legitimately
 * return zero results — and a zero-result search used to mean giving up
 * on the photo after a single attempt. That is the "it puts the wrong
 * images" report: not a broken integration, a one-shot search with no
 * second attempt.
 *
 * Dropping trailing words keeps the head of the phrase, which is where the
 * subject lives — the system prompt asks for "SUBJECT then STYLE/SETTING",
 * so "sourdough loaves cooling rack bakery" degrades to "sourdough loaves
 * cooling" and then "sourdough loaves", each of which is still ABOUT the
 * bread. Stops at two words: one word no longer describes the subject, so
 * whatever it finds is as unrelated as no search at all — and an
 * unresolved placeholder is REMOVED rather than guessed at.
 */
export function broadenImageQuery(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const attempts: string[] = [];
  for (let length = words.length; length >= 2; length--) {
    attempts.push(words.slice(0, length).join(" "));
  }
  if (attempts.length === 0) attempts.push(words[0]);
  // Cap the round trips: 4 attempts is already an unusually long query,
  // and every attempt is a real HTTP request inside a generation.
  return attempts.slice(0, 4);
}

// NOTE: there is deliberately NO generic fallback image URL here any
// more. There used to be a picsumFallbackUrl() — a live, working
// picsum.photos link seeded by the query — and every placeholder that
// Unsplash could not resolve got one. A live URL, but a photo of
// something else entirely: a random forest on a bakery's page, presented
// as the bakery. Fewer relevant images beat more random ones, so an
// unresolvable placeholder is now stripped (stripPlaceholderImageTags)
// instead of substituted.

// ---------------------------------------------------------------------
// Unsplash attribution
// ---------------------------------------------------------------------
//
// Unsplash's API guidelines require every displayed photo to carry
// "Photo by <name> on Unsplash", with BOTH links pointing back through
// utm_source/utm_medium. It is one of the three conditions for
// production access (50 -> 5000 requests/hour), and it was entirely
// absent: lib/unsplash.ts used to discard the photographer before the
// URL ever reached this file, so there was nothing to render even if
// something had wanted to.

/** The referral parameters Unsplash requires on attribution links. The
 *  source is our application name as registered with them. */
export const UNSPLASH_UTM = "utm_source=ionexa&utm_medium=referral";

export const UNSPLASH_HOME_URL = `https://unsplash.com/?${UNSPLASH_UTM}`;

/** Appends the referral parameters, respecting a URL that already has a
 *  query string. Unsplash profile links do not today, but a link that
 *  silently lost its own query would be a bug nobody would look for. */
export function withUnsplashUtm(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${UNSPLASH_UTM}`;
}

// The photographer's name arrives from a third-party API and is written
// straight into a document we then publish on the customer's behalf.
// Escaping is not politeness here: without it a display name containing
// markup would be injected into every site that used that photo.
// Same implementation as lib/research/report-to-html.ts, which escapes
// third-party source titles for the same reason.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type ResolvedPhoto = {
  url: string;
  photographerName: string;
  photographerUrl: string;
};

// Styled INLINE rather than through a class in the document's <style>.
//
// These pages are generated fresh by a model every time; there is no
// stylesheet this file can rely on, and a class name would be at the
// mercy of whatever CSS the generation happened to produce (including a
// `display:none` on a selector that incidentally matches). An inline
// style wins the cascade outright, so the credit cannot be styled away.
//
// The dark chip is not decoration either: a credit is placed over
// photographs whose brightness is unknown, and plain dark text on a dark
// hero image is invisible — which is indistinguishable from having no
// attribution at all.
const CREDIT_STYLE =
  "display:block;margin:4px 0 0;font-size:11px;line-height:1.4;" +
  "font-family:system-ui,-apple-system,sans-serif;color:#fff;" +
  "background:rgba(0,0,0,.55);padding:2px 6px;border-radius:3px;" +
  "width:fit-content;max-width:100%;";
const CREDIT_LINK_STYLE = "color:#fff;text-decoration:underline;";

/**
 * The "Photo by X on Unsplash" credit for one photo.
 *
 * `rel="noopener noreferrer"` because these open on a published customer
 * site; `target="_blank"` so a visitor following a credit does not lose
 * the page they were reading.
 */
export function buildUnsplashCreditHtml(photo: ResolvedPhoto): string {
  const name = escapeHtml(photo.photographerName);
  const profile = escapeHtml(withUnsplashUtm(photo.photographerUrl));
  const link = (href: string, text: string) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer" style="${CREDIT_LINK_STYLE}">${text}</a>`;
  return (
    `<span class="unsplash-credit" style="${CREDIT_STYLE}">` +
    `Photo by ${link(profile, name)} on ${link(escapeHtml(UNSPLASH_HOME_URL), "Unsplash")}` +
    `</span>`
  );
}

// Replaces every resolved placeholder's <img> tag with the real photo AND
// its attribution.
//
// THE WHOLE TAG IS REWRITTEN, not just the src token. The previous
// version did `html.split("PLACEHOLDER:slug").join(url)`, which could
// only ever change the URL — there was nowhere to put a credit. Matching
// the tag means the credit can be emitted immediately after the image it
// belongs to, which is where an attribution has to be to mean anything.
//
// Still narrow by construction: the pattern requires a literal
// `src="PLACEHOLDER:<slug>"`, so it cannot match any other <img> on the
// page, and a slug that appears in several tags gets all of them
// credited rather than only the first.
export function applyResolvedImageUrls(html: string, resolved: Map<string, ResolvedPhoto>): string {
  let result = html;
  for (const [slug, photo] of resolved) {
    const tagPattern = new RegExp(`<img\\b[^>]*\\bsrc="PLACEHOLDER:${slug}"[^>]*>`, "g");
    result = result.replace(tagPattern, (tag) => {
      const withUrl = tag.replace(`PLACEHOLDER:${slug}`, photo.url);
      return `${withUrl}${buildUnsplashCreditHtml(photo)}`;
    });
  }
  return result;
}

// A query that is asking the stock library for a LOGO. The prompt forbids
// the model from requesting one (LOGO — NEVER INVENT ONE), but the whole
// point of the report was that prompt promises are not enforcement: a
// stock photo presented as the business's logo is a wrong identity, so
// the resolver refuses these outright.
const LOGO_QUERY = /\b(logo|logotype|brand ?mark|wordmark|monogram|emblem|insignia)\b/i;

export function isLogoLikeQuery(query: string): boolean {
  return LOGO_QUERY.test(query);
}

/** Removes the ENTIRE <img> tag for the given placeholder slugs — used
 *  for logo-like placeholders (no stock photo is an acceptable identity)
 *  and for every placeholder Unsplash could not resolve, where a random
 *  substitute or a visibly broken image would be worse than nothing. */
export function stripPlaceholderImageTags(html: string, slugs: string[]): string {
  let result = html;
  for (const slug of slugs) {
    result = result.replace(
      new RegExp(`<img\\b[^>]*\\bsrc="PLACEHOLDER:${slug}"[^>]*>`, "g"),
      ""
    );
  }
  return result;
}
