// Shared between the client upload (website-builder-workspace.tsx) and
// the server-side download (api/websites/generate/route.ts) — no
// "server-only" here, both sides need it. Kept tiny and dependency-free.

export const REFERENCE_IMAGE_BUCKET = "website-references";

export const ACCEPTED_REFERENCE_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

export const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

// Up to this many reference images per website generation (logo, product
// photos, a style-reference screenshot, ...) — re-exported by
// lib/website-builder.ts (server-only) so there's one source of truth,
// since this file is what the client can actually import.
export const MAX_REFERENCE_IMAGES = 10;

// Storage path convention: `${userId}/${uniqueSuffix}-${sanitizedFilename}`
// — the RLS policies on storage.objects (supabase_schema.sql) check that
// the first path segment matches auth.uid(), same per-user-folder pattern
// used by every other owner-scoped resource in this app.
export function buildReferenceImagePath(userId: string, fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${userId}/${uniqueSuffix}-${sanitized}`;
}
