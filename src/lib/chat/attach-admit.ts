import { ACCEPTED_ATTACHMENT_IMAGE_TYPES, MAX_ATTACHMENT_IMAGE_BYTES } from "@/lib/create-attachment-image";
import { MAX_FILE_BYTES } from "@/lib/files/file-types";
import { MAX_ATTACHMENT_IMAGES, MAX_CHAT_FILES, MAX_CHAT_DATA } from "@/lib/chat/attachment-types";
import { MAX_UPLOAD_BYTES } from "@/lib/data-analysis/limits";

/**
 * WHICH CHOSEN FILES A CHAT MESSAGE TAKES (package 9), before anything is
 * uploaded: PDFs up to Files' own size, JPG and PNG up to the attachments
 * bucket's, a spreadsheet up to Analyze's own upload ceiling (the owner's
 * «30. CHAT: ΓΡΑΦΗΜΑΤΑ...», 2026-10-31, Κομμάτι 1 — chosen the same way
 * presentations-shell.tsx's own addDataFile already does, by the file's
 * NAME here since reading its bytes to confirm xlsx's zip signature is
 * the upload route's own job, not this picker's), within the per-message
 * caps the route enforces again (readChatAttachments). Pure, so the gate
 * runs it; the uploads are in lib/chat/attach-client.ts. Held by
 * scripts/tests/chat-attachments.test.mjs.
 */

export const CHAT_ACCEPT = ["application/pdf", ...ACCEPTED_ATTACHMENT_IMAGE_TYPES, ".csv", ".xlsx"].join(",");

export type AttachKind = "pdf" | "image" | "data";

export function attachKindOf(file: { type: string; name: string }): AttachKind | null {
  if (file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name))) return "pdf";
  if ((ACCEPTED_ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(file.type)) return "image";
  if (/\.(csv|xlsx)$/i.test(file.name)) return "data";
  return null;
}

/** Why a chosen file was not taken, before anything is uploaded. */
export type AttachRefusal = "type" | "pdfTooLarge" | "imageTooLarge" | "dataTooLarge" | "tooManyPdfs" | "tooManyImages" | "tooManyData";

/**
 * Which of the chosen files are taken, given what the message already
 * carries, and why each of the others is not — every refusal is said.
 */
export function admitFiles(
  files: readonly File[],
  already: { pdfs: number; images: number; data: number }
): { taken: { file: File; kind: AttachKind }[]; refused: { name: string; why: AttachRefusal }[] } {
  const taken: { file: File; kind: AttachKind }[] = [];
  const refused: { name: string; why: AttachRefusal }[] = [];
  let pdfs = already.pdfs;
  let images = already.images;
  let data = already.data;
  for (const file of files) {
    const kind = attachKindOf(file);
    if (!kind) refused.push({ name: file.name, why: "type" });
    else if (kind === "pdf" && file.size > MAX_FILE_BYTES) refused.push({ name: file.name, why: "pdfTooLarge" });
    else if (kind === "image" && file.size > MAX_ATTACHMENT_IMAGE_BYTES) refused.push({ name: file.name, why: "imageTooLarge" });
    else if (kind === "data" && file.size > MAX_UPLOAD_BYTES) refused.push({ name: file.name, why: "dataTooLarge" });
    else if (kind === "pdf" && pdfs >= MAX_CHAT_FILES) refused.push({ name: file.name, why: "tooManyPdfs" });
    else if (kind === "image" && images >= MAX_ATTACHMENT_IMAGES) refused.push({ name: file.name, why: "tooManyImages" });
    else if (kind === "data" && data >= MAX_CHAT_DATA) refused.push({ name: file.name, why: "tooManyData" });
    else {
      taken.push({ file, kind });
      if (kind === "pdf") pdfs++;
      else if (kind === "image") images++;
      else data++;
    }
  }
  return { taken, refused };
}
