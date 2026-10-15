/**
 * AN UPLOAD THAT WAS REFUSED, AND A FILE THAT COULD NOT BE READ, SAID IN
 * THE READER'S LANGUAGE (the package check of 2026-10-08).
 *
 * Both Files screens showed what the server wrote, as it came: a refused
 * upload's `error` (lib/files/ingest.ts — "Your plan includes 3 files —
 * delete one or upgrade." for a Free account at its limit) and a stored
 * file's `error` (the ExtractionError message lib/files/extract.ts and
 * lib/files/pdf.ts write — "this PDF has no text layer — it is a scan…").
 * English, on a Greek screen.
 *
 * Nothing stored changes: the refusal already says which one it is in
 * `stage` (and `limitReached`), and the stored sentence is matched here to
 * the reason it gives. The screens show a key; a reason not listed falls
 * back to the screen's own general sentence. Used by lib/files/upload-file.ts
 * and components/files/files-shell.tsx and files-workspace.tsx; held by
 * scripts/tests/file-pages.test.mjs, which reads the sentences straight out
 * of extract.ts and pdf.ts so a reworded one cannot slip past.
 */

export type UploadRefusal =
  | "uploadFileCap"
  | "uploadStorageCap"
  | "uploadRateLimited"
  | "unsupportedType"
  | "emptyFile"
  | "tooLarge"
  | "tooLargeForTransfer"
  | "uploadError";

/** A refusal from api/files/register or api/files/upload, by what it says it is. */
export function uploadRefusal(body: { stage?: unknown; limitReached?: unknown } | null, status: number): UploadRefusal {
  if (status === 429) return "uploadRateLimited";
  if (body?.stage === "file_cap" && body.limitReached === true) return "uploadFileCap";
  if (body?.stage === "storage_cap" && body.limitReached === true) return "uploadStorageCap";
  if (body?.stage === "type") return "unsupportedType";
  if (body?.stage === "size") return status === 413 ? "tooLarge" : "emptyFile";
  // The host's own 413, before any route ran: no body to read.
  if (status === 413) return "tooLargeForTransfer";
  return "uploadError";
}

export type UnreadableReason = "scan" | "encoding" | "locked" | "empty";

/** Why a stored file could not be read, from the sentence extraction stored. */
export function unreadableReason(error: string | null | undefined): UnreadableReason | null {
  if (!error) return null;
  if (/no text layer/i.test(error)) return "scan";
  if (/font encoding/i.test(error)) return "encoding";
  if (/password-protected/i.test(error)) return "locked";
  if (/appears to be empty|no readable pages/i.test(error)) return "empty";
  return null;
}
