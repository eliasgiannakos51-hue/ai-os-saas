// Shared between the client upload (website-builder-workspace.tsx) and
// the server-side download (api/websites/generate/route.ts) — no
// "server-only" here, both sides need it. Kept tiny and dependency-free.

export const REFERENCE_IMAGE_BUCKET = "website-references";

// WEBP IS ACCEPTED, and the reason it was not is that this list predates
// checking. Anthropic's vision API takes image/webp alongside jpeg, png
// and gif, so nothing downstream had to change — and webp is what a
// phone screenshot or an exported design most often IS now, so refusing
// it made the upload fail for a file the model could have read.
export const ACCEPTED_REFERENCE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

// Up to this many reference images per website generation (logo, product
// photos, a style-reference screenshot, ...) — re-exported by
// lib/website-builder.ts (server-only) so there's one source of truth,
// since this file is what the client can actually import.
export const MAX_REFERENCE_IMAGES = 20;

// Storage path convention: `${userId}/${uniqueSuffix}-${sanitizedFilename}`
// — the RLS policies on storage.objects (supabase_schema.sql) check that
// the first path segment matches auth.uid(), same per-user-folder pattern
// used by every other owner-scoped resource in this app.
export function buildReferenceImagePath(userId: string, fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${userId}/${uniqueSuffix}-${sanitized}`;
}

/**
 * True when `path` sits directly in this user's own storage folder.
 *
 * Storage RLS already enforces this at the bucket level, so nothing here
 * is the last line of defence against a cross-USER read. It exists because
 * the reference-image bug was never a cross-user one: paths arrived from
 * the client and were used unchecked, and the code that used them depended
 * on an invariant it never actually stated. Relying on a policy in another
 * system to hold an invariant this code needs is precisely how that
 * survived review.
 *
 * Rejects traversal ("uid/../other/x.png"), a leading slash, a bare
 * filename with no folder, and the prefix collision where another user id
 * merely STARTS with this one.
 */
export function referenceImagePathBelongsToUser(path: string, userId: string): boolean {
  if (typeof path !== "string" || !path || !userId) return false;
  if (path.includes("..") || path.startsWith("/")) return false;
  const slash = path.indexOf("/");
  if (slash <= 0) return false;
  // Compared as a whole segment, not with startsWith: "<uid>extra/x.png"
  // starts with the uid but is a different folder.
  return path.slice(0, slash) === userId;
}
