"use client";

import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { FILE_BUCKET, extensionOf } from "@/lib/files/file-types";
import type { WorkspaceFile } from "@/lib/files/answer";
import { startQueuedAutomations } from "@/lib/automations/kick";
import { uploadRefusal, type UploadRefusal } from "@/lib/files/refusal-words";

/** The words an upload can end in, in the reader's language.
 *
 *  `refused` says a refusal from the route by what it is
 *  (lib/files/refusal-words.ts), never in the route's own English; Files
 *  passes it (components/files/files-shell.tsx). A caller that does not —
 *  Chat's attachments, lib/chat/attach-client.ts, as of 2026-10-08 — still
 *  gets the route's `error`, with the status and `limitReached` beside it
 *  to say the refusal from. */
export type UploadMessages = {
  error: string;
  storageMissing: string;
  storagePolicy: string;
  tooLargeForTransfer?: string;
  /** Storage could not be reached at all, so there is no answer to read. */
  offline?: string;
  refused?: (refusal: UploadRefusal) => string;
};

type IngestBody = { ok?: boolean; error?: string; stage?: string; limitReached?: boolean; file?: WorkspaceFile; automations?: number };

/**
 * A refusal the server answered carries its status and body, and whether a
 * plan limit was the reason, so a screen says it in its reader's language:
 * the routes' `error` is English, for logs (lib/files/ingest.ts). The Chat
 * does (lib/chat/attach-client.ts). `error` is what to say: the caller's
 * own words for the refusal when it passed `refused`, otherwise the
 * route's sentence or the words for no answer to read.
 */
export type UploadOutcome =
  | { ok: true; file: WorkspaceFile }
  | { ok: false; error: string; status?: number; body?: Record<string, unknown> | null; limitReached?: boolean };

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
  const refused = (data: IngestBody | null, status: number): string =>
    words.refused ? words.refused(uploadRefusal(data, status)) : data?.error ?? (status === 413 ? words.tooLargeForTransfer ?? words.error : words.error);
  let path: string | null = null;
  // Storage that could not be reached answered nothing: storage-js's
  // StorageUnknownError carries no status, and its message is the
  // browser's English («Failed to fetch»), so the reader is never shown it
  // (checked 2026-10-09 by scripts/tests/tool-shell-edges.prodtest.mjs).
  let unanswered = false;
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
        unanswered = typeof (error as { status?: unknown }).status !== "number";
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
    const data = (await response.json().catch(() => null)) as IngestBody | null;
    // A file that was read may have started automations: they run now, in their own request.
    if (data?.ok) startQueuedAutomations(data.automations);
    if (data?.ok && data.file) return { ok: true, file: data.file };
    try {
      await createBrowserSupabase().storage.from(FILE_BUCKET).remove([path]);
    } catch {
      /* the object stays; the person still sees the upload error */
    }
    return { ok: false, error: refused(data, response.status), body: data, status: response.status, limitReached: data?.limitReached === true };
  }

  // Storage's own message is the storage service's English, and never said:
  // with no answer at all it is the connection, otherwise our own sentence.
  if (file.size > ROUTE_BODY_LIMIT) return { ok: false, error: unanswered ? (words.offline ?? words.error) : words.error };
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/files/upload", { method: "POST", body });
  const data = (await response.json().catch(() => null)) as IngestBody | null;
  // A file that was read may have started automations: they run now, in their own request.
  if (data?.ok) startQueuedAutomations(data.automations);
  if (data?.ok && data.file) return { ok: true, file: data.file };
  return { ok: false, error: refused(data, response.status), body: data, status: response.status, limitReached: data?.limitReached === true };
}
