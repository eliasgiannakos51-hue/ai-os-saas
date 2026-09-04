import { escapeHtml } from "@/lib/html-escape";
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
// style wins the cascade outright.
//
// CORRECTION, MEASURED IN A BROWSER. This comment used to end "so the
// credit cannot be styled away", and that was wrong in the way that
// mattered. An inline style beats `display:none` on the span itself. It
// cannot beat the ANCESTOR, and clipping and stacking are ancestor
// properties:
//
//   .media{height:260px;overflow:hidden}  -> the credit sits below the
//     clip and has ZERO visible pixels.
//   .hero{position:relative} .hero img{position:absolute;inset:0}  -> a
//     non-positioned in-flow span paints before a positioned descendant,
//     so THE IMAGE PAINTS OVER ITS OWN CREDIT. No overlay needed.
//
// Both were measured on this exact markup under the real published-site
// CSP (scripts/tests/unsplash-credit-visible.prodtest.mjs), and neither
// is exotic: HERO_PATTERNS[0] in lib/website-variation.ts is literally
// "full-bleed-photo", drawn for roughly one site in five.
//
// `position:relative` below is the minimal cure for the second shape: it
// promotes the span into the positioned-descendant paint step, where DOM
// order puts it after the image it belongs to. No z-index, deliberately —
// a large z-index would win against the model's own heading as well, and
// covering the page's <h1> to show a credit is not an improvement.
// Clipping it cannot fix, which is why buildPageCreditsBlock exists.
//
// The dark chip is not decoration either: a credit is placed over
// photographs whose brightness is unknown, and plain dark text on a dark
// hero image is invisible — which is indistinguishable from having no
// attribution at all.
const CREDIT_STYLE =
  "display:block;position:relative;margin:4px 0 0;font-size:11px;line-height:1.4;" +
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
      // A FUNCTION replacer, not a replacement string, and the difference
      // is an HTML injection. String.replace() expands $&, $`, $', $$ and
      // $1-$99 inside a replacement STRING, and photo.url is third-party
      // text straight out of Unsplash's urls.regular. A url containing
      // "$`" expands to everything before the match — the rest of the
      // <img> tag — which closes the src attribute and writes new markup
      // into a page we publish on a customer's domain. A function replacer
      // is never scanned for those patterns.
      const withUrl = tag.replace(`PLACEHOLDER:${slug}`, () => photo.url);
      // The photographer is written onto the IMAGE, not only into the
      // credit beside it. See enforceUnsplashAttribution below for why
      // the document has to be able to describe its own photos.
      return `${stampProvenance(withUrl, photo)}${buildUnsplashCreditHtml(photo)}`;
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

/**
 * A search phrase written in a script the photo library cannot search.
 *
 * THE PROMPT ASKS FOR ENGLISH, AND ASKING IS NOT ENFORCING. website-builder.ts
 * tells the model the query must be "ALWAYS IN ENGLISH, even when the page
 * itself is in another language — the photo library is searched in English,
 * and a Greek or German query returns nothing". That is rule 23 of this
 * project's own list: an instruction the model can ignore, with nothing
 * downstream noticing.
 *
 * What it costs when it is ignored: up to four Unsplash requests per bad
 * query out of a shared budget of twelve, and — the reason this is a check
 * rather than a saving — LOGO_QUERY above is English too. `\b(logo)\b` does
 * not match "λογότυπο", so a logo placeholder written in Greek is not
 * recognised as one, goes to the photo library, and any photo it happens to
 * return is published as somebody's brand mark. "A wrong logo is a wrong
 * identity" is the reported bug that check exists for.
 *
 * NON-LATIN, NOT NON-ASCII. "café interior" and "Zürich rooftop" are English
 * queries with accented letters and must survive; "καφετέρια" and "喫茶店"
 * are not English at all. The test is whether any LETTER is outside the
 * Latin script, which is the line between those two cases.
 */
