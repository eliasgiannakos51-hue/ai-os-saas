import "server-only";
import { imageSize, type PptxImage } from "@/lib/presentations/pptx";
import { layoutUsesImage, type Slide } from "@/lib/presentations/slides";

/**
 * Download a deck's photos so the PPTX writer can embed them.
 *
 * THE HOST ALLOWLIST IS THE POINT OF THIS FILE. Everything else here is
 * plumbing.
 *
 * Exporting is the one place in this feature where the SERVER fetches a
 * URL that is stored in a user-controlled row. `slides[].imageUrl` is
 * normalised to https on the way in, which stops `file://` and
 * `http://169.254.169.254/…`, and stops nothing else: an authenticated
 * user can PATCH their own deck with any https URL they like and then
 * press Export, and the server will fetch it from inside our network.
 * That is server-side request forgery with a save button in front of it.
 *
 * So the export fetches from Unsplash and nowhere else. That is not a
 * restriction on the feature — Unsplash is the only place these URLs
 * ever come from (lib/unsplash.ts is what writes them) — which is
 * exactly what makes an allowlist the right shape here rather than a
 * blocklist of internal ranges. A blocklist has to anticipate every
 * private range, every redirect, and every DNS name that resolves into
 * one; this has to know one hostname.
 *
 * Everything else is best-effort: a photo that does not download, is too
 * large, or is not a real JPEG/PNG is simply left out, and the slide
 * exports without it.
 */

const ALLOWED_IMAGE_HOSTS = new Set(["images.unsplash.com", "plus.unsplash.com"]);

/** Per image. Unsplash's `regular` size is ~1080px wide and lands well
 *  under this; anything far above it is not the image we asked for. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Per deck, so one export cannot pull 30 photos through a serverless
 *  function on a request that has to answer within maxDuration. */
const MAX_IMAGES_PER_EXPORT = 12;

const FETCH_TIMEOUT_MS = 8000;

export function isAllowedImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

async function fetchImage(url: string): Promise<{ data: Buffer; width: number; height: number; ext: "jpeg" | "png" } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // `manual` rather than the default `follow`: a redirect is how an
      // allowlisted host would be used to reach one that is not, and the
      // allowlist above is only meaningful if it applies to the address
      // actually fetched. Unsplash serves these directly, so a redirect
      // here means something has changed and the right answer is to stop.
      redirect: "manual",
    });
    if (!response.ok) return null;

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    // Checked again after reading: content-length is a claim, and a
    // response with no such header would otherwise be unbounded.
    if (buffer.length > MAX_IMAGE_BYTES) return null;

    // The TYPE comes from the bytes, never from the Content-Type header
    // — same rule the file upload route follows. imageSize returns null
    // for anything it does not positively recognise as PNG or JPEG, so
    // a mislabelled or corrupt file is dropped rather than embedded into
    // a .pptx that then will not open.
    const size = imageSize(buffer);
    if (!size) return null;

    return { data: buffer, width: size.width, height: size.height, ext: size.type };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDeckImages(slides: Slide[]): Promise<PptxImage[]> {
  const out: PptxImage[] = [];

  for (let i = 0; i < slides.length; i++) {
    if (out.length >= MAX_IMAGES_PER_EXPORT) break;

    const slide = slides[i];
    if (!layoutUsesImage(slide.layout) || !slide.imageUrl) continue;
    if (!isAllowedImageUrl(slide.imageUrl)) continue;

    const image = await fetchImage(slide.imageUrl);
    if (!image) continue;

    out.push({ slideIndex: i, ...image });
  }

  return out;
}
