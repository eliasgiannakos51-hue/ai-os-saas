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

// Finds every <img> tag using the PLACEHOLDER:<slug> convention and pulls
// out its data-image-query text. An <img> using the convention but
// missing data-image-query is skipped — there's nothing sensible to
// search for, and its src is left as the literal text
// "PLACEHOLDER:<slug>", which browsers render as a broken-image icon
// rather than crashing anything; that's treated as a system-prompt-
// compliance edge case to catch via testing, not something to silently
// paper over here with an invented query.
export function findImagePlaceholders(html: string): ImagePlaceholder[] {
  const results: ImagePlaceholder[] = [];
  const seenSlugs = new Set<string>();
  let match: RegExpExecArray | null;
  IMG_TAG_WITH_PLACEHOLDER.lastIndex = 0;
  while ((match = IMG_TAG_WITH_PLACEHOLDER.exec(html))) {
    const [fullTag, slug] = match;
    if (seenSlugs.has(slug)) continue; // dedupe repeated slugs
    const queryMatch = fullTag.match(DATA_QUERY_ATTR);
    const query = queryMatch?.[1]?.trim();
    if (!query) continue;
    seenSlugs.add(slug);
    results.push({ slug, query });
  }
  return results;
}

// Deterministic picsum.photos fallback — seeded by the query text itself,
// so the SAME query always resolves to the SAME photo (stable across
// re-renders/re-downloads of the same generated site) without any
// external API call or key. picsum.photos is a real, live, working image
// service — never a fake/broken link, unlike a made-up CDN URL.
export function picsumFallbackUrl(query: string, width = 800, height = 600): string {
  const seed = encodeURIComponent(query.toLowerCase().trim().slice(0, 60)) || "placeholder";
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

// Replaces every PLACEHOLDER:<slug> occurrence with its resolved URL — a
// plain string replace per slug (not a regex re-scan of the whole
// document), so it can only ever touch the exact placeholder tokens
// found by findImagePlaceholders, never anything else in the HTML.
export function applyResolvedImageUrls(html: string, resolved: Map<string, string>): string {
  let result = html;
  for (const [slug, url] of resolved) {
    result = result.split(`PLACEHOLDER:${slug}`).join(url);
  }
  return result;
}
