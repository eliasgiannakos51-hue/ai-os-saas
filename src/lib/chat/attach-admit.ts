import { ACCEPTED_ATTACHMENT_IMAGE_TYPES, MAX_ATTACHMENT_IMAGE_BYTES } from "@/lib/create-attachment-image";
import { MAX_FILE_BYTES } from "@/lib/files/file-types";
import { MAX_ATTACHMENT_IMAGES, MAX_CHAT_FILES } from "@/lib/chat/attachment-types";

/**
 * WHICH CHOSEN FILES A CHAT MESSAGE TAKES (package 9), before anything is
 * uploaded: PDFs up to Files' own size, JPG and PNG up to the attachments
 * bucket's, within the per-message caps the route enforces again
 * (readChatAttachments). Pure, so the gate runs it; the uploads are in
 * lib/chat/attach-client.ts. Held by scripts/tests/chat-attachments.test.mjs.
 */

export const CHAT_ACCEPT = ["application/pdf", ...ACCEPTED_ATTACHMENT_IMAGE_TYPES].join(",");

export type AttachKind = "pdf" | "image";

export function attachKindOf(file: { type: string; name: string }): AttachKind | null {
  if (file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name))) return "pdf";
  if ((ACCEPTED_ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(file.type)) return "image";
  return null;
}

/** Why a chosen file was not taken, before anything is uploaded. */
export type AttachRefusal = "type" | "pdfTooLarge" | "imageTooLarge" | "tooManyPdfs" | "tooManyImages";

/**
 * Which of the chosen files are taken, given what the message already
 * carries, and why each of the others is not — every refusal is said.
 */
export function admitFiles(
  files: readonly File[],
  already: { pdfs: number; images: number }
): { taken: { file: File; kind: AttachKind }[]; refused: { name: string; why: AttachRefusal }[] } {
  const taken: { file: File; kind: AttachKind }[] = [];
  const refused: { name: string; why: AttachRefusal }[] = [];
  let pdfs = already.pdfs;
  let images = already.images;
  for (const file of files) {
    const kind = attachKindOf(file);
    if (!kind) refused.push({ name: file.name, why: "type" });
    else if (kind === "pdf" && file.size > MAX_FILE_BYTES) refused.push({ name: file.name, why: "pdfTooLarge" });
    else if (kind === "image" && file.size > MAX_ATTACHMENT_IMAGE_BYTES) refused.push({ name: file.name, why: "imageTooLarge" });
    else if (kind === "pdf" && pdfs >= MAX_CHAT_FILES) refused.push({ name: file.name, why: "tooManyPdfs" });
    else if (kind === "image" && images >= MAX_ATTACHMENT_IMAGES) refused.push({ name: file.name, why: "tooManyImages" });
    else {
      taken.push({ file, kind });
      if (kind === "pdf") pdfs++;
      else images++;
    }
  }
  return { taken, refused };
}
