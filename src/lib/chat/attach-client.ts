"use client";

import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { CREATE_ATTACHMENT_BUCKET, buildAttachmentImagePath } from "@/lib/create-attachment-image";
import { uploadFile, type UploadMessages } from "@/lib/files/upload-file";
import type { ChatAttachment } from "@/lib/chat/attachment-types";

/**
 * WHAT A CHAT MESSAGE CARRIES, ON THE WAY IN (MASTER 16, package 9).
 *
 * A PDF goes into Files the moment it is chosen, through the same upload
 * Files uses (lib/files/upload-file.ts): Files reads it, page by page, and
 * the message then names the file. So a document given to Chat is also
 * in Files afterwards, where it can be asked again or deleted — it is not
 * a copy kept somewhere only Chat knows.
 *
 * AN IMAGE GOES UP WHEN THE MESSAGE IS SENT, not when it is chosen, into
 * the private bucket Create and Slides attach photographs to: an image
 * chosen and then taken off, or left behind when the page is closed,
 * never reaches storage at all. Once the message is refused — or the
 * conversation it belongs to is deleted — discardChatImages removes it.
 * scripts/tests/upload-reversibility.test.mjs holds that this file undoes
 * what it uploads.
 *
 * Held by scripts/tests/chat-attachments.test.mjs.
 */

export { CHAT_ACCEPT, admitFiles, attachKindOf, type AttachKind, type AttachRefusal } from "@/lib/chat/attach-admit";

/** A PDF into Files. Ready means Files read text out of it; anything else is said. */
export async function attachPdf(
  file: File,
  words: UploadMessages & { unreadable: string }
): Promise<{ ok: true; attachment: ChatAttachment; pages: number | null } | { ok: false; error: string }> {
  const outcome = await uploadFile(file, words);
  if (!outcome.ok) return outcome;
  if (outcome.file.processing_status !== "ready") return { ok: false, error: outcome.file.error ?? words.unreadable };
  return { ok: true, attachment: { kind: "pdf", fileId: outcome.file.id, name: outcome.file.filename }, pages: outcome.file.page_count };
}

/**
 * The message's images into the private bucket, at send. All or nothing:
 * a message about three photographs that arrives with two is a different
 * question, so a failure removes the ones that did go up and says so.
 */
export async function uploadChatImages(
  files: readonly { file: File; name: string }[]
): Promise<{ ok: true; attachments: ChatAttachment[] } | { ok: false; error: unknown }> {
  if (files.length === 0) return { ok: true, attachments: [] };
  const supabase = createBrowserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: null };
  const results = await Promise.all(
    files.map(async ({ file, name }) => {
      const path = buildAttachmentImagePath(user.id, file.name);
      const { error } = await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).upload(path, file, { contentType: file.type });
      return { path, name, error };
    })
  );
  const failed = results.find((r) => r.error);
  if (failed) {
    await discardChatImages(results.filter((r) => !r.error).map((r) => r.path));
    return { ok: false, error: failed.error };
  }
  return { ok: true, attachments: results.map((r) => ({ kind: "image" as const, path: r.path, name: r.name })) };
}

/** Remove images nothing will point at: a refused message's, or a deleted conversation's. Best-effort. */
export async function discardChatImages(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await createBrowserSupabase().storage.from(CREATE_ATTACHMENT_BUCKET).remove([...paths]);
  } catch {
    /* the objects stay; the delete-account sweep still covers the bucket */
  }
}

/** A short-lived link to show a sent image again, from the person's own folder. */
export async function chatImageUrl(path: string): Promise<string | null> {
  try {
    const { data } = await createBrowserSupabase().storage.from(CREATE_ATTACHMENT_BUCKET).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
