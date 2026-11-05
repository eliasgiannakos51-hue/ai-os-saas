import { REFERENCE_IMAGE_BUCKET } from "@/lib/website-reference-image";
import { addEmbeddedPaths, findOrphanImages, type StoredFile } from "@/lib/websites/orphan-images";
import { normalisePages } from "@/lib/publishing/website-pages";

/**
 * THE DAILY SWEEP OF UPLOADED PHOTOGRAPHS, AND THE READS IT RESTS ON.
 *
 * src/app/api/cron/website-storage-cleanup/route.ts authenticates and
 * calls runStorageCleanup(); everything that decides what goes is here,
 * so that scripts/tests/storage-cleanup.test.mjs can execute it against a
 * stand-in that answers the way PostgREST does, row cap included.
 *
 * WHAT WAS WRONG (2026-11-05). Every in-use read was ONE request with
 * `.limit(50_000)`. A hosted Supabase project answers at most `max_rows`
 * rows per request (1,000 unless the project raised it), silently: no
 * error, no header the code read. So once a table carrying HTML passed
 * 1,000 rows, the photographs referenced only by the rows past the cap
 * looked unreferenced, and after the grace period the sweep deleted them.
 *
 * WHAT HOLDS IT NOW, in the order the run meets them:
 *
 *   1. EVERY READ IS PAGED UNTIL A PAGE COMES BACK EMPTY, keyed on the
 *      primary key (`id > last`, ordered by id). Not "until a page comes
 *      back short": a project whose max_rows is below IN_USE_PAGE_SIZE
 *      answers every page short, and stopping there would be the same
 *      truncation one level down. Keyset rather than offset, because an
 *      offset page skips a row whenever an earlier row is deleted while
 *      the sweep is reading.
 *   2. EVERY READ IS COUNTED, before and after. Fewer rows read than the
 *      table holds when the read ends means a row was missed (one
 *      inserted behind the cursor, say), and the run stops. What this
 *      cannot see: a missed insert exactly cancelled by the delete of a
 *      row already read. The next day's run reads both.
 *   3. ANY READ THAT FAILS OR COMES BACK EMPTY-HANDED THROWS, and the
 *      deletes come strictly after every read — so a failed, partial or
 *      timed-out read deletes nothing at all.
 *   4. A CEILING. A run that would delete more than MAX_DELETE_SHARE of
 *      every file it listed (with MIN_DELETE_CEILING as the floor for a
 *      small bucket) deletes nothing and says so. A missing reference
 *      source — the defect above, a new HTML table nobody added here —
 *      makes a large share look orphaned at once; ordinary daily
 *      deletions are a small one.
 *
 * Listing Storage is the one read that may come back short without
 * stopping the run, and that is the safe direction: a file that is not
 * listed is not deleted, and it shrinks the ceiling's denominator too.
 */

/** Rows per in-use request. Below PostgREST's default max_rows of 1,000,
 *  and small because an html_content column can be a few hundred KB. The
 *  loop does not depend on the server honouring it (see 1. above). */
export const IN_USE_PAGE_SIZE = 250;

/** A table this large is not something the sweep was sized for: it stops
 *  rather than read on for the whole of its time limit. */
export const MAX_IN_USE_ROWS = 400_000;

/** At most this share of the listed files is deleted in one run. */
export const MAX_DELETE_SHARE = 0.1;

/** ...but a bucket of a few dozen files can still lose a few. */
export const MIN_DELETE_CEILING = 10;

/** Storage lists 100 entries per request by default. */
const LIST_PAGE = 100;
/** Per user folder, as before: past this the rest of the folder is not
 *  listed, so it is not deleted either. */
const MAX_FILES_PER_FOLDER = 10_000;
/** Paths per remove request. */
const REMOVE_BATCH = 100;

/**
 * Every table whose rows carry a site's HTML. A table missing from here
 * contributes no references, so every photograph reachable only from it
 * is an orphan — scripts/tests/user-photos.test.mjs derives this set from
 * the migrations (every table with an html_content column) and requires
 * each one to be named here.
 */
export const HTML_TABLES = ["user_websites", "published_sites", "website_versions", "site_versions"] as const;

/** The rows that name an uploaded file directly. */
export const REFERENCE_TABLE = "website_reference_images";

type ReadError = { message?: string } | null;
type ReadResult = { data: unknown[] | null; error: ReadError; count?: number | null };

