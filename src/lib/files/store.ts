import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import type { FileKind } from "@/lib/files/file-types";

/** The PRIVATE bucket. Named once so no route can typo its way into a
 *  different, possibly public, one. */
export const FILE_BUCKET = "user-files";

/** How long a download link lives. Short on purpose: the URL is a bearer
 *  token for the file, it appears in browser history, and it is the kind
 *  of thing that gets pasted into a chat window. Sixty seconds is enough
 *  to start a download and not enough to be worth sharing. */
export const SIGNED_URL_TTL_SECONDS = 60;

export type FileRow = {
  id: string;
  user_id: string;
  filename: string;
  file_type: FileKind;
  size_bytes: number;
  storage_path: string;
  page_count: number | null;
  char_count: number;
  processing_status: "pending" | "processing" | "ready" | "failed";
  error: string | null;
  uploaded_at: string;
};

/** The columns safe to send to the client. `storage_path` is deliberately
 *  absent: it is an internal locator, and a client that knows it is one
 *  step closer to constructing its own request against the bucket. */
export const FILE_LIST_COLUMNS =
  "id, filename, file_type, size_bytes, page_count, char_count, processing_status, error, uploaded_at";

/**
 * Bytes this user is currently storing.
 *
 * Returns null on error rather than 0, and every caller treats null as
 * "refuse". A storage cap that silently reads as zero when the database
 * hiccups is not a cap — it is a cap-shaped comment.
 */
export async function usedStorageBytes(
  supabase: SupabaseClient,
  userId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("user_files")
    .select("size_bytes")
    .eq("user_id", userId);

  if (error) {
    logApiError("files:store", error, { stage: "used_storage" });
    return null;
  }
  return (data ?? []).reduce((sum, row) => sum + Number(row.size_bytes ?? 0), 0);
}

/**
 * Load the files a question may be asked about.
 *
 * The ownership filter is on the query, not on a check afterwards. Both
 * work; only one of them cannot be forgotten by the next person to add a
 * branch to the calling route.
 *
 * Only 'ready' files come back: a failed extraction has no text, and
 * including it would mean the model is told a document was supplied that
 * it cannot see — which is how a "the documents do not say" answer gets
 * produced about a document that does say.
 */
export async function loadReadableFiles(
  supabase: SupabaseClient,
  userId: string,
  fileIds: string[]
): Promise<{ id: string; filename: string; extracted_text: string | null }[] | null> {
  if (fileIds.length === 0) return [];

  const { data, error } = await supabase
    .from("user_files")
    .select("id, filename, extracted_text")
    .eq("user_id", userId)
    .eq("processing_status", "ready")
    .in("id", fileIds);

  if (error) {
    logApiError("files:store", error, { stage: "load_readable" });
    return null;
  }

  // Returned in the order the user selected them, not the order the
  // database happened to return: truncation drops from the end, so the
  // order is a decision the user made and not an accident.
  const byId = new Map((data ?? []).map((row) => [String(row.id), row]));
  return fileIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row));
}

/**
 * The file ids in a collection, in insertion order.
 *
 * Scoped to the user twice — once through the collection's own ownership
 * check by the caller, and once here. Redundant on purpose: this is the
 * function that turns an id from a request body into a list of documents
 * the AI will read, and it is worth being unambiguous about who those
 * documents belong to.
 */
export async function fileIdsInCollection(
  supabase: SupabaseClient,
  userId: string,
  collectionId: string
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("file_collection_items")
    .select("file_id, added_at")
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .order("added_at", { ascending: true });

  if (error) {
    logApiError("files:store", error, { stage: "collection_items" });
    return null;
  }
  return (data ?? []).map((row) => String(row.file_id));
}
