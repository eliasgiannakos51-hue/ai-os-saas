import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupportedReferenceImageMediaType, type ReferenceImage } from "@/lib/website-builder";
import { MAX_REFERENCE_IMAGE_BYTES, REFERENCE_IMAGE_BUCKET } from "@/lib/website-reference-image";
import { logApiError } from "@/lib/log-error";
import { WEB_IMAGE_SUFFIX } from "@/lib/websites/web-image-suffix";

// Shared server-side reference-image download/resize logic — originally
// lived only in api/websites/generate/process/route.ts; extracted here so
// api/websites/edit/route.ts (post-generation editing with newly attached
// reference images) can reuse the exact same download, size/type
// validation, resize, and public-URL-resolution behavior instead of a
// second, subtly-different copy.

// Claude's vision input internally downsamples any image above roughly
// this size before analyzing it (Anthropic docs: ~1.15 megapixels, i.e.
// long-edge around 1568px for a typical aspect ratio) — sending a full
// multi-thousand-pixel phone photo doesn't improve style/color analysis
// quality beyond that point, it only adds base64-encoding size, network
// transfer time, and vision-input processing time.
const REFERENCE_IMAGE_MAX_DIMENSION = 1568;

/**
 * The size the PUBLISHED PAGE serves, which is a different question from
 * the size the model reads.
 *
 * THE GAP THIS CLOSES. The resize above shrinks the copy sent to Claude
 * and nothing else — the file a visitor downloads is the original upload,
 * up to 5MB of phone photograph, embedded in a customer's live site.
 * Every visitor pays for it on every view, and the owner never sees it
 * because their own browser cached it the moment they uploaded.
 *
 * 1600px on the long edge is a full-bleed hero on a 2x display and is
 * generous for anything smaller. WebP at quality 82 is visually
 * indistinguishable from the JPEG it replaces at a fraction of the bytes.
 */
export const WEB_IMAGE_MAX_DIMENSION = 1600;
export const WEB_IMAGE_QUALITY = 82;
/** Re-exported from its own module so the pure orphan-cleanup logic can
 *  use it without importing sharp. Deterministic, so a re-generation
 *  reuses the derivative already stored instead of writing another. */
export { WEB_IMAGE_SUFFIX } from "@/lib/websites/web-image-suffix";

/**
 * A WebP derivative sized for the web, or null if it would not be an
 * improvement.
 *
 * RETURNS NULL RATHER THAN A BIGGER FILE. WebP is not smaller for every
 * input — a small, already-optimised PNG of flat colour can come out
 * larger — and swapping in a derivative that costs the visitor MORE is
 * the opposite of the point. The comparison is measured per image, not
 * assumed.
 */
export async function optimiseForWeb(buffer: Buffer): Promise<Buffer | null> {
  try {
    const out = await sharp(buffer)
      .resize({
        width: WEB_IMAGE_MAX_DIMENSION,
        height: WEB_IMAGE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEB_IMAGE_QUALITY })
      .toBuffer();
    return out.length < buffer.length ? out : null;
  } catch (err) {
    // A corrupt or unusual file degrades to the original, which still
    // works. It must never take the generation down.
    logApiError("website-reference-image-server", err, { stage: "web_image_optimise" });
    return null;
  }
}

/** `<path>.web.webp` — beside the original, in the same user folder, so
 *  the storage RLS policy that scopes the folder covers it unchanged. */
export function webDerivativePath(path: string): string {
  return `${path}${WEB_IMAGE_SUFFIX}`;
}

// Resizes only if the image is actually larger than the target — never
// upscales a smaller image (withoutEnlargement), and any resize failure
// (corrupt file, unsupported edge case) falls back to the original,
// unresized buffer rather than dropping the image entirely.
async function resizeReferenceImageIfNeeded(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .resize({
        width: REFERENCE_IMAGE_MAX_DIMENSION,
        height: REFERENCE_IMAGE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();
  } catch (err) {
    logApiError("website-reference-image-server", err, { stage: "reference_image_resize" });
    return buffer;
  }
}

/**
 * Anonymous HEAD against the public URL. Deliberately NOT using the
 * authenticated client: the question is whether a stranger loading the
 * generated website can fetch this image, not whether we can.
 *
 * Best-effort — a network hiccup here must not fail the generation, so a
 * thrown request is treated as "not reachable" and the image degrades to
 * vision-only style input.
 */
async function isPubliclyFetchable(url: string, callerContext: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!response.ok) {
      logApiError(
        callerContext,
        `reference image URL is not publicly fetchable (HTTP ${response.status}) — the "${REFERENCE_IMAGE_BUCKET}" bucket is probably still private; generated sites will show broken images until it is public`,
        { stage: "reference_image_public_url", status: response.status }
      );
    }
    return response.ok;
  } catch (err) {
    logApiError(callerContext, err, { stage: "reference_image_public_url" });
    return false;
  }
}

