import { REFERENCE_IMAGE_BUCKET } from "@/lib/website-reference-image";
import { WEB_IMAGE_SUFFIX } from "@/lib/websites/web-image-suffix";

/**
 * WHICH UPLOADED FILES NOTHING NEEDS ANY MORE.
 *
 * Deleting a website deletes a row. The photographs the owner uploaded
 * for it stay in Storage forever — nothing has ever removed them, and
 * nothing ever would have, because the delete happens straight from the
 * browser against one table.
 *
 * Pure on purpose: the decision is the whole risk here, and the risk is
 * deleting a photograph somebody's live site is serving. Testable without
 * Storage, without a database and without deleting anything.
 *
 * THE RULE IS "REFERENCED BY NOTHING", not "belongs to a deleted site".
 * A file can be:
 *   - embedded in a site's html_content (live, published, or a version)
 *   - listed in website_reference_images for a site that still exists
 *   - the .web.webp derivative of a file that is itself still referenced
 * Any one of those keeps it. Only a file with none of them goes, and
 * only once it is old enough that it cannot be an upload in flight.
 */

/** An upload younger than this is left alone whatever references it.
 *
 *  THE RACE THIS CLOSES: the browser uploads, then calls generate. In
 *  between, the file is referenced by nothing at all — and a cleanup that
 *  ran in that window would delete the photograph out from under a
 *  generation that is about to use it. */
export const MIN_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

export type StoredFile = { path: string; createdAtMs: number };

export type OrphanDecision = {
  /** Safe to delete. */
  orphans: string[];
  /** Kept, with the reason, so a dry run explains itself rather than
   *  printing a number. */
  kept: { path: string; reason: string }[];
};

export function findOrphanImages(params: {
  files: StoredFile[];
  /** Every path any surviving website row still points at. */
  referencedPaths: Set<string>;
  /** Every document that could embed a URL — html_content of drafts,
   *  published snapshots and versions, plus sub-pages. */
  documents: string[];
  nowMs: number;
}): OrphanDecision {
  const { files, referencedPaths, documents, nowMs } = params;

  // One pass over the documents, not one per file: a user with 200
  // uploads and 40 documents is 8,000 substring searches otherwise, and
  // this runs over every account.
  const embedded = new Set<string>();
  const marker = `/${REFERENCE_IMAGE_BUCKET}/`;
  for (const doc of documents) {
    if (typeof doc !== "string") continue;
    let from = 0;
    for (;;) {
      const at = doc.indexOf(marker, from);
      if (at === -1) break;
      const start = at + marker.length;
      // The path runs to the first character that cannot be in a URL
      // path. Quotes end an attribute; whitespace and ) end a CSS url().
      const end = (() => {
        for (let i = start; i < doc.length; i += 1) {
          const c = doc[i];
          if (c === '"' || c === "'" || c === ")" || c === " " || c === "\n" || c === "\t" || c === "?") return i;
        }
        return doc.length;
      })();
      embedded.add(decodeURIComponent(doc.slice(start, end)));
      from = end;
    }
  }

  const orphans: string[] = [];
  const kept: { path: string; reason: string }[] = [];

  for (const file of files) {
    if (nowMs - file.createdAtMs < MIN_ORPHAN_AGE_MS) {
      kept.push({ path: file.path, reason: "too recent — could be an upload in flight" });
      continue;
    }
    if (referencedPaths.has(file.path)) {
      kept.push({ path: file.path, reason: "listed against a website that still exists" });
      continue;
    }
    if (embedded.has(file.path)) {
      kept.push({ path: file.path, reason: "embedded in a document" });
      continue;
    }
    // A derivative lives or dies with its original. Checked explicitly
    // because the ORIGINAL is what a website_reference_images row names,
    // while the DERIVATIVE is what the page embeds — so each of them
    // looks unreferenced by the other's test.
    if (file.path.endsWith(WEB_IMAGE_SUFFIX)) {
      const original = file.path.slice(0, -WEB_IMAGE_SUFFIX.length);
      if (referencedPaths.has(original) || embedded.has(original)) {
        kept.push({ path: file.path, reason: "derivative of a referenced original" });
        continue;
      }
    } else if (embedded.has(`${file.path}${WEB_IMAGE_SUFFIX}`)) {
      kept.push({ path: file.path, reason: "its derivative is embedded" });
      continue;
    }
    orphans.push(file.path);
  }

  return { orphans, kept };
}
