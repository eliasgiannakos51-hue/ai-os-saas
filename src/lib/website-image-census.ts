import { REFERENCE_IMAGE_BUCKET } from "@/lib/website-reference-image";
import { UNSPLASH_CDN_PREFIX } from "@/lib/website-image-placeholders";

/**
 * WHOSE PHOTOGRAPHS ARE ON THIS PAGE.
 *
 * Read off the finished HTML rather than recorded during generation, and
 * that is deliberate: the count has to survive an edit, a regeneration, a
 * publish and a rollback, and anything recorded at generation time is a
 * number that slowly stops describing the document. The page is the only
 * thing that knows what is on the page.
 *
 * WHAT IT IS FOR. "I used five stock photographs — upload your own for a
 * more authentic result" is only honest if the five is real, and marking
 * which images are stock is only possible if we can tell them apart.
 * Unsplash has no photograph of THIS bakery; it has a bakery.
 *
 * Pure and dependency-light so it runs in the browser (the workspace
 * shows the nudge) and on the server (tests, and any future report).
 */

/** Re-exported so a caller counting images does not have to know which
 *  module owns the constant — the value itself has exactly one home. */
export { UNSPLASH_CDN_PREFIX } from "@/lib/website-image-placeholders";

export type SiteImageCensus = {
  /** Photographs from Unsplash — stand-ins for the real thing. */
  stock: number;
  /** The owner's own uploads, served from the reference bucket. */
  own: number;
  /**
   * Anything else with a src: an inline data: URI, an SVG the model drew,
   * a link to somewhere we do not recognise.
   *
   * COUNTED SEPARATELY rather than folded into either side, because both
   * of the sentences this feeds would be wrong about it. It is not a
   * stock photo to apologise for, and it is not the owner's photograph to
   * take credit for.
   */
  other: number;
  /** Every <img> on the page, however it is sourced. */
  total: number;
  /** The stock image URLs, so the UI can point at them rather than
   *  merely count them. */
  stockUrls: string[];
};

const ANY_IMG_TAG = /<img\b[^>]*>/gi;

export function censusSiteImages(html: string | null | undefined): SiteImageCensus {
  const census: SiteImageCensus = { stock: 0, own: 0, other: 0, total: 0, stockUrls: [] };
  if (typeof html !== "string" || !html) return census;

  // <style> and <script> can contain anything that looks like a tag.
  const prose = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");

  for (const tag of prose.match(ANY_IMG_TAG) ?? []) {
    const src =
      tag.match(/\bsrc\s*=\s*"([^"]*)"/i)?.[1] ??
      tag.match(/\bsrc\s*=\s*'([^']*)'/i)?.[1] ??
      "";
    census.total += 1;
    if (src.startsWith(UNSPLASH_CDN_PREFIX)) {
      census.stock += 1;
      census.stockUrls.push(src);
      continue;
    }
    // The owner's uploads are served from their own folder in the
    // reference bucket. Matched on the bucket segment rather than on the
    // whole origin, because the Supabase host differs per project and a
    // hardcoded one would silently count every upload as "other".
    if (src.includes(`/${REFERENCE_IMAGE_BUCKET}/`)) {
      census.own += 1;
      continue;
    }
    census.other += 1;
  }
  return census;
}

/**
 * Should we ask the owner for their own photographs?
 *
 * Only when there is something to ask about. A page with no stock photos
 * has nothing to improve, and a page that is already mostly the owner's
 * work does not need a nudge that reads as a complaint.
 */
export function shouldOfferOwnPhotos(census: SiteImageCensus): boolean {
  return census.stock > 0;
}