// Downloads one reference image via the given (request-scoped) client —
// Storage's RLS policies (supabase_schema.sql) already confirm this path
// belongs to the caller before anything is read. Returns null on any
// problem rather than throwing — one bad image among several should never
// take down the others or the generation/edit itself. The returned `url`
// is the bucket's real, public, permanent URL (see supabase_schema.sql —
// "website-references" is a public bucket specifically so generated HTML
// can embed it directly and it keeps working once downloaded/hosted
// elsewhere).
export async function downloadReferenceImage(
  supabase: SupabaseClient,
  path: string,
  callerContext: string
): Promise<ReferenceImage | null> {
  try {
    const { data: imageBlob, error: downloadError } = await supabase.storage
      .from(REFERENCE_IMAGE_BUCKET)
      .download(path);

    if (downloadError || !imageBlob) {
      logApiError(callerContext, downloadError, { stage: "reference_image_download" });
      return null;
    }
    if (imageBlob.size > MAX_REFERENCE_IMAGE_BYTES) {
      logApiError(callerContext, "reference image exceeds size limit after upload", {
        stage: "reference_image_size",
      });
      return null;
    }
    if (!isSupportedReferenceImageMediaType(imageBlob.type)) {
      logApiError(callerContext, `unsupported reference image type: ${imageBlob.type}`, {
        stage: "reference_image_type",
      });
      return null;
    }

    const arrayBuffer = await imageBlob.arrayBuffer();
    const original = Buffer.from(arrayBuffer);
    const resizedBuffer = await resizeReferenceImageIfNeeded(original);

    // THE URL THE PAGE EMBEDS IS THE OPTIMISED ONE, when there is one.
    //
    // Written here rather than at upload time on purpose: the upload goes
    // straight from the browser to Storage, so a server-side optimisation
    // there would mean routing every file through us. This path already
    // has the bytes in memory for the model, and the derivative is
    // deterministic — a regeneration finds the one already stored instead
    // of writing another.
    //
    // Best-effort throughout. Every failure falls back to the original
    // URL, which is what shipped before this existed.
    let servedPath = path;
    const optimised = await optimiseForWeb(original);
    if (optimised) {
      const derivative = webDerivativePath(path);
      const { error: uploadError } = await supabase.storage
        .from(REFERENCE_IMAGE_BUCKET)
        .upload(derivative, optimised, { contentType: "image/webp", upsert: true });
      if (uploadError) {
        logApiError(callerContext, uploadError, { stage: "web_image_upload" });
      } else {
        servedPath = derivative;
      }
    }

    const { data: publicUrlData } = supabase.storage
      .from(REFERENCE_IMAGE_BUCKET)
      .getPublicUrl(servedPath);
    const url = publicUrlData?.publicUrl;

    // getPublicUrl() is a pure string builder — it returns a
    // /object/public/ URL whether or not the bucket is actually public,
    // and never errors. That is how this shipped broken: the bucket was
    // created with public=false, every generated site embedded a URL that
    // answers 400, and nothing anywhere reported a problem. The HTML was
    // right; the images just never loaded.
    //
    // One HEAD request per image confirms the URL is genuinely fetchable
    // by an anonymous client — the same way a visitor to the generated
    // site will fetch it. An unreachable URL is dropped rather than
    // handed to the model, so the model falls back to the PLACEHOLDER
    // convention (which resolves to a real working photo) instead of
    // emitting a link that renders as a broken image.
    const reachable = url ? await isPubliclyFetchable(url, callerContext) : false;

    return {
      base64: resizedBuffer.toString("base64"),
      mediaType: imageBlob.type,
      url: reachable ? url : undefined,
    };
  } catch (err) {
    logApiError(callerContext, err, { stage: "reference_image_download" });
    return null;
  }
}

// Downloads every path in parallel — each independently best-effort (see
// downloadReferenceImage above), so one bad image never blocks the
// others. Returns only the successfully-downloaded images, in the same
// relative order they were given.
export async function downloadReferenceImages(
  supabase: SupabaseClient,
  paths: string[],
  callerContext: string
): Promise<ReferenceImage[]> {
  const downloaded = await Promise.all(paths.map((path) => downloadReferenceImage(supabase, path, callerContext)));
  return downloaded.filter((image): image is ReferenceImage => image !== null);
}
