import "server-only";
import { classifyUnsplashResponse, type UnsplashBudget } from "@/lib/unsplash-budget";

// Unsplash Search API — real, legal, royalty-free stock photos. This is
// the deliberate alternative to scraping/hotlinking Google Images (a
// copyright/ToS problem): Unsplash's API exists specifically to be used
// this way, with a free developer account. See the README/env example for
// exact setup instructions — this file no-ops entirely (never throws)
// when UNSPLASH_ACCESS_KEY isn't configured: the resolver then removes
// the photo placeholders (lib/website-image-resolver.ts) rather than
// failing a generation or inventing unrelated images.
//
// THE API GUIDELINES ARE NOT OPTIONAL, and two of the three were missing.
// Unsplash grants production access (50 -> 5000 requests/hour) only to
// applications that:
//
//   1. HOTLINK. Photos load from Unsplash's own CDN, never copied into
//      our storage. Already true: `urls.regular` goes straight into the
//      generated <img src>, and nothing in this app ever fetches the
//      bytes. (Do not "optimise" this by caching the image — it is a
//      compliance requirement, not an oversight.)
//   2. TRIGGER A DOWNLOAD when a photo is actually used. This is how
//      photographers get credited with a use in Unsplash's own stats. It
//      was never called: this module used to discard everything except
//      the URL string, so `links.download_location` never left the
//      response. triggerUnsplashDownload below is that call.
//   3. ATTRIBUTE — "Photo by <name> on Unsplash", both links carrying
//      utm_source/utm_medium. Also impossible before: `user.name` and
//      `user.links.html` were discarded in the same place. They are now
//      carried through to lib/website-image-placeholders.ts, which
//      renders the credit into the page.
//
// So the return type is a photo, not a URL. That change is the fix for
// (2) and (3) at once — the data simply was not reaching the code that
// needed it.
const UNSPLASH_API_URL = "https://api.unsplash.com/search/photos";
const UNSPLASH_TIMEOUT_MS = 8000;
// The download trigger is fire-and-forget from the page's point of view,
// but it must not hold a generation open if Unsplash is slow.
const UNSPLASH_DOWNLOAD_TIMEOUT_MS = 4000;

/**
 * One usable photo: the hotlink URL plus everything the attribution
 * needs.
 *
 * Every field is REQUIRED, and that is deliberate. A photo we cannot
 * attribute is a photo we are not allowed to display, so a response
 * missing the photographer is treated exactly like a search that found
 * nothing — the placeholder is removed rather than filled with an
 * uncreditable image. Making these optional would let a
 * silently-uncredited photo onto a customer's published site, which is
 * the failure this whole change exists to prevent.
 */
export type UnsplashPhoto = {
  /** `urls.regular` — served from Unsplash's CDN, never re-hosted. */
  url: string;
  /** `user.name` — the photographer's display name. */
  photographerName: string;
  /** `user.links.html` — their Unsplash profile. */
  photographerUrl: string;
  /** `links.download_location` — an API endpoint, NOT the image file.
   *  GETting it is what registers the use. */
  downloadLocation: string;
};

export function isUnsplashConfigured(): boolean {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Pulls a usable photo out of one search result.
 *
 * Exported for the build gate: the field names below are the only part of
 * this file that depends on Unsplash's response shape, and a rename there
 * would silently return null for every photo — every site would simply
 * stop having images, with no error anywhere. A test that can build a
 * response and assert this function reads it is the cheapest way to keep
 * that visible.
 */
/**
 * The same photo, asked for as WebP.
 *
 * `urls.regular` already carries Unsplash's dynamic image parameters —
 * `w`, `q`, `fit`, and `fm=jpg`. Their CDN honours `fm=webp` on the same
 * URL, so this is a format change, NOT a re-host: the bytes still come
 * from images.unsplash.com and nothing here fetches them. The hotlink
 * requirement at the top of this file is untouched, which is why the
 * parameter is rewritten rather than the image proxied.
 *
 * WHY BOTHER. WebP is roughly 25-35% smaller than the JPEG at the same
 * quality, and a generated site is mostly photographs — this is the
 * cheapest weight this product can shed, on the pages a customer's own
 * visitors load.
 *
 * SET, NOT APPENDED. `urls.regular` already contains `fm=jpg`; adding a
 * second `fm` would leave the CDN to pick, and which one it picks is not
 * something to find out from a bill or a bug report. A URL that does not
 * parse is returned untouched — an unoptimised photo is a far better
 * outcome than no photo.
 */
export function asWebp(url: string | null): string | null {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("fm", "webp");
    return u.toString();
  } catch {
    return url;
  }
}