/** The slice of a PostgREST filter builder this file uses. */
export interface InUseQuery extends PromiseLike<ReadResult> {
  order(column: string, options: { ascending: boolean }): InUseQuery;
  gt(column: string, value: string): InUseQuery;
  limit(count: number): InUseQuery;
}

type StorageEntry = { name: string; metadata: unknown; created_at?: string | null };

/** The slice of the service-role client this file uses. */
export interface CleanupClient {
  from(table: string): {
    select(columns: string, options?: { count?: "exact"; head?: boolean }): InUseQuery;
  };
  storage: {
    from(bucket: string): {
      list(
        path: string,
        options: { limit: number; offset: number }
      ): PromiseLike<{ data: StorageEntry[] | null; error: unknown }>;
      remove(paths: string[]): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}

/** A read that could not be completed. Thrown, so nothing after it runs. */
export class IncompleteReadError extends Error {
  constructor(message: string) {
    super(`storage-cleanup: ${message}`);
    this.name = "IncompleteReadError";
  }
}

function describe(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

async function countRows(client: CleanupClient, table: string): Promise<number> {
  const { error, count } = await client.from(table).select("id", { count: "exact", head: true });
  if (error) throw new IncompleteReadError(`counting ${table} failed: ${describe(error)}`);
  if (typeof count !== "number" || !Number.isFinite(count)) {
    throw new IncompleteReadError(`counting ${table} returned no count`);
  }
  return count;
}

/**
 * Every row of `table`, a page at a time, handed to `onRow`. Throws on
 * any error, on a page with no data, on a cursor that does not move
 * forward, on a table past MAX_IN_USE_ROWS, and when fewer rows were
 * read than the table holds at the end. Returns how many were read.
 */
export async function readEveryRow(
  client: CleanupClient,
  table: string,
  columns: string,
  onRow: (row: Record<string, unknown>) => void
): Promise<number> {
  const before = await countRows(client, table);
  let cursor: string | null = null;
  let read = 0;
  for (;;) {
    let query = client.from(table).select(`id, ${columns}`).order("id", { ascending: true });
    if (cursor !== null) query = query.gt("id", cursor);
    const { data, error } = await query.limit(IN_USE_PAGE_SIZE);
    if (error) throw new IncompleteReadError(`reading ${table} failed after ${read} rows: ${describe(error)}`);
    if (!Array.isArray(data)) throw new IncompleteReadError(`reading ${table} returned no rows array after ${read} rows`);
    if (data.length === 0) break;
    for (const row of data as Record<string, unknown>[]) onRow(row);
    const last = (data[data.length - 1] as Record<string, unknown>).id;
    if (typeof last !== "string" || (cursor !== null && last <= cursor)) {
      throw new IncompleteReadError(`reading ${table}: the cursor did not advance past ${String(cursor)}`);
    }
    cursor = last;
    read += data.length;
    if (read > MAX_IN_USE_ROWS) throw new IncompleteReadError(`${table} holds more than ${MAX_IN_USE_ROWS} rows`);
  }
  const after = await countRows(client, table);
  if (read < after) {
    throw new IncompleteReadError(`read ${read} rows of ${table}, which holds ${after} (held ${before} when the read began)`);
  }
  return read;
}

/** What the sweep has to know before anything may be deleted. */
export type InUse = {
  referencedPaths: Set<string>;
  embeddedPaths: Set<string>;
  rowsRead: Record<string, number>;
};

/** Every reference to an upload, from every table that can hold one. */
export async function collectInUse(client: CleanupClient): Promise<InUse> {
  const embeddedPaths = new Set<string>();
  const referencedPaths = new Set<string>();
  const rowsRead: Record<string, number> = {};

  // Paths, not documents: one page of HTML at a time is held, and only
  // what it embeds is kept.
  for (const table of HTML_TABLES) {
    rowsRead[table] = await readEveryRow(client, table, "html_content, pages", (row) => {
      if (typeof row.html_content === "string") addEmbeddedPaths(row.html_content, embeddedPaths);
      for (const page of normalisePages(row.pages).pages) addEmbeddedPaths(page.html, embeddedPaths);
    });
  }

  const marker = `/${REFERENCE_IMAGE_BUCKET}/`;
  rowsRead[REFERENCE_TABLE] = await readEveryRow(client, REFERENCE_TABLE, "image_url", (row) => {
    const value = String(row.image_url ?? "");
    if (!value) return;
    // The column stores a Storage PATH, not a URL, despite its name (see
    // the WebsiteReferenceImage type). Both forms are accepted so a row
    // written either way still protects its file.
    const at = value.indexOf(marker);
    referencedPaths.add(at === -1 ? value : value.slice(at + marker.length));
  });

  return { referencedPaths, embeddedPaths, rowsRead };
}

/** Every file in the bucket, one user folder at a time. */
async function listStoredFiles(client: CleanupClient): Promise<StoredFile[]> {
  const bucket = client.storage.from(REFERENCE_IMAGE_BUCKET);
  const folders: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await bucket.list("", { limit: LIST_PAGE, offset });
    if (error) throw new IncompleteReadError(`listing the bucket failed: ${describe(error)}`);
    const page = data ?? [];
    // A folder entry has no metadata; a file does. Anything with metadata
    // at the root is not a user folder and is skipped rather than treated
    // as one.
    for (const entry of page) if (!entry.metadata) folders.push(entry.name);
    if (page.length < LIST_PAGE) break;
  }

  const files: StoredFile[] = [];
  for (const userId of folders) {
    for (let offset = 0; offset < MAX_FILES_PER_FOLDER; offset += LIST_PAGE) {
      const { data, error } = await bucket.list(userId, { limit: LIST_PAGE, offset });
      if (error) throw new IncompleteReadError(`listing ${userId} failed: ${describe(error)}`);
      const page = data ?? [];
      for (const file of page) {
        if (!file.metadata) continue;
        files.push({
          path: `${userId}/${file.name}`,
          createdAtMs: file.created_at ? new Date(file.created_at).getTime() : 0,
        });
      }
      if (page.length < LIST_PAGE) break;
    }
  }
  return files;
}

/** The most one run may delete, out of `listed` files. */
export function deleteCeiling(listed: number): number {
  return Math.max(MIN_DELETE_CEILING, Math.floor(listed * MAX_DELETE_SHARE));
}

export type CleanupReport =
  | {
      ok: true;
      dryRun: boolean;
      scanned: number;
      deleted: number;
      ceiling: number;
      keptReasons: Record<string, number>;
      sample: string[];
      rowsRead: Record<string, number>;
    }
  | {
      ok: false;
      stopped: "ceiling";
      dryRun: boolean;
      scanned: number;
      wouldDelete: number;
      ceiling: number;
      deleted: 0;
      sample: string[];
      rowsRead: Record<string, number>;
    };

/**
 * One sweep. Reads everything first; throws (deleting nothing) if any
 * read is incomplete; stops (deleting nothing) above the ceiling; then
 * deletes, unless `dryRun`.
 */
export async function runStorageCleanup(
  client: CleanupClient,
  options: { nowMs: number; dryRun: boolean }
): Promise<CleanupReport> {
  const { nowMs, dryRun } = options;
  const inUse = await collectInUse(client);
  const files = await listStoredFiles(client);

  const { orphans, kept } = findOrphanImages({
    files,
    referencedPaths: inUse.referencedPaths,
    embeddedPaths: inUse.embeddedPaths,
    nowMs,
  });
  const keptReasons: Record<string, number> = {};
  for (const k of kept) keptReasons[k.reason] = (keptReasons[k.reason] ?? 0) + 1;
  const sample = orphans.slice(0, 10);
  const ceiling = deleteCeiling(files.length);

  if (orphans.length > ceiling) {
    return {
      ok: false,
      stopped: "ceiling",
      dryRun,
      scanned: files.length,
      wouldDelete: orphans.length,
      ceiling,
      deleted: 0,
      sample,
      rowsRead: inUse.rowsRead,
    };
  }

  let deleted = 0;
  if (dryRun) {
    deleted = orphans.length;
  } else {
    const bucket = client.storage.from(REFERENCE_IMAGE_BUCKET);
    // In batches: remove() takes a list, and a single call with
    // thousands of paths is one request that either works or does not.
    for (let i = 0; i < orphans.length; i += REMOVE_BATCH) {
      const { error } = await bucket.remove(orphans.slice(i, i + REMOVE_BATCH));
      if (error) throw error;
      deleted += Math.min(REMOVE_BATCH, orphans.length - i);
    }
  }

  return { ok: true, dryRun, scanned: files.length, deleted, ceiling, keptReasons, sample, rowsRead: inUse.rowsRead };
}
