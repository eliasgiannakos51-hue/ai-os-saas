import "server-only";
import {
  findImagePlaceholders,
  picsumFallbackUrl,
  applyResolvedImageUrls,
  broadenImageQuery,
} from "@/lib/website-image-placeholders";
import { searchUnsplashPhoto, isUnsplashConfigured } from "@/lib/unsplash";
import {
  createUnsplashBudget,
  describeUnsplashHalt,
  unsplashBudgetForPlaceholders,
} from "@/lib/unsplash-budget";
import { EMPTY_IMAGE_REPORT, type WebsiteImageReport } from "@/lib/website-image-brief";
import { logApiError } from "@/lib/log-error";

// Runs after generateWebsiteHtml/editWebsiteHtml (lib/website-builder.ts)
// returns — scans the output for the PLACEHOLDER:<slug> image convention
// (used when Claude wants a real photo but has no uploaded reference
// image to use) and resolves each one to an actual, working photo URL:
// Unsplash first (if UNSPLASH_ACCESS_KEY is configured — real, legal,
// royalty-free photos matched to the requested subject), picsum.photos
// otherwise (a real, working, seeded-by-query placeholder photo — never a
// fake/broken link). A no-op (returns the input unchanged) when the HTML
// contains no placeholders at all, which is the common case.
//
// IT NOW RETURNS A REPORT AS WELL AS THE HTML, and that is the more
// important half.
//
// The reported defect was not only "the photos are wrong" — it was that
// nothing said they were wrong. A generation that quietly substitutes a
// seeded placeholder for the photograph the brief asked for produces a page
// the owner publishes without noticing, because on screen a picsum photo
// looks like a photograph. The counts below are what makes "χρησιμοποιήθηκαν
// placeholders" something the interface can say out loud, in the user's own
// language, instead of something they have to discover.
export type ResolvedWebsiteImages = { html: string; report: WebsiteImageReport };

/**
 * How many photo searches may be in flight at once.
 *
 * Not unbounded, and the reason was found by running the resolver against a
 * rejected key: with everything launched at once through a single
 * Promise.all, twenty requests are already in flight before the first 401
 * comes back, so the circuit breaker has nothing left to break. It could
 * only ever protect the SECOND round. A page with a misconfigured key spent
 * one doomed request per photo, every time.
 *
 * Batching costs a little wall-clock on a photo-heavy page — five rounds
 * instead of one for twenty photos — and in exchange the breaker works
 * where it is most needed: a key that is wrong, or a quota that ran out
 * mid-generation, now costs at most one batch instead of one per photo.
 */
const SEARCH_CONCURRENCY = 4;

/**
 * Runs `task` over every item, at most SEARCH_CONCURRENCY at a time, and
 * stops starting new batches once `shouldStop` says the library has given
 * up on this generation.
 */
async function inBatches<T>(
  items: T[],
  shouldStop: () => boolean,
  task: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += SEARCH_CONCURRENCY) {
    if (shouldStop()) return;
    await Promise.all(items.slice(i, i + SEARCH_CONCURRENCY).map(task));
  }
}

export async function resolveWebsiteImagePlaceholders(
  html: string,
  options?: { requestedRealPhotos?: boolean }
): Promise<ResolvedWebsiteImages> {
  const configured = isUnsplashConfigured();
  const requestedRealPhotos = options?.requestedRealPhotos ?? false;
  const placeholders = findImagePlaceholders(html);
  if (placeholders.length === 0) {
    return { html, report: { ...EMPTY_IMAGE_REPORT, configured, requestedRealPhotos } };
  }

  // ONE budget for the whole document, not one per photo — the breaker only
  // works if the first photo told "you are out" can stop the other nine
  // asking. But it is no longer a FLAT budget: see
  // unsplashBudgetForPlaceholders for the measured starvation this fixes.
  const budget = createUnsplashBudget(unsplashBudgetForPlaceholders(placeholders.length));
  const resolved = new Map<string, string>();

  // ---------------------------------------------------------------
  // PHASE 1 — one search per photo, most specific query, guaranteed.
  //
  // Every photo asks the library exactly once before ANY photo is allowed a
  // second, broader attempt. Under the previous single-phase design a
  // photo's four-step ladder competed with every other photo's for one
  // shared pool, so on a portfolio page the later photos could reach picsum
  // without the library ever having been asked about them. Ordering the
  // work this way makes "no photo is skipped" a property of the control
  // flow rather than a probability.
  // ---------------------------------------------------------------
  const ladders = new Map<string, string[]>();
  for (const { slug, query } of placeholders) ladders.set(slug, broadenImageQuery(query));
  await inBatches(placeholders, () => Boolean(budget.halted), async ({ slug }) => {
    const ladder = ladders.get(slug) ?? [];
    if (ladder.length === 0) return;
    const url = await searchUnsplashPhoto(ladder[0], budget);
    if (url) resolved.set(slug, url);
  });

  // ---------------------------------------------------------------
  // PHASE 2 — broaden only what missed, out of what is left.
  //
  // A specific query that returns nothing ("handmade sourdough loaves
  // cooling rack bakery") is retried shorter rather than dropped straight to
  // picsum — that retry is what turns a near-miss into the right photo. It
  // is spent after every photo has had its turn, so it can never cost
  // another photo its only attempt.
  // ---------------------------------------------------------------
  const stillMissing = placeholders.filter(({ slug }) => !resolved.has(slug));
  await inBatches(stillMissing, () => Boolean(budget.halted), async ({ slug }) => {
    for (const attempt of (ladders.get(slug) ?? []).slice(1)) {
      if (budget.halted || !budget.canSpend()) break;
      const url = await searchUnsplashPhoto(attempt, budget);
      if (url) {
        resolved.set(slug, url);
        return;
      }
    }
  });

  // Whatever is still unresolved gets a real, working, seeded placeholder —
  // never a fake link, and never a silently dropped <img>.
  let fellBack = 0;
  for (const { slug, query } of placeholders) {
    if (resolved.has(slug)) continue;
    fellBack += 1;
    resolved.set(slug, picsumFallbackUrl(query));
  }

  // Said out loud, once, because the symptom on the page — generic photos
  // — is identical for "no key configured", "quota exhausted" and "the
  // queries genuinely found nothing", and those need three different
  // fixes from whoever reads the log.
  if (budget.halted) {
    logApiError("website-image-resolver", new Error(describeUnsplashHalt(budget.halted, budget.spent, budget.limit)), {
      placeholders: placeholders.length,
      fellBackToPicsum: fellBack,
      requestedRealPhotos,
    });
  } else if (fellBack > 0 && configured) {
    logApiError("website-image-resolver", new Error(`${fellBack} of ${placeholders.length} photo(s) found nothing on Unsplash and fell back to picsum.`), {
      unsplashRequests: budget.spent,
      requestedRealPhotos,
    });
  }

  return {
    html: applyResolvedImageUrls(html, resolved),
    report: {
      total: placeholders.length,
      fromLibrary: placeholders.length - fellBack,
      fromPlaceholder: fellBack,
      halted: budget.halted,
      configured,
      requestedRealPhotos,
    },
  };
}
