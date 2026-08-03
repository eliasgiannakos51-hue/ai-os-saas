import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupportedReferenceImageMediaType, type ReferenceImage } from "@/lib/website-builder";
import { MAX_REFERENCE_IMAGE_BYTES, REFERENCE_IMAGE_BUCKET } from "@/lib/website-reference-image";
import { logApiError } from "@/lib/log-error";

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
    const resizedBuffer = await resizeReferenceImageIfNeeded(Buffer.from(arrayBuffer));
    const { data: publicUrlData } = supabase.storage.from(REFERENCE_IMAGE_BUCKET).getPublicUrl(path);
    return {
      base64: resizedBuffer.toString("base64"),
      mediaType: imageBlob.type,
      url: publicUrlData?.publicUrl,
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
