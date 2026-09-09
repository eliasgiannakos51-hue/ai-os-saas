import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchUnsplashPhoto, isUnsplashConfigured } from "@/lib/unsplash";
import { createUnsplashBudget } from "@/lib/unsplash-budget";
import { registerUnsplashUses } from "@/lib/website-image-resolver";
import { downloadAttachmentImages } from "@/lib/attachment-image-server";
import { logApiError } from "@/lib/log-error";
import { assignOwnImages, type Deck, type UnsplashSlideImage } from "@/lib/presentations/deck";

/**
 * PICTURES FOR A DECK — chosen at generation, fetched at export.
 *
 * Three sources, one rule each (see IMAGE_SOURCES in deck.ts). What this
 * file adds to the Website Builder's Unsplash handling is only the
 * choice of WHICH slides get a photo; everything about how a photo is
 * obtained, credited and registered is the builder's code, reused:
 *
 *   searchUnsplashPhoto   lib/unsplash.ts — returns a photo or null,
 *                         never throws, attribution fields required
 *   registerUnsplashUses  lib/website-image-resolver.ts — the download
 *                         trigger Unsplash requires per photo USED
 *   createUnsplashBudget  lib/unsplash-budget.ts — the per-generation
 *                         ceiling and the breaker
 *
 * ONE SEARCH PER SLIDE, NO BROADENING. The builder walks a four-step
 * ladder of shorter queries when the first misses, because a page with
 * a hole where the hero image was is worse than a page with a broader
 * photo. A slide is different: text-only is a perfectly good slide, and
 * the model was asked for concrete queries. So a miss is a miss, and a
 * deck spends at most MAX_UNSPLASH_PER_DECK requests on searches — under
 * the 12-per-generation ceiling with room for the registrations.
 *
 * THE VIEWER HOTLINKS, THE EXPORTS EMBED. In the browser the photo loads
 * from images.unsplash.com, exactly as on a generated site. A .pptx or a
 * PDF is a file the person keeps, so the bytes are fetched at export time
 * and written into it — that is the photo being downloaded for use in a
 * presentation, which the Unsplash licence allows and which is why the
 * use was registered when the photo was chosen. Nothing is ever copied
 * into this app's storage.
 */
export const MAX_UNSPLASH_PER_DECK = 8;

/** How long one image fetch may take before the export goes on without it. */
const IMAGE_FETCH_TIMEOUT_MS = 8_000;
/** The largest single image an export will embed. Unsplash's `regular`
 *  size is ~200-400 KB; an own upload is capped at 5 MB before resize. */
const MAX_EMBED_BYTES = 6 * 1024 * 1024;

export async function resolveUnsplashImages(deck: Deck): Promise<Deck> {
  if (!isUnsplashConfigured()) return { ...deck, imageSource: "unsplash" };
  const budget = createUnsplashBudget();
  const used: UnsplashSlideImage[] = [];
  const slides = [...deck.slides];
  let searched = 0;
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (!slide.imageQuery || searched >= MAX_UNSPLASH_PER_DECK) continue;
    searched++;
    const photo = await searchUnsplashPhoto(slide.imageQuery, budget);
    if (!photo) continue;
    const image: UnsplashSlideImage = { kind: "unsplash", ...photo };
    used.push(image);
    slides[i] = { ...slide, image };
  }
  // Registered ONCE, here, for the photos that reached the deck — the
  // same moment the builder registers a photo that reached a page.
  await registerUnsplashUses(used, budget.halted);
  return { ...deck, imageSource: "unsplash", slides };
}

export function resolveOwnImages(deck: Deck, paths: string[]): Deck {
  return assignOwnImages(deck, paths);
}

export type LoadedImage = { base64: string; mediaType: "image/jpeg" | "image/png" };

/**
 * The same photo, as a JPEG the exporters can embed.
 *
 * lib/unsplash.ts asks the CDN for WebP (`fm=webp`) because a generated
 * site is served to browsers. pptxgenjs and @react-pdf both embed JPEG or
 * PNG and neither decodes WebP, so the export asks the SAME URL for
 * `fm=jpg` — a format change on Unsplash's own CDN, not a re-host.
 */
export function asJpeg(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("fm", "jpg");
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchUnsplashBytes(url: string): Promise<LoadedImage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(asJpeg(url), { signal: controller.signal });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const mediaType = type.includes("png") ? "image/png" : type.includes("jpeg") || type.includes("jpg") ? "image/jpeg" : null;
    if (!mediaType) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_EMBED_BYTES) return null;
    return { base64: bytes.toString("base64"), mediaType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Every image an export needs, keyed by slide index.
 *
 * NEVER THROWS, and a slide whose image could not be fetched is exported
 * as text — the same rule as the builder's "fewer relevant images beat
 * more random ones": a deck missing one photo is still the deck, and a
 * download that fails because Unsplash was slow is not.
 *
 * Own uploads go through the caller's RLS-scoped storage client, so a
 * path outside the person's own folder downloads nothing.
 */
export async function loadDeckImages(
  deck: Deck,
  supabase: SupabaseClient,
  callerContext: string
): Promise<Map<number, LoadedImage>> {
  const out = new Map<number, LoadedImage>();
  await Promise.all(
    deck.slides.map(async (slide, index) => {
      if (!slide.image) return;
      try {
        if (slide.image.kind === "unsplash") {
          const loaded = await fetchUnsplashBytes(slide.image.url);
          if (loaded) out.set(index, loaded);
        } else {
          const [loaded] = await downloadAttachmentImages(supabase, [slide.image.path], callerContext);
          if (loaded) out.set(index, loaded);
        }
      } catch (err) {
        logApiError(callerContext, err, { stage: "deck_image", slide: index });
      }
    })
  );
  return out;
}
