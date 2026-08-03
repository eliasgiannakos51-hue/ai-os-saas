// Shared between the client upload (create-chat.tsx/assistant-chat.tsx)
// and the server-side download (api/create/route.ts) — no "server-only"
// here, both sides need it. Mirrors lib/website-reference-image.ts's
// shape/reasoning, just for a different bucket: an optional reference
// image a user can attach to a Create Anything entry (or, via the same
// /api/create endpoint, a Mission Control "Create with AI" step — see
// mission-card.tsx) purely as vision CONTEXT for the classifier, never
// embedded into any generated output the way Website Builder's images
// can be. Kept private (unlike website-references) since there's no
// "published page" use case here — see supabase_schema.sql.

export const CREATE_ATTACHMENT_BUCKET = "create-attachments";

export const ACCEPTED_ATTACHMENT_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

export const MAX_ATTACHMENT_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

// Small on purpose — this is a "here's a photo of the thing I'm
// describing" aid, not a multi-image style-reference upload like Website
// Builder's.
export const MAX_ATTACHMENT_IMAGES = 3;

export function buildAttachmentImagePath(userId: string, fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${userId}/${uniqueSuffix}-${sanitized}`;
}
