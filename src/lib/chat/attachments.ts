import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadReadableFiles } from "@/lib/files/store";
import { deserialisePages } from "@/lib/files/extract";
import { downloadAttachmentImage } from "@/lib/attachment-image-server";
import type { ChatAttachment } from "@/lib/chat/attachment-types";

/**
 * THE ATTACHMENTS' CONTENT, FOR THE MODEL (package 9).
 *
 * A PDF goes as the text Files already extracted from it, page markers
 * included, so "on which page?" has an answer — the same text Files asks
 * its questions of (lib/files/store.ts, loadReadableFiles: owner-scoped,
 * ready files only). An image goes as an image block, resized by the
 * shared downloader Create and Site use (lib/attachment-image-server.ts).
 *
 * ONE BUDGET FOR ALL THE TEXT: CHAT_ATTACHMENT_TEXT_CHARS, split evenly
 * between the documents, and a document cut short says so inside the
 * block — a model that is not told it saw a part answers as if it saw
 * the whole. Held by scripts/tests/chat-attachments.test.mjs.
 */

/** About 40k tokens of documents per message — a 50-page PDF fits whole. */
export const CHAT_ATTACHMENT_TEXT_CHARS = 150_000;

/**
 * What one image weighs in the hold, as characters, so the estimator that
 * sizes the hold on characters sizes images too. A 1568px image is about
 * 1,600 input tokens (Anthropic's width×height/750), and the estimator
 * reads four characters to a token.
 */
export const IMAGE_INPUT_CHARS = 6_400;

export type AttachmentContent = {
  blocks: Anthropic.ContentBlockParam[];
  /** Characters of document text sent, for the hold. */
  textChars: number;
  imageCount: number;
  /** The names of attachments that could not be read (not ready, not the sender's, gone). */
  missing: string[];
};

function clip(text: string, max: number): { text: string; cut: boolean } {
  if (text.length <= max) return { text, cut: false };
  return { text: text.slice(0, max), cut: true };
}

export async function loadAttachmentContent(
  supabase: SupabaseClient,
  userId: string,
  attachments: readonly ChatAttachment[],
  callerContext: string
): Promise<AttachmentContent> {
  const pdfs = attachments.filter((a): a is Extract<ChatAttachment, { kind: "pdf" }> => a.kind === "pdf");
  const images = attachments.filter((a): a is Extract<ChatAttachment, { kind: "image" }> => a.kind === "image");
  const missing: string[] = [];
  const blocks: Anthropic.ContentBlockParam[] = [];

  const files = pdfs.length > 0 ? (await loadReadableFiles(supabase, userId, pdfs.map((p) => p.fileId))) ?? [] : [];
  const byId = new Map(files.map((f) => [f.id, f]));
  const share = pdfs.length > 0 ? Math.floor(CHAT_ATTACHMENT_TEXT_CHARS / pdfs.length) : 0;
  let textChars = 0;
  for (const pdf of pdfs) {
    const file = byId.get(pdf.fileId);
    // The stored text carries Files' own page markers; the model gets them
    // as "--- Page 3 ---" lines, as /api/files/[id] shows them, so "on
    // which page?" has an answer it can read.
    const stored = file?.extracted_text ?? "";
    const body = deserialisePages(stored)
      .map((page) => `--- ${page.label} ---\n${page.text}`)
      .join("\n\n");
    if (!file || !body.trim()) {
      missing.push(pdf.name);
      continue;
    }
    const { text, cut } = clip(body, share);
    const note = cut ? `\n[Το έγγραφο κόπηκε εδώ: δόθηκαν οι πρώτοι ${share} από ${body.length} χαρακτήρες.]` : "";
    const block = `<document name="${pdf.name.replace(/"/g, "'")}">\n${text}${note}\n</document>`;
    textChars += block.length;
    blocks.push({ type: "text", text: block });
  }

  const loaded = await Promise.all(images.map((image) => downloadAttachmentImage(supabase, image.path, callerContext)));
  let imageCount = 0;
  loaded.forEach((image, i) => {
    if (!image) {
      missing.push(images[i].name);
      return;
    }
    imageCount++;
    blocks.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } });
  });

  return { blocks, textChars, imageCount, missing };
}

/** The hold's extra characters for this much attached content. */
export function attachmentInputChars(content: Pick<AttachmentContent, "textChars" | "imageCount">): number {
  return content.textChars + content.imageCount * IMAGE_INPUT_CHARS;
}

/**
 * A write that names a column the database may not have yet — the
 * migrations here are applied by hand (CLAUDE.md) — is retried without
 * it, so a chat never stops saving because a migration is late. The
 * health page names the missing column (lib/health/schema-canaries.ts).
 */
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? "");
}
