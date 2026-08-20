import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import {
  FILE_BUCKET,
  MAX_FILE_BYTES,
  extensionOf,
  formatBytes,
  sanitiseFilename,
  sniffFileType,
} from "@/lib/files/file-types";
import { maxFilesForPlan, maxStorageBytesForPlan } from "@/lib/files/limits";
import { extractText, ExtractionError, serialisePages } from "@/lib/files/extract";
import { usedStorageBytes } from "@/lib/files/store";

/**
 * Everything between "we have the bytes" and "the row exists", shared by
 * the two routes that can receive a file:
 *
 *   /api/files/upload   — the bytes arrive in the request body
 *   /api/files/register — the browser already wrote the object to the
 *                         bucket and hands us its path
 *
 * One implementation because the checks ARE the product's safety: two
 * copies of the caps and the type sniff is how one path quietly stops
 * enforcing them.
 *
 * Every refusal names its `stage`. This exists because the one field the
 * production incident actually needed — WHICH link in the chain refused —
 * was exactly the field the old generic messages threw away.
 */

export type IngestStage =
  | "size"
  | "type"
  | "file_cap"
  | "storage_cap"
  | "storage_upload"
  | "insert_row";

export type IngestRefusal = {
  ok: false;
  status: number;
  stage: IngestStage;
  error: string;
  limitReached?: boolean;
  /** Raw upstream message (Postgres, storage). Safe: never user content. */
  detail?: string;
};

export type IngestSuccess = { ok: true; file: Record<string, unknown> };
export type IngestResult = IngestSuccess | IngestRefusal;

export const FILES_STORAGE_REPAIR_SQL =
  "supabase/migrations/20260819000000_files_storage_repair.sql";

/**
 * What a storage error MEANS, in words the person who can fix it can act
 * on. "Bucket not found" is a provisioning failure — the deployment's
 * Supabase project was never given the bucket — and answering it with
 * "the file could not be stored" hides the one fact that matters.
 */
export function describeStorageFailure(message: string): { status: number; error: string } {
  if (/bucket not found/i.test(message)) {
    return {
      status: 503,
      error:
        `File storage is not provisioned: the '${FILE_BUCKET}' bucket does not exist in this deployment's Supabase project. ` +
        `An administrator must run ${FILES_STORAGE_REPAIR_SQL} in the Supabase SQL editor.`,
    };
  }
  if (/row-level security|violates.*policy|not.?authori[sz]ed|access denied/i.test(message)) {
    return {
      status: 503,
      error:
        `File storage refused the write: the '${FILE_BUCKET}' bucket's access policies are missing or wrong. ` +
        `An administrator must run ${FILES_STORAGE_REPAIR_SQL} in the Supabase SQL editor.`,
    };
  }
  return { status: 502, error: "The file could not be stored." };
}

