import "server-only";
import {
  findImagePlaceholders,
  picsumFallbackUrl,
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
// image to use) and resolves each one to an actual, working photo URL:
// Unsplash first (if UNSPLASH_ACCESS_KEY is configured — real, legal,
// royalty-free photos matched to the requested subject), picsum.photos
// otherwise (a real, working, seeded-by-query placeholder photo — never a
// fake/broken link). A no-op (returns the input unchanged) when the HTML
// contains no placeholders at all, which is the common case.
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

  // ONE budget for the whole document, not one per photo.
  //
  // Every photo walks broadenImageQuery's ladder — up to four searches —
  // so ten photos whose queries all miss is forty requests, and a free
  // Unsplash application allows fifty PER HOUR. Two such generations put
  // the account at zero, after which every search 403s and every photo
  // silently becomes an unrelated picsum image. That looks exactly like
  // "Unsplash was never wired up", which is how it was reported.
  //
  // Sharing one budget across the parallel resolutions is what makes the
  // breaker work: the first photo to be told "you are out" stops the other
  // nine from asking.
  const budget = createUnsplashBudget();
  const resolved = new Map<string, string>();
  let fellBack = 0;

  await Promise.all(
    placeholders.map(async ({ slug, query }) => {
      // Most specific first, broadening only on an empty result — see
      // broadenImageQuery. A specific query that HITS is never widened, so
      // this costs one request in the common case and only spends more
      // round trips on the queries that would otherwise have produced an
      // unrelated photo.
      for (const attempt of broadenImageQuery(query)) {
        const unsplashUrl = await searchUnsplashPhoto(attempt, budget);
        if (unsplashUrl) {
          resolved.set(slug, unsplashUrl);
          return;
        }
        if (budget.halted) break;
      }
      fellBack += 1;
      resolved.set(slug, picsumFallbackUrl(query));
    })
  );

  // Said out loud, once, because the symptom on the page — generic photos
  // — is identical for "no key configured", "quota exhausted" and "the
  // queries genuinely found nothing", and those need three different
  // fixes from whoever reads the log.
  if (budget.halted) {
    logApiError("website-image-resolver", new Error(describeUnsplashHalt(budget.halted, budget.spent)), {
      placeholders: placeholders.length,
      fellBackToPicsum: fellBack,
    });
  } else if (fellBack > 0 && isUnsplashConfigured()) {
    logApiError(
      "website-image-resolver",
      new Error(`${fellBack} of ${placeholders.length} photo(s) found nothing on Unsplash and fell back to picsum.`),
      { unsplashRequests: budget.spent }
    );
  }

  return applyResolvedImageUrls(html, resolved);
}
