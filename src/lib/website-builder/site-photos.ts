import { createClient } from "@/lib/supabase/client";
import { fetchWithAuthRetry } from "@/lib/fetch-with-auth-retry";
import {
  ACCEPTED_REFERENCE_IMAGE_TYPES,
  buildReferenceImagePath,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_REFERENCE_IMAGES,
  REFERENCE_IMAGE_BUCKET,
} from "@/lib/website-reference-image";
import { canUpload, type StorageUsage } from "@/lib/websites/storage-quota";

/**
 * A SITE'S REFERENCE PHOTOS, GIVEN IN THE SHELL (the logo, the products,
 * the place). The same rules and the same bucket as the old page
 * (components/website-builder/website-builder-workspace.tsx,
 * handleImageChange and the upload before generate): JPG, PNG or WebP, up
 * to 5MB each, up to MAX_REFERENCE_IMAGES; the account's room is asked
 * before the first byte goes up, judged on the whole batch; every photo
 * goes up before anything is asked of the model, and if one fails nothing
 * is sent. The paths are what /api/websites/generate and /api/websites/edit
 * take as `referenceImagePaths` (lib/website-builder/site-requests.ts);
 * generate stores them in website_reference_images and the worker reads
 * them from there.
 *
 * A photo uploaded for a site that is then refused is referenced by
 * nothing, and the nightly cleanup removes it after a day
 * (lib/websites/orphan-images.ts) — as on the old page.
 *
 * Held by scripts/tests/tool-shell.test.mjs, section 9.
 */

export type PhotoRefusal = "type" | "size" | "count";

/** Which of `picked` may join `held`, and why any could not — the old page's order: the count, then the type, then the size. */
export function admitPhotos(heldCount: number, picked: File[]): { accepted: File[]; refused: PhotoRefusal | null } {
  const room = MAX_REFERENCE_IMAGES - heldCount;
  if (room <= 0) return { accepted: [], refused: picked.length > 0 ? "count" : null };
  const accepted: File[] = [];
  let refused: PhotoRefusal | null = null;
  for (const file of picked) {
    if (accepted.length >= room) {
      refused = refused ?? "count";
      break;
    }
    if (!(ACCEPTED_REFERENCE_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      refused = "type";
      continue;
    }
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      refused = refused ?? "size";
      continue;
    }
    accepted.push(file);
  }
  return { accepted, refused };
}

export type PhotoUpload =
  | { ok: true; paths: string[] }
  /** The account's photo storage has no room for this batch: the two numbers, in bytes. */
  | { ok: false; reason: "full"; neededBytes: number; remainingBytes: number }
  | { ok: false; reason: "signedOut" | "failed" };

/**
 * Every photo into the account's own folder of the reference bucket, or
 * none of them counted: one failure and the whole batch is reported failed,
 * so a site is never made with some of the photos quietly missing. Storage's
 * own message is English and is never what the reader is told — the caller
 * says `reason` in the screen's words.
 */
export async function uploadSitePhotos(files: File[]): Promise<PhotoUpload> {
  if (files.length === 0) return { ok: true, paths: [] };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "signedOut" };

  // ADVISORY, and it fails open, as on the old page: a storage hiccup must
  // not stop somebody adding a photograph to their own site.
  try {
    const res = await fetchWithAuthRetry("/api/websites/storage-usage");
    const data = await res.json().catch(() => null);
    if (data?.ok && !data.degraded) {
      const decision = canUpload(data.usage as StorageUsage, files.map((f) => f.size));
      if (!decision.ok) return { ok: false, reason: "full", neededBytes: decision.neededBytes, remainingBytes: decision.remainingBytes };
    }
  } catch {
    /* fails open — see above */
  }

  const results = await Promise.all(
    files.map(async (file) => {
      const path = buildReferenceImagePath(user.id, file.name);
      const { error } = await supabase.storage.from(REFERENCE_IMAGE_BUCKET).upload(path, file, { contentType: file.type });
      return { path, error };
    })
  );
  if (results.some((r) => r.error)) return { ok: false, reason: "failed" };
  return { ok: true, paths: results.map((r) => r.path) };
}
