import "server-only";
import {
  findImagePlaceholders,
  applyResolvedImageUrls,
  broadenImageQuery,
  isLogoLikeQuery,
  isNonLatinQuery,
  stripPlaceholderImageTags,
} from "@/lib/website-image-placeholders";
import {
  searchUnsplashPhoto,
  triggerUnsplashDownload,
  isUnsplashConfigured,
  type UnsplashPhoto,
} from "@/lib/unsplash";
import {
  createUnsplashBudget,
  describeUnsplashHalt,
  type UnsplashHaltReason,
} from "@/lib/unsplash-budget";
import { logApiError } from "@/lib/log-error";

// Runs after generateWebsiteHtml/editWebsiteHtml (lib/website-builder.ts)
// returns — scans the output for the PLACEHOLDER:<slug> image convention
// (used when Claude wants a real photo but has no uploaded reference
// image to use) and resolves each one to an actual, working photo URL
// from Unsplash: real, legal, royalty-free photos matched to the
// requested subject. A no-op (returns the input unchanged) when the HTML
// contains no placeholders at all, which is the common case.
//
// A placeholder that CANNOT be resolved to a photo of its subject — no
// key configured, quota exhausted, or every search came back empty — is
// REMOVED, not substituted. It used to become a picsum.photos image
// seeded by the query: a live URL, but a photo of something else
// entirely, and on a business site a random photo presented as the
// business is worse than no photo. Fewer relevant images beat more
// random ones.
/**
 * What a resolution produced, and what still owes Unsplash a request.
 *
 * `used` is the list the caller must pass to registerUnsplashUses ONCE
 * the document is kept. It is deliberately not registered here — see the
 * note on registerUnsplashUses.
 */
export type ImageResolution = {
  html: string;
  /** Exactly the photos that reached the returned HTML. */
  used: UnsplashPhoto[];
  /** Set only if UNSPLASH refused (403/429/401). Passed on so the caller
   *  does not fire registrations that would be refused too. */
  halted: UnsplashHaltReason | null;
};

