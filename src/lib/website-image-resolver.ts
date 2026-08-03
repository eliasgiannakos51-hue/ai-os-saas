import "server-only";
import { findImagePlaceholders, picsumFallbackUrl, applyResolvedImageUrls } from "@/lib/website-image-placeholders";
import { searchUnsplashPhoto } from "@/lib/unsplash";

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
  const placeholders = findImagePlaceholders(html);
  if (placeholders.length === 0) return html;

  const resolved = new Map<string, string>();
  await Promise.all(
    placeholders.map(async ({ slug, query }) => {
      const unsplashUrl = await searchUnsplashPhoto(query);
      resolved.set(slug, unsplashUrl ?? picsumFallbackUrl(query));
    })
  );
  return applyResolvedImageUrls(html, resolved);
}
