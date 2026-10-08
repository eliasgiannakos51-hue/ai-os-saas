import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CREATE_ATTACHMENT_BUCKET, MAX_ATTACHMENT_IMAGE_BYTES } from "@/lib/create-attachment-image";
import type { PostPlatform } from "@/lib/posts/platforms";
import { POST_IMAGE_SIZES, unsplashAtSize, type PostImage } from "@/lib/posts/post-images";

/**
 * A POST'S PICTURE, CUT TO ITS PLATFORM (package 15): exactly
 * POST_IMAGE_SIZES' pixels, the part of the picture that matters kept in
 * frame (sharp's attention strategy — the busiest, most saturated region,
 * which is where a face or a product usually is), turned upright by its
 * own EXIF, as a JPEG.
 *
 * The person's own photo is read with the caller's own storage client, so
 * a path outside their folder downloads nothing; an Unsplash photo is
 * fetched already cut by Unsplash's CDN, and cut again here only to the
 * exact pixels. Read by api/posts/[id]/image; held by
 * scripts/tests/posts-images.test.mjs, which cuts a real picture.
 */
const FETCH_TIMEOUT_MS = 8_000;
/** The largest source this will read: a phone photo, with room. */
const MAX_SOURCE_BYTES = Math.max(MAX_ATTACHMENT_IMAGE_BYTES, 12 * 1024 * 1024);
const SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function cutForPlatform(source: Buffer, platform: PostPlatform): Promise<Buffer> {
  const { width, height } = POST_IMAGE_SIZES[platform];
  return sharp(source)
    .rotate()
    .resize({ width, height, fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

/** The picture's bytes before the cut, or null when it cannot be read. */
export async function loadPostSource(supabase: SupabaseClient, image: PostImage, platform: PostPlatform): Promise<Buffer | null> {
  if (image.kind === "own") {
    const { data: blob, error } = await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).download(image.path);
    if (error || !blob || blob.size > MAX_SOURCE_BYTES || !SOURCE_TYPES.includes(blob.type)) return null;
    return Buffer.from(await blob.arrayBuffer());
  }
  const { width, height } = POST_IMAGE_SIZES[platform];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(unsplashAtSize(image.url, width, height), { signal: controller.signal });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.length > 0 && bytes.length <= MAX_SOURCE_BYTES ? bytes : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