export async function resolveWebsiteImagePlaceholders(
  html: string,
  options: {
    /**
     * "none" when the owner asked for a page with no photographs.
     *
     * ENFORCED HERE, not asked for in the prompt. A prompt rule is a
     * strong prior and this is a promise: a single PLACEHOLDER slipping
     * through costs an Unsplash request against a shared hourly quota
     * and puts a photograph on a page whose owner said they did not want
     * one. The tags are removed and no request is made at all — which is
     * also the only version of this that a test can prove, because "the
     * model did not emit any" is not something code can check.
     */
    photoSource?: "own" | "stock" | "none";
  } = {}
): Promise<ImageResolution> {
  const all = findImagePlaceholders(html);
  if (all.length === 0) return { html, used: [], halted: null };

  if (options.photoSource === "none") {
    return {
      html: stripPlaceholderImageTags(html, all.map((p) => p.slug)),
      used: [],
      halted: null,
    };
  }

  // A placeholder asking for a LOGO never resolves to a stock photo — a
  // random mark presented as the business's identity is the reported bug.
  // The prompt already forbids emitting these; when one slips through,
  // the tag is removed entirely (the header still carries the text
  // wordmark the prompt requires).
  // A query in another script is treated exactly like a logo one: removed
  // rather than searched. The prompt requires English (website-builder.ts),
  // the library only searches English, and the logo test above is written
  // in English too — so a Greek "λογότυπο" placeholder would otherwise slip
  // past the logo guard and publish whatever the search happened to return
  // as the business's own mark. See isNonLatinQuery.
  const unsearchable = (p: { query: string }) => isLogoLikeQuery(p.query) || isNonLatinQuery(p.query);
  const logoLike = all.filter(unsearchable);
  const placeholders = all.filter((p) => !unsearchable(p));
  if (logoLike.length > 0) {
    html = stripPlaceholderImageTags(html, logoLike.map((p) => p.slug));
    logApiError(
      "website-image-resolver",
      new Error(
        `stripped ${logoLike.length} unsearchable placeholder(s): a logo-like query the prompt forbids, or one not written in Latin script`
      ),
      { queries: logoLike.map((p) => p.query).join(" | ").slice(0, 200) }
    );
  }
  if (placeholders.length === 0) return { html, used: [], halted: null };

  // Without a key there is nothing to search with, and no reason to
  // pretend otherwise: every placeholder is removed and the log says why.
  if (!isUnsplashConfigured()) {
    logApiError(
      "website-image-resolver",
      new Error(
        `UNSPLASH_ACCESS_KEY is not set — removed ${placeholders.length} photo placeholder(s) rather than filling them with unrelated images`
      ),
      { placeholders: placeholders.length }
    );
    return { html: stripPlaceholderImageTags(html, placeholders.map((p) => p.slug)), used: [], halted: null };
  }

  // ONE budget for the whole document, not one per photo.
  //
  // Every photo has broadenImageQuery's ladder — up to four searches —
  // so ten photos whose queries all miss is forty requests, and a free
  // Unsplash application allows fifty PER HOUR. Two such generations put
  // the account at zero, after which every search 403s. Sharing one
  // budget across the resolutions is what makes the breaker work: the
  // first photo to be told "you are out" stops the other nine from asking.
  const budget = createUnsplashBudget();
  // Now holds the whole photo, not just its URL: the attribution needs
  // the photographer, and the download trigger needs download_location.
  const resolved = new Map<string, UnsplashPhoto>();

  // BREADTH-FIRST across photos, not depth-first per photo. Depth-first
  // let one unlucky photo spend four requests broadening while the last
  // photos in the document arrived at an already-exhausted budget and got
  // nothing — the ceiling of 12 was being eaten by retries instead of
  // first attempts. Round 0 gives EVERY photo its most specific — most
  // relevant — query before any photo is allowed a second, broader try.
  const ladders = placeholders.map((p) => ({ slug: p.slug, attempts: broadenImageQuery(p.query) }));
  const maxRounds = ladders.reduce((max, l) => Math.max(max, l.attempts.length), 0);
  for (let round = 0; round < maxRounds && !budget.halted && !budget.ceilingReached; round++) {
    const contenders = ladders.filter((l) => !resolved.has(l.slug) && round < l.attempts.length);
    if (contenders.length === 0) break;
    await Promise.all(
      contenders.map(async ({ slug, attempts }) => {
        const photo = await searchUnsplashPhoto(attempts[round], budget);
        if (photo) resolved.set(slug, photo);
      })
    );
  }

  const unresolved = placeholders.filter((p) => !resolved.has(p.slug));

  // Said out loud, once, because the symptom on the page — fewer photos
  // than the design asked for — is identical for "quota exhausted" and
  // "the queries genuinely found nothing", and those need different
  // fixes from whoever reads the log.
  if (budget.halted) {
    logApiError("website-image-resolver", new Error(describeUnsplashHalt(budget.halted, budget.spent)), {
      placeholders: placeholders.length,
      removed: unresolved.length,
    });
  } else if (budget.ceilingReached) {
    // Reported through its own branch because it is no longer a halt
    // reason: reaching OUR ceiling says nothing about Unsplash, and the
    // flag that used to conflate the two silently cancelled every
    // mandatory download registration. See lib/unsplash-budget.ts.
    logApiError("website-image-resolver", new Error(describeUnsplashHalt("budget-exhausted", budget.spent)), {
      placeholders: placeholders.length,
      removed: unresolved.length,
    });
  } else if (unresolved.length > 0) {
    logApiError(
      "website-image-resolver",
      new Error(
        `${unresolved.length} of ${placeholders.length} photo(s) found nothing on Unsplash — their tags were removed rather than filled with unrelated images`
      ),
      { unsplashRequests: budget.spent }
    );
  }

  // NOTHING IS REGISTERED WITH UNSPLASH HERE. See registerUnsplashUses.
  let result = applyResolvedImageUrls(html, resolved);
  if (unresolved.length > 0) {
    result = stripPlaceholderImageTags(result, unresolved.map((p) => p.slug));
  }
  return { html: result, used: [...resolved.values()], halted: budget.halted };
}

