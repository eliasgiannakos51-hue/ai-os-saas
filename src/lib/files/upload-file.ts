"use client";

import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { FILE_BUCKET, extensionOf } from "@/lib/files/file-types";
import type { WorkspaceFile } from "@/lib/files/answer";
import { startQueuedAutomations } from "@/lib/automations/kick";

/** The words an upload can end in, in the reader's language. */
export type UploadMessages = {
  error: string;
  storageMissing: string;
  storagePolicy: string;
  tooLargeForTransfer: string;
};

/** A refusal the server answered carries its status and body, so the screen
 *  says it in its reader's language (the routes' `error` is English, for
 *  logs); `error` is what to say when there is no answer to read. */
export type UploadOutcome =
  | { ok: true; file: WorkspaceFile }
  | { ok: false; error: string; status?: number; body?: Record<string, unknown> | null };

/** The host refuses a request body over about 4.5MB before the route runs. */
const ROUTE_BODY_LIMIT = 4 * 1024 * 1024;

/**
 * ONE FILE INTO FILES, for Files in the shell (components/files/files-shell.tsx).
 *
 * The same two paths as the page (components/files/files-workspace.tsx,
 * uploadDirect and uploadViaRoute): the bytes go from the browser into the
 * person's own folder of the private bucket and /api/files/register reads
 * them back and writes the row; when storage is unreachable in a way the
 * route can carry, the bytes go in a multipart body to /api/files/upload.
 *
 * THE UPLOAD IS UNDONE IF THE REGISTRATION DOES NOT LAND: an object with
 * no row is counted nowhere and deletable by nobody, so it is removed from
 * the browser, where it was put. scripts/tests/tool-shell.test.mjs holds it.
 */
export async function uploadFile(file: File, words: UploadMessages): Promise<UploadOutcome> {
  let path: string | null = null;
  let fallback: string | undefined;
  try {
    const supabase = createBrowserSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (userId) {
      path = `${userId}/${crypto.randomUUID()}${extensionOf(file.name)}`;
      const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) {
        const message = error.message ?? "";
        if (/bucket not found/i.test(message)) return { ok: false, error: words.storageMissing };
        if (/row-level security|policy/i.test(message)) return { ok: false, error: words.storagePolicy };
        fallback = message || undefined;
        path = null;
      }
    }
  } catch {
    path = null;
  }

  if (path) {
    const response = await fetch("/api/files/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, filename: file.name }),
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; file?: WorkspaceFile; automations?: number } | null;
    // A file that was read may have started automations: they run now, in their own request.
    if (data?.ok) startQueuedAutomations(data.automations);
    if (data?.ok && data.file) return { ok: true, file: data.file };
    try {
      await createBrowserSupabase().storage.from(FILE_BUCKET).remove([path]);
    } catch {
      /* the object stays; the person still sees the upload error */
    }
    return { ok: false, error: data?.error ?? words.error, status: response.status, body: data };
  }

  if (file.size > ROUTE_BODY_LIMIT) return { ok: false, error: fallback ?? words.error };
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/files/upload", { method: "POST", body });
  const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; file?: WorkspaceFile; automations?: number } | null;
  // A file that was read may have started automations: they run now, in their own request.
  if (data?.ok) startQueuedAutomations(data.automations);
  if (data?.ok && data.file) return { ok: true, file: data.file };
  return { ok: false, error: data?.error ?? (response.status === 413 ? words.tooLargeForTransfer : words.error), status: response.status, body: data };
}