export function photoFromSearchResult(first: unknown): UnsplashPhoto | null {
  const raw = first as
    | {
        urls?: { regular?: unknown };
        user?: { name?: unknown; links?: { html?: unknown } };
        links?: { download_location?: unknown };
      }
    | null
    | undefined;
  const url = asWebp(nonEmptyString(raw?.urls?.regular));
  const photographerName = nonEmptyString(raw?.user?.name);
  const photographerUrl = nonEmptyString(raw?.user?.links?.html);
  const downloadLocation = nonEmptyString(raw?.links?.download_location);
  // All-or-nothing: see the note on UnsplashPhoto.
  if (!url || !photographerName || !photographerUrl || !downloadLocation) return null;
  return { url, photographerName, photographerUrl, downloadLocation };
}

// Returns a real, hotlinkable photo for the given search query, or null if
// Unsplash isn't configured, the search came back empty, the result could
// not be attributed, or the request failed/timed out for any reason — a
// null never throws and the caller removes the placeholder, precisely
// because photo resolution should never be able to fail a whole website
// generation.
export async function searchUnsplashPhoto(
  query: string,
  budget?: UnsplashBudget
): Promise<UnsplashPhoto | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey || !query.trim()) return null;
  // Asking again after the account has been told "you are out" spends
  // latency to receive the same 403. See lib/unsplash-budget.ts.
  if (budget && !budget.canSpend()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UNSPLASH_TIMEOUT_MS);
  try {
    const url = `${UNSPLASH_API_URL}?query=${encodeURIComponent(query.trim().slice(0, 200))}&per_page=1&orientation=landscape&content_filter=high`;
    budget?.spend();
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      // A quota or credential failure is fatal for the whole generation;
      // a 404 or a 5xx is one bad query and the next photo still gets a
      // turn. Telling them apart is the difference between one wasted
      // request and forty.
      const fatal = classifyUnsplashResponse(res.status, res.headers);
      if (fatal && budget) budget.halt(fatal);
      return null;
    }
    const data: unknown = await res.json();
    const results = (data as { results?: unknown })?.results;
    const first = Array.isArray(results) ? results[0] : null;
    return photoFromSearchResult(first);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Registers that a photo was actually used — Unsplash API guideline (2).
 *
 * This hits `links.download_location`, which is an ENDPOINT, not the
 * image file: it downloads nothing, costs no bandwidth, and exists so a
 * photographer's download count reflects real use. Unsplash requires it
 * of every production application, and it is the requirement most often
 * missed because nothing visibly breaks without it.
 *
 * Called ONLY for photos that survive into the final HTML — not for every
 * search result. A photo that lost to a broader query, or whose
 * placeholder was stripped, was never displayed and must not be counted.
 *
 * OBEYS THE BREAKER BUT NOT THE CEILING, and the distinction is the
 * whole reason this reads differently from searchUnsplashPhoto.
 *
 * The per-generation ceiling exists to stop SPECULATIVE spend: each photo
 * may walk up to four broadening searches, so ten photos can fire forty
 * requests and eat a demo account's whole hour. A download trigger is not
 * speculative. It is mandatory for every photo that ships, and it is
 * self-limiting — there is exactly one per photo that already won a
 * search, so it can never exceed the number of successful searches.
 *
 * Charging it against the same ceiling would mean a six-photo site spends
 * its twelve requests on six searches and six credits, and a site whose
 * queries needed broadening would silently ship UNCREDITED photos — a
 * compliance failure caused by a budget meant for something else. So the
 * ceiling is bypassed and the count is still recorded (budget.spent stays
 * truthful for the log).
 *
 * The BREAKER is still honoured: once Unsplash has said "you are out" or
 * "your key is wrong", every further request returns the same error, and
 * firing ten more of them buys nothing but latency.
 *
 * Never throws and never blocks a generation — a missed credit is worth
 * logging and moving on, not worth failing a customer's website over.
 */
export async function triggerUnsplashDownload(
  photo: UnsplashPhoto,
  budget?: UnsplashBudget
): Promise<boolean> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return false;
  if (budget?.halted) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UNSPLASH_DOWNLOAD_TIMEOUT_MS);
  try {
    budget?.spend();
    const res = await fetch(photo.downloadLocation, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const fatal = classifyUnsplashResponse(res.status, res.headers);
      if (fatal && budget) budget.halt(fatal);
      return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
