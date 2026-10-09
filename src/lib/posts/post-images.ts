import type { PostPlatform } from "@/lib/posts/platforms";

/**
 * A PICTURE FOR EVERY POST, AT ITS PLATFORM'S SIZE (MASTER 16, package
 * 15: «παίρνω post για τρεις πλατφόρμες, το καθένα με εικόνα στο σωστό
 * μέγεθος»), behind the switch "posts-images".
 *
 * ONE PICTURE, CUT FIVE WAYS. The person gives a photograph of their own
 * (the field's «+»), or asks for one from Unsplash, which the posts' own
 * imageQuery finds. It is stored once — the photo's path in the person's
 * own folder of create-attachments, or the Unsplash photo with its credit —
 * on the post set (generated_posts.posts, no new column), and each
 * platform's version is CUT when it is asked for
 * (api/posts/[id]/image, lib/posts/post-image-server.ts): exactly the
 * pixels below, the subject kept in frame.
 *
 * THE SIZES are each network's recommended upload for a picture in the
 * feed, as published by the networks themselves for 2026 (LinkedIn
 * 1200 x 627, X 1600 x 900, Instagram and Threads 1080 x 1350 portrait,
 * Facebook 1200 x 630). Pure: scripts/tests/posts-images.test.mjs runs it.
 */
export const POST_IMAGE_SIZES: Record<PostPlatform, { width: number; height: number }> = {
  linkedin: { width: 1200, height: 627 },
  x: { width: 1600, height: 900 },
  instagram: { width: 1080, height: 1350 },
  facebook: { width: 1200, height: 630 },
  threads: { width: 1080, height: 1350 },
};

export const POST_IMAGE_SOURCES = ["none", "own", "unsplash"] as const;
export type PostImageSource = (typeof POST_IMAGE_SOURCES)[number];
export function isPostImageSource(value: unknown): value is PostImageSource {
  return typeof value === "string" && (POST_IMAGE_SOURCES as readonly string[]).includes(value);
}

export type PostImage =
  | { kind: "own"; path: string }
  | { kind: "unsplash"; url: string; photographerName: string; photographerUrl: string; downloadLocation: string };

/** A stored picture, made safe: the shape the route cuts, or nothing. */
export function parsePostImage(raw: unknown): PostImage | null {
  if (!raw || typeof raw !== "object") return null;
  const i = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  if (i.kind === "own") {
    const path = str(i.path);
    return path && !path.includes("..") ? { kind: "own", path } : null;
  }
  if (i.kind === "unsplash") {
    const url = str(i.url);
    const photographerName = str(i.photographerName);
    const photographerUrl = str(i.photographerUrl);
    const downloadLocation = str(i.downloadLocation);
    if (!url || !photographerName || !photographerUrl || !downloadLocation) return null;
    if (!/^https:\/\/images\.unsplash\.com\//.test(url)) return null;
    return { kind: "unsplash", url, photographerName, photographerUrl, downloadLocation };
  }
  return null;
}

/**
 * An Unsplash photo at a platform's size, CUT BY UNSPLASH'S OWN CDN
 * (imgix: w, h, fit=crop, crop=entropy) — the picture is hotlinked and
 * resized there, as Unsplash's guidelines ask, never re-hosted; the
 * download route fetches these bytes for the file the person keeps.
 */
export function unsplashAtSize(url: string, width: number, height: number): string {
  try {
    const u = new URL(url);
    u.searchParams.set("w", String(width));
    u.searchParams.set("h", String(height));
    u.searchParams.set("fit", "crop");
    u.searchParams.set("crop", "entropy");
    u.searchParams.set("fm", "jpg");
    u.searchParams.set("q", "85");
    return u.toString();
  } catch {
    return url;
  }
}

/** The name a platform's picture is saved under: what it is for and its size. */
export function postImageFilename(platform: PostPlatform): string {
  const { width, height } = POST_IMAGE_SIZES[platform];
  return `${platform}-${width}x${height}.jpg`;
}