/**
 * UNSPLASH API GUIDELINE 2 — register that a photo was actually USED.
 *
 * Called by the routes, AFTER the document has been stored, and that
 * placement is the whole point of this function existing separately.
 *
 * WHAT A "USE" IS. Unsplash asks for one request per photo an application
 * genuinely uses — that is how a photographer's download count reflects
 * reality. It is not a count of photos we searched for, nor of photos we
 * assembled into a candidate document.
 *
 * WHY IT CANNOT LIVE IN THE RESOLVER. The resolver runs long before
 * anyone knows whether the document survives. Both routes then send it
 * through an AI content-safety review, and both can throw it away:
 * api/websites/edit returns without writing anything and tells the owner
 * their site is unchanged, and api/websites/generate/process saves a
 * flagged generation whose preview is replaced by a warning panel with
 * publish and download disabled. Registering at resolution time counted
 * every one of those as a use — photos nobody ever saw, added to somebody
 * else's stats. Generation can also simply time out
 * (maxDuration 800) between resolving and storing, with the same result.
 *
 * PARALLEL, and that is now correct where it was not before. These used
 * to be fired sequentially because they shared the per-generation search
 * budget and racing them could overshoot its ceiling. They are no longer
 * charged against it — a registration is mandatory rather than
 * speculative, and self-limiting, since there is exactly one per photo
 * that already won a search. Sequential 4-second timeouts across six
 * photos is up to twenty-four seconds bolted onto a request the user is
 * watching (the edit route is not backgrounded); in parallel the worst
 * case is one timeout for the whole set.
 *
 * NEVER THROWS. A missed registration is worth logging and moving on, not
 * worth failing a customer's website over — the page is already stored
 * and already correctly attributed.
 */
export async function registerUnsplashUses(
  photos: UnsplashPhoto[],
  halted: UnsplashHaltReason | null = null
): Promise<{ attempted: number; registered: number }> {
  if (photos.length === 0) return { attempted: 0, registered: 0 };

  // Unsplash has already refused during this generation, so every
  // registration would be refused too. Firing them buys nothing but
  // latency on a request someone is waiting for — but it must be SAID,
  // because the photos shipped and their uses are genuinely unrecorded.
  if (halted) {
    logApiError(
      "website-image-resolver",
      new Error(
        `Unsplash was unavailable (${halted}) — ${photos.length} used photo(s) shipped without their use being registered. They are still attributed on the page.`
      ),
      { photos: photos.length }
    );
    return { attempted: 0, registered: 0 };
  }

  // A breaker but NO ceiling: one request per photo that already shipped
  // cannot run away, and capping it is exactly what used to leave photos
  // unregistered. The breaker still matters — once Unsplash says "you are
  // out", the rest of the batch buys nothing.
  const budget = createUnsplashBudget(photos.length);
  const results = await Promise.all(photos.map((photo) => triggerUnsplashDownload(photo, budget)));
  const registered = results.filter(Boolean).length;

  if (registered < photos.length) {
    // Said out loud because NOTHING on the page looks different: the
    // photos still appear and are still attributed. Only Unsplash's own
    // records are short, and a production-access review is exactly where
    // that gets noticed.
    logApiError(
      "website-image-resolver",
      new Error(
        `Unsplash download registration did not complete for ${photos.length - registered} of ${photos.length} used photo(s) — attribution is still rendered, but the use was not registered with Unsplash`
      ),
      { halted: budget.halted ?? "none", unsplashRequests: budget.spent }
    );
  }

  return { attempted: photos.length, registered };
}
