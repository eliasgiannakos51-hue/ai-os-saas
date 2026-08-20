import "server-only";
import {
  findImagePlaceholders,
  applyResolvedImageUrls,
  broadenImageQuery,
  isLogoLikeQuery,
  stripPlaceholderImageTags,
} from "@/lib/website-image-placeholders";
import { searchUnsplashPhoto, isUnsplashConfigured } from "@/lib/unsplash";
import { createUnsplashBudget, describeUnsplashHalt } from "@/lib/unsplash-budget";
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
export async function resolveWebsiteImagePlaceholders(html: string): Promise<string> {
  const all = findImagePlaceholders(html);
  if (all.length === 0) return html;

  // A placeholder asking for a LOGO never resolves to a stock photo — a
  // random mark presented as the business's identity is the reported bug.
  // The prompt already forbids emitting these; when one slips through,
  // the tag is removed entirely (the header still carries the text
  // wordmark the prompt requires).
  const logoLike = all.filter((p) => isLogoLikeQuery(p.query));
  const placeholders = all.filter((p) => !isLogoLikeQuery(p.query));
  if (logoLike.length > 0) {
    html = stripPlaceholderImageTags(html, logoLike.map((p) => p.slug));
    logApiError(
      "website-image-resolver",
      new Error(`stripped ${logoLike.length} logo-like placeholder(s) the prompt forbids`),
      { queries: logoLike.map((p) => p.query).join(" | ").slice(0, 200) }
    );
  }
  if (placeholders.length === 0) return html;

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
    return stripPlaceholderImageTags(html, placeholders.map((p) => p.slug));
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
  const resolved = new Map<string, string>();

  // BREADTH-FIRST across photos, not depth-first per photo. Depth-first
  // let one unlucky photo spend four requests broadening while the last
  // photos in the document arrived at an already-exhausted budget and got
  // nothing — the ceiling of 12 was being eaten by retries instead of
  // first attempts. Round 0 gives EVERY photo its most specific — most
  // relevant — query before any photo is allowed a second, broader try.
  const ladders = placeholders.map((p) => ({ slug: p.slug, attempts: broadenImageQuery(p.query) }));
  const maxRounds = ladders.reduce((max, l) => Math.max(max, l.attempts.length), 0);
  for (let round = 0; round < maxRounds && !budget.halted; round++) {
    const contenders = ladders.filter((l) => !resolved.has(l.slug) && round < l.attempts.length);
    if (contenders.length === 0) break;
    await Promise.all(
      contenders.map(async ({ slug, attempts }) => {
        const unsplashUrl = await searchUnsplashPhoto(attempts[round], budget);
        if (unsplashUrl) resolved.set(slug, unsplashUrl);
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
  } else if (unresolved.length > 0) {
    logApiError(
      "website-image-resolver",
      new Error(
        `${unresolved.length} of ${placeholders.length} photo(s) found nothing on Unsplash — their tags were removed rather than filled with unrelated images`
      ),
      { unsplashRequests: budget.spent }
    );
  }

  let result = applyResolvedImageUrls(html, resolved);
  if (unresolved.length > 0) {
    result = stripPlaceholderImageTags(result, unresolved.map((p) => p.slug));
  }
  return result;
}