export function isNonLatinQuery(query: string): boolean {
  for (const ch of query) {
    if (!/\p{L}/u.test(ch)) continue;
    if (!/\p{Script=Latin}/u.test(ch)) return true;
  }
  return false;
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

// ---------------------------------------------------------------------
// Making the attribution SURVIVE — the second cause.
// ---------------------------------------------------------------------
//
// Everything above puts the credit into the document the GENERATOR
// produces. That was treated as the whole requirement, and it is half of
// it, because a published site does not stay as generated.
//
// api/websites/edit/route.ts sends the site's CURRENT html to Claude and
// stores the FULL document that comes back. EDIT_SYSTEM_PROMPT asks it to
// "keep every other section exactly as they were", and a model rewriting
// a hero block sees a <span class="unsplash-credit"> wedged between the
// <img> and the <h1>, reads it as leftover markup, and does not carry it
// forward. The photo stays — still hotlinked from images.unsplash.com,
// now with nobody's name on it — on a live customer page, with nothing
// red anywhere to say so. That is exactly the state an Unsplash
// production-access review looks for.
//
// lib/website-link-safety.ts already wrote down the principle for the
// identical failure shape ("A prompt rule is a strong prior, not a
// guarantee, and the failure mode is silent and user-visible on the
// customer's live site"), and its answer was to ask in the prompt AND
// enforce before storing. This is that same answer for attribution.
//
// WHY THE PROVENANCE LIVES ON THE <img>. To restore a credit you need the
// photographer, and after an edit the only copy of that name was in the
// span that just got deleted. So applyResolvedImageUrls also writes it
// onto the image itself, as data-unsplash-photographer /
// data-unsplash-profile. The document then describes its own photos, and
// that survives three things a database sidecar would not: an edit that
// reorders the page, a DOWNLOAD of the single HTML file, and a photo the
// owner copy-pastes from one of their sites into another.
//
// WHAT HAPPENS WHEN EVEN THAT IS GONE. If a rewrite took the credit AND
// the attributes, there is no name left anywhere and the photo cannot be
// credited. lib/unsplash.ts already states the rule for that case in its
// note on UnsplashPhoto — a photo we cannot attribute is a photo we are
// not allowed to display — so the <img> is removed. Losing an image is a
// visible, fixable disappointment; shipping an uncredited one is a
// licence breach on the customer's own domain.

/**
 * Every Unsplash photo URL this app can produce comes from their CDN, and
 * this prefix is how anything downstream tells a stock photograph from
 * the owner's own upload.
 *
 * EXPORTED because lib/website-image-census.ts had its own copy. One
 * duplicated constant is how a change to it becomes a change to half the
 * places that depend on it — the same failure DAY_MS produced across six
 * modules, found the same week.
 */
export const UNSPLASH_CDN_PREFIX = "https://images.unsplash.com/";
const PROVENANCE_NAME_ATTR = "data-unsplash-photographer";
const PROVENANCE_PROFILE_ATTR = "data-unsplash-profile";

/** The inverse of escapeHtml, for reading an attribute value back out of
 *  a document. `&amp;` LAST on the way out, mirroring `&` first on the way
 *  in — otherwise "&amp;lt;" decodes to "<" instead of "&lt;". */
function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

const IMG_TAG = /<img\b[^>]*>/gi;
/** A credit span sitting immediately after an image — any whitespace
 *  between them, because a model that re-indents the document has not
 *  broken anything. */
const TRAILING_CREDIT = /^\s*<span\b[^>]*class="unsplash-credit"[^>]*>[\s\S]*?<\/span>/;

function attributeOf(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? unescapeHtml(m[1]) : null;
}

/** Writes the photographer onto the image tag, replacing any copy already
 *  there so the result is byte-identical whether it ran once or twice. */
function stampProvenance(tag: string, photo: ResolvedPhoto): string {
  const stripped = tag
    .replace(new RegExp(`\\s*${PROVENANCE_NAME_ATTR}="[^"]*"`, "g"), "")
    .replace(new RegExp(`\\s*${PROVENANCE_PROFILE_ATTR}="[^"]*"`, "g"), "");
  const attrs =
    ` ${PROVENANCE_NAME_ATTR}="${escapeHtml(photo.photographerName)}"` +
    ` ${PROVENANCE_PROFILE_ATTR}="${escapeHtml(photo.photographerUrl)}"`;
  // Self-closing and plain forms both occur in generated markup.
  const selfClosing = stripped.match(/\s*\/>$/);
  return selfClosing
    ? `${stripped.slice(0, stripped.length - selfClosing[0].length)}${attrs} />`
    : `${stripped.slice(0, -1)}${attrs}>`;
}

/** The photo an image tag can still account for, from its own attributes
 *  first and from the credit beside it as a fallback. */
function recoverPhoto(tag: string, trailingCredit: string): ResolvedPhoto | null {
  const src = tag.match(/\bsrc="([^"]*)"/)?.[1];
  if (!src) return null;

  const name = attributeOf(tag, PROVENANCE_NAME_ATTR);
  const profile = attributeOf(tag, PROVENANCE_PROFILE_ATTR);
  if (name && profile) return { url: src, photographerName: name, photographerUrl: profile };

  // No attributes: an older document, generated before they existed, or
  // one whose <img> the model rewrote. The credit beside it — if it is
  // still there — carries the same two facts, so read them back rather
  // than deleting a photo that is in fact properly credited.
  if (!trailingCredit) return null;
  const firstLink = trailingCredit.match(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
  if (!firstLink) return null;
  const recoveredName = unescapeHtml(firstLink[2].replace(/<[^>]*>/g, "")).trim();
  // Strip the referral parameters back off, so re-adding them cannot
  // double them up on a document that goes through here repeatedly.
  const recoveredProfile = unescapeHtml(firstLink[1])
    .replace(/([?&])utm_source=ionexa&utm_medium=referral/, "$1")
    .replace(/[?&]$/, "");
  if (!recoveredName || !recoveredProfile) return null;
  if (!/^https?:\/\/(www\.)?unsplash\.com\//i.test(recoveredProfile)) return null;
  return { url: src, photographerName: recoveredName, photographerUrl: recoveredProfile };
}

// ---------------------------------------------------------------------
// THE CREDIT THE PAGE'S OWN CSS CANNOT REACH.
// ---------------------------------------------------------------------
//
// The credit beside the photo is the right place for it and it is not a
// GUARANTEE, because whether it renders is decided by CSS a model wrote
// (see the note on CREDIT_STYLE). Two of the four layouts a model
// actually produces hide it completely, and one of those two is the hero
// pattern the generator deliberately asks for.
//
// So every document also gets ONE credits block as the last thing in
// <body>. It is outside every media container, so no `overflow:hidden`
// on a hero clips it and no absolutely-positioned image paints over it;
// it is the last child, so nothing that comes later can cover it in DOM
// order; and it carries its own high-contrast colours rather than
// inheriting whatever the page set.
//
// This is a normal way for a site to credit photographs — a small line at
// the foot of the page — and Unsplash's guidelines are satisfied by a
// visible "Photo by <name> on Unsplash" with both links carrying the
// referral parameters, which this is. The per-photo credit stays as well:
// when it renders it is better, and when it does not this is what a
// reviewer sees.
//
// One line per DISTINCT photographer, in the order they first appear:
// two photos by the same person is one credit, not two identical ones.
const CREDITS_BLOCK_STYLE =
  "display:block;position:relative;z-index:2147483647;margin:0;padding:10px 16px;" +
  "background:#f4f4f5;color:#3f3f46;border-top:1px solid #d4d4d8;" +
  "font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.7;" +
  "text-align:left;";
const CREDITS_LINK_STYLE = "color:#27272a;text-decoration:underline;";

/** The block, or "" when the document uses no Unsplash photos. */
export function buildPageCreditsBlock(photos: ResolvedPhoto[]): string {
  const seen = new Set<string>();
  const unique = photos.filter((photo) => {
    const key = `${photo.photographerName}\u0000${photo.photographerUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return "";

  const link = (href: string, text: string) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer" style="${CREDITS_LINK_STYLE}">${text}</a>`;
  const lines = unique.map(
    (photo) =>
      `<span style="display:block">Photo by ${link(
        escapeHtml(withUnsplashUtm(photo.photographerUrl)),
        escapeHtml(photo.photographerName)
      )} on ${link(escapeHtml(UNSPLASH_HOME_URL), "Unsplash")}</span>`
  );
  return `<div class="unsplash-page-credits" style="${CREDITS_BLOCK_STYLE}">${lines.join("")}</div>`;
}

const PAGE_CREDITS_BLOCK =
  /<div\b[^>]*class="unsplash-page-credits"[^>]*>[\s\S]*?<\/div>\s*/g;

/** Drops any block already present, so the rebuild is idempotent. */
function withoutPageCreditsBlock(html: string): string {
  return html.replace(PAGE_CREDITS_BLOCK, "");
}

/** Puts the block last inside <body>, or at the very end of a fragment
 *  that has no </body> (which is what the unit tests hand it). */
function withPageCreditsBlock(html: string, block: string): string {
  if (!block) return html;
  const close = html.lastIndexOf("</body>");
  if (close === -1) return `${html}${block}`;
  return `${html.slice(0, close)}${block}${html.slice(close)}`;
}

export type AttributionEnforcement = {
  html: string;
  /** Photos whose credit was rebuilt (including ones that were already
   *  correct but had drifted — a missing utm parameter counts). */
  restored: number;
  /** Photos removed because nothing in the document could name their
   *  photographer. */
  removed: number;
};

/**
 * Guarantees the invariant over a whole document, immediately before it
 * is stored: every image served from Unsplash's CDN carries a correct,
 * complete credit.
 *
 * Runs on the generate path as well as the edit path, not because
 * generation is suspect but because "the thing that stores a document
 * enforces this" is a rule with no exceptions to remember — the same
 * shape as makeGeneratedLinksSafe.
 *
 * TWO PLACES, because one of them is not reliable. The credit beside the
 * photo is rebuilt from the provenance, AND one page-level credits block
 * is placed last in <body> — see buildPageCreditsBlock for why the first
 * one alone was not enough (measured: it is invisible on two of the four
 * layouts a model actually writes, one of which the generator asks for by
 * name).
 *
 * IDEMPOTENT by construction: it strips any existing page block, rebuilds
 * each credit from the provenance rather than patching what it finds, and
 * appends exactly one block. Running it twice gives the same bytes as
 * running it once.
 */
export function enforceUnsplashAttribution(html: string): AttributionEnforcement {
  let restored = 0;
  let removed = 0;
  // Every photo that survives, in page order — the page-level credits
  // block is built from this at the end.
  const surviving: ResolvedPhoto[] = [];

  // Any block from a previous pass comes off first, so the one added
  // below is the only one and this stays idempotent. It also has to go
  // before the <img> walk, or the block's own markup would be scanned.
  html = withoutPageCreditsBlock(html);

  IMG_TAG.lastIndex = 0;
  let out = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_TAG.exec(html))) {
    const tag = match[0];
    const tagEnd = IMG_TAG.lastIndex;
    const src = tag.match(/\bsrc="([^"]*)"/)?.[1] ?? "";
    if (!src.startsWith(UNSPLASH_CDN_PREFIX)) continue;

    // Whatever credit is currently attached to this image, correct or
    // not — it is replaced wholesale rather than repaired in place.
    const existing = html.slice(tagEnd).match(TRAILING_CREDIT)?.[0] ?? "";
    const photo = recoverPhoto(tag, existing);

    out += html.slice(cursor, match.index);
    if (photo) {
      const rebuilt = `${stampProvenance(tag, photo)}${buildUnsplashCreditHtml(photo)}`;
      const wasAlreadyRight = rebuilt === `${tag}${existing}`;
      if (!wasAlreadyRight) restored += 1;
      surviving.push(photo);
      out += rebuilt;
    } else {
      // Nothing left to credit with: the image goes, and so does the
      // broken remnant of a credit beside it.
      removed += 1;
    }
    cursor = tagEnd + existing.length;
    IMG_TAG.lastIndex = cursor;
  }
  out += html.slice(cursor);

  return {
    html: withPageCreditsBlock(out, buildPageCreditsBlock(surviving)),
    restored,
    removed,
  };
}
