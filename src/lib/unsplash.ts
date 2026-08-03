import "server-only";

// Unsplash Search API — real, legal, royalty-free stock photos. This is
// the deliberate alternative to scraping/hotlinking Google Images (a
// copyright/ToS problem): Unsplash's API exists specifically to be used
// this way, with a free developer account. See the README/env example for
// exact setup instructions — this file no-ops entirely (never throws)
// when UNSPLASH_ACCESS_KEY isn't configured, so the feature degrades to
// the picsum.photos fallback (lib/website-image-placeholders.ts) rather
// than failing a generation.
const UNSPLASH_API_URL = "https://api.unsplash.com/search/photos";
const UNSPLASH_TIMEOUT_MS = 8000;

export function isUnsplashConfigured(): boolean {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY);
}

// Returns a real, hotlinkable photo URL for the given search query, or
// null if Unsplash isn't configured, the search came back empty, or the
// request failed/timed out for any reason — callers always have a non-
// throwing fallback path (picsumFallbackUrl) precisely because photo
// resolution should never be able to fail a whole website generation.
export async function searchUnsplashPhoto(query: string): Promise<string | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey || !query.trim()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UNSPLASH_TIMEOUT_MS);
  try {
    const url = `${UNSPLASH_API_URL}?query=${encodeURIComponent(query.trim().slice(0, 200))}&per_page=1&orientation=landscape&content_filter=high`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const results = (data as { results?: unknown })?.results;
    const first = Array.isArray(results) ? results[0] : null;
    const photoUrl = (first as { urls?: { regular?: unknown } } | null)?.urls?.regular;
    return typeof photoUrl === "string" ? photoUrl : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
