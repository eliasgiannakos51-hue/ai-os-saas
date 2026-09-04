/**
 * MAP EMBEDS AT A ZOOM THAT SHOWS THE BUILDING — V4.6.
 *
 * "It does not zoom in enough to show the exact spot." The prompt said a
 * Google Maps pin was fine and left the URL to the model, which writes
 * `https://www.google.com/maps?q=<address>&output=embed` — Google's
 * default zoom for that form is a district, not a door.
 *
 * Enforced here, on the markup, the way photoSource:"none" is: every
 * Google Maps iframe in the `?q=` form gets `z=17` (a building; 16 is a
 * block, 18 is a rooftop) unless it already asks for 16 or more, and
 * `output=embed` so it renders as a map rather than the full site. The
 * `q=` form draws the red marker at the query's own coordinates, which
 * is the "marker at the exact spot" half of the request.
 *
 * The `maps/embed?pb=...` form is a signed blob whose zoom cannot be
 * edited from outside; it is left alone and reported, so the count in
 * the notes says how many maps were not fixable rather than pretending.
 */

export const MAP_ZOOM = 17;
export const MIN_ACCEPTABLE_MAP_ZOOM = 16;

export type MapNormalisation = { html: string; normalised: number; untouched: number };

const GOOGLE_MAP_IFRAME = /<iframe\b([^>]*?)\bsrc="([^"]*(?:google\.com\/maps|maps\.google\.com)[^"]*)"([^>]*)>/gi;

/** Rewrite one embed URL, or return it unchanged when it cannot be. */
export function normaliseMapUrl(raw: string): { url: string; changed: boolean; fixable: boolean } {
  let url: URL;
  try {
    url = new URL(raw.replace(/&amp;/g, "&"));
  } catch {
    return { url: raw, changed: false, fixable: false };
  }
  const host = url.hostname.toLowerCase();
  if (host !== "www.google.com" && host !== "google.com" && host !== "maps.google.com") {
    return { url: raw, changed: false, fixable: false };
  }
  // The signed embed blob: zoom lives inside `pb`, opaque.
  if (url.pathname.includes("/maps/embed")) return { url: raw, changed: false, fixable: false };
  if (!url.searchParams.get("q")) return { url: raw, changed: false, fixable: false };

  let changed = false;
  const z = Number(url.searchParams.get("z"));
  if (!Number.isFinite(z) || z < MIN_ACCEPTABLE_MAP_ZOOM) {
    url.searchParams.set("z", String(MAP_ZOOM));
    changed = true;
  }
  if (url.searchParams.get("output") !== "embed") {
    url.searchParams.set("output", "embed");
    changed = true;
  }
  return { url: url.toString(), changed, fixable: true };
}

/** Every Google Maps iframe in the document, normalised. Idempotent. */
export function normaliseMapEmbeds(html: string): MapNormalisation {
  if (typeof html !== "string" || html.length === 0) return { html: html ?? "", normalised: 0, untouched: 0 };
  let normalised = 0;
  let untouched = 0;
  const out = html.replace(GOOGLE_MAP_IFRAME, (whole, before: string, src: string, after: string) => {
    const result = normaliseMapUrl(src);
    if (!result.fixable) {
      untouched++;
      return whole;
    }
    if (result.changed) normalised++;
    // Written back with & escaped, as the model wrote it; a bare & in an
    // attribute is tolerated by browsers but not by the strict-HTML gates.
    const escaped = result.url.replace(/&/g, "&amp;");
    return `<iframe${before}src="${escaped}"${after}>`;
  });
  return { html: out, normalised, untouched };
}