export async function ingestFileBytes(opts: {
  supabase: SupabaseClient;
  user: User;
  bytes: Buffer;
  rawFilename: string;
  contentType: string | null;
  /** Set when the object is ALREADY in the bucket (direct browser
   *  upload). Ingest then skips the write — and instead REMOVES the
   *  object on any refusal, so a refused upload cannot squat in the
   *  bucket against the user's quota. */
  existingPath?: string;
}): Promise<IngestResult> {
  const { supabase, user, bytes, contentType, existingPath } = opts;

  // Best-effort: a refusal must not leave the direct-uploaded object
  // behind. Failure to remove is logged, never surfaced — the refusal
  // itself is the answer the user needs.
  const refuse = async (r: IngestRefusal): Promise<IngestRefusal> => {
    if (existingPath) {
      const { error } = await supabase.storage.from(FILE_BUCKET).remove([existingPath]);
      if (error) logApiError("files/ingest", error, { stage: "cleanup_refused_object" });
    }
    return r;
  };

  if (bytes.length === 0) {
    return refuse({ ok: false, status: 400, stage: "size", error: "That file is empty." });
  }
  if (bytes.length > MAX_FILE_BYTES) {
    return refuse({
      ok: false,
      status: 413,
      stage: "size",
      error: `Files must be ${formatBytes(MAX_FILE_BYTES)} or smaller.`,
    });
  }

  const filename = sanitiseFilename(opts.rawFilename || "untitled");
  // Decided from the first bytes. The browser's Content-Type and the
  // extension are both supplied by whoever is uploading.
  const kind = sniffFileType(bytes, filename);
  if (!kind) {
    return refuse({
      ok: false,
      status: 415,
      stage: "type",
      error:
        "That file type is not supported. Upload a PDF, Word, Excel, CSV, Markdown or text file.",
    });
  }

  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);
  const fileCap = isAdmin ? Number.POSITIVE_INFINITY : maxFilesForPlan(planSlug);
  const storageCap = isAdmin ? Number.POSITIVE_INFINITY : maxStorageBytesForPlan(planSlug);

  if (Number.isFinite(fileCap)) {
    const { count, error } = await supabase
      .from("user_files")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    // Fails CLOSED, unlike the rate limiter: this cap bounds a resource
    // that costs money every month, and a counting error must not be a
    // way past it.
    if (error) {
      logApiError("files/ingest", error, { stage: "count_files" });
      return refuse({
        ok: false,
        status: 503,
        stage: "file_cap",
        error: "Could not check your file allowance.",
        detail: error.message,
      });
    }
    if ((count ?? 0) >= fileCap) {
      return refuse({
        ok: false,
        status: 403,
        stage: "file_cap",
        limitReached: true,
        error: `Your plan includes ${fileCap} file${fileCap === 1 ? "" : "s"} — delete one or upgrade.`,
      });
    }
  }

  if (Number.isFinite(storageCap)) {
    const used = await usedStorageBytes(supabase, user.id);
    if (used === null) {
      return refuse({
        ok: false,
        status: 503,
        stage: "storage_cap",
        error: "Could not check your storage allowance.",
      });
    }
    if (used + bytes.length > storageCap) {
      return refuse({
        ok: false,
        status: 403,
        stage: "storage_cap",
        limitReached: true,
        error: `That would use more than your ${formatBytes(storageCap)} of storage (${formatBytes(used)} used).`,
      });
    }
  }

  // The path is built from ids we generate, never from the filename. The
  // first segment is the owner, which is what the bucket's RLS policies
  // match on — so the path is the ownership proof, and a creative filename
  // cannot reach another user's folder because the filename is not in the
  // path at all.
  let storagePath = existingPath ?? null;
  if (!storagePath) {
    const extension = extensionOf(filename) || `.${kind}`;
    storagePath = `${user.id}/${randomUUID()}${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(FILE_BUCKET)
      .upload(storagePath, bytes, {
        contentType: contentType || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      logApiError("files/ingest", uploadError, { stage: "storage_upload" });
      const described = describeStorageFailure(uploadError.message ?? "");
      return {
        ok: false,
        status: described.status,
        stage: "storage_upload",
        error: described.error,
        detail: uploadError.message,
      };
    }
  }

  let extractedText: string | null = null;
  let pageCount: number | null = null;
  let status: "ready" | "failed" = "ready";
  let error: string | null = null;

  try {
    const result = extractText(bytes, kind);
    extractedText = serialisePages(result.pages);
    pageCount = result.pageCount;
    if (result.truncated) {
      // Not an error — the file is usable. But saying nothing here is
      // how a user comes to believe the AI read all 300 pages.
      error = `Only the first ${result.pages.length} page${result.pages.length === 1 ? "" : "s"} of this document are searchable.`;
    }
  } catch (err) {
    status = "failed";
    // ExtractionError messages are written for the user. Anything else
    // gets a generic message: a parser's own words are not a sentence
    // anyone should have to read.
    error = err instanceof ExtractionError ? err.message : "This file could not be read.";
  }

  const { data: row, error: insertError } = await supabase
    .from("user_files")
    .insert({
      user_id: user.id,
      filename,
      file_type: kind,
      size_bytes: bytes.length,
      storage_path: storagePath,
      extracted_text: extractedText,
      page_count: pageCount,
      char_count: extractedText?.length ?? 0,
      processing_status: status,
      error,
    })
    .select(
      "id, filename, file_type, size_bytes, page_count, char_count, processing_status, error, uploaded_at"
    )
    .single();

  if (insertError || !row) {
    // The object exists but the row does not, which would be an
    // invisible, uncountable, undeletable file sitting in the bucket
    // against the user's quota forever. Remove it.
    await supabase.storage.from(FILE_BUCKET).remove([storagePath]);
    logApiError("files/ingest", insertError, { stage: "insert_row" });
    return {
      ok: false,
      status: 500,
      stage: "insert_row",
      // WHAT happened, and WHAT the user can do. Nothing was stored (the
      // object was just removed), so trying again is safe and honest.
      error: "The file was read but its record could not be saved. Nothing was stored — please try the upload again.",
      detail: insertError?.message,
    };
  }

  return { ok: true, file: row };
}
