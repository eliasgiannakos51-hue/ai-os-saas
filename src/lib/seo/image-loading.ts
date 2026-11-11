
/**
 * THE FIRST IMAGE LOADS FIRST, THE REST WHEN THE READER GETS THERE.
 *
 * Why this exists (docs/market-round-2026-11-11.md, §3): a count of 93
 * public sites made by AI builders, on a phone, found the main content
 * taking a median 6.6 seconds to appear — by a studio that competes with
 * those builders, so the number is theirs. The cause they name is the
 * ordinary one: every image on a long page is requested at once, and the
 * one at the top waits in the same queue as the twelve nobody has
 * scrolled to.
 *
 * The browser already has the fix, as three attributes. A model asked to
 * write them forgets, so — like the alt text beside this file
 * (alt-text.ts) — they are put there by code, after the model is done:
 *
 *   the FIRST <img> in the document gets fetchpriority="high" and is
 *   never deferred: on these pages it is the hero, which is what the
 *   reader is waiting for;
 *
 *   EVERY LATER <img> gets loading="lazy";
 *
 *   EVERY <img> gets decoding="async".
 *
 * WHAT THE AUTHOR WROTE IS LEFT ALONE. An image that already says how it
 * loads keeps what it says, with one exception: loading="lazy" on the
 * first image is removed, because a deferred hero is exactly the defect.
 *
 * Nothing about how the page LOOKS changes, and running it twice changes
 * nothing the second time — publish runs it over documents generation
 * already ran it over.
 *
 * NOT DONE HERE: width and height (the sizes are not known without
 * fetching the image), and compression (the images are the photo
 * library's own URLs). Both would move the same number; neither is a
 * rewrite of three attributes.
 */

export type ImageLoadingResult = {
  html: string;
  /** Images given loading="lazy". */
  deferred: number;
  /** 1 when the first image was marked as the one to fetch first. */
  prioritised: number;
};

const IMG_TAG = /<img\b[^>]*>/gi;

/**
 * Does the tag carry this attribute — as an ATTRIBUTE? The values are
 * blanked first, so alt="a loading dock" is not mistaken for a loading
 * attribute and data-loading is not mistaken for loading.
 */
function hasAttr(tag: string, name: string): boolean {
  const bare = tag.replace(/"[^"]*"|'[^']*'/g, '""');
  return new RegExp(`[\\s"']${name}\\s*(=|[\\s/>])`, "i").test(bare);
}

function addAttr(tag: string, attribute: string): string {
  return tag.replace(/^<img\b/i, `<img ${attribute}`);
}

export function enforceImageLoading(html: string): ImageLoadingResult {
  let index = 0;
  let deferred = 0;
  let prioritised = 0;

  const out = html.replace(IMG_TAG, (original) => {
    let tag = original;
    const first = index === 0;
    index += 1;

    if (first) {
      tag = tag.replace(/\sloading\s*=\s*(?:"lazy"|'lazy'|lazy(?=[\s/>]))/i, "");
      if (!hasAttr(tag, "fetchpriority")) {
        tag = addAttr(tag, 'fetchpriority="high"');
        prioritised = 1;
      }
    } else if (!hasAttr(tag, "loading")) {
      tag = addAttr(tag, 'loading="lazy"');
      deferred += 1;
    }
    if (!hasAttr(tag, "decoding")) tag = addAttr(tag, 'decoding="async"');
    return tag;
  });

  return { html: out, deferred, prioritised };
}
