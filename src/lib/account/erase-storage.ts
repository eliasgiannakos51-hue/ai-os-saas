/**
 * EVERY FILE A PERSON STORED, REMOVED THROUGH THE STORAGE API.
 *
 * Account deletion used to call public.delete_user_storage_objects(), a
 * SQL function that ran `delete from storage.objects`. Supabase refuses
 * that statement on every hosted project since its storage release of
 * 2026-03 (the `protect_objects_delete` trigger, storage migration 0055):
 * a delete has to go through the Storage API, which removes the bytes as
 * well as the row. So every account deletion stopped at its first step,
 * with nothing deleted and the subscription still running, and the check
 * that ran it on 2026-10-08 in production answered "ΝΑΙ: αποτυγχάνει".
 *
 * Here the files are listed and removed with the same client the rest of
 * the application uploads with. Everything under `<user id>/`, in every
 * bucket, folders followed all the way down, and then each bucket is
 * listed again: the caller deletes the account only if nothing is left.
 *
 * Executed against a stand-in that answers as the Storage API does, with
 * Supabase's own refusal of the SQL path, by
 * scripts/tests/erase-storage.test.mjs, and in a built app through the
 * real route by scripts/tests/delete-account.prodtest.mjs.
 */

/** Every bucket the application writes a person's files to. The gate
 *  scripts/tests/gdpr-coverage.test.mjs holds this to the *_BUCKET
 *  constants in src/lib, both ways. */
export const USER_BUCKETS = ["user-files", "create-attachments", "website-references", "ai-images"] as const;

/** One page of a listing; the Storage API's own default is 100. */
const PAGE = 1000;
/** Paths per remove request. */
const REMOVE_BATCH = 100;
/** The deepest folder the application writes is three below the user's;
 *  past this, something is wrong and the deletion stops rather than loop. */
const MAX_DEPTH = 10;

type ListEntry = { name: string; id: string | null };
type Result<T> = { data: T | null; error: unknown };

/** The two calls of `supabase.storage.from(bucket)` this needs. */
export type BucketApi = {
  list(path: string, options: { limit: number; offset: number }): Promise<Result<ListEntry[]>>;
  remove(paths: string[]): Promise<Result<unknown>>;
};
export type StorageApi = { from(bucket: string): BucketApi };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(step: string, bucket: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);
  return new Error(`erase-storage: ${step} failed in ${bucket}: ${detail}`);
}

/** Every object path under `folder`, folders followed. A folder is an
 *  entry with no id: the Storage API lists one level at a time. */
async function listAll(bucket: BucketApi, bucketName: string, folder: string, depth: number, out: string[]): Promise<void> {
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(folder, { limit: PAGE, offset });
    if (error) throw failure("list", bucketName, error);
    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${folder}/${entry.name}`;
      if (entry.id === null) {
        if (depth >= MAX_DEPTH) throw failure("list", bucketName, `folders nested deeper than ${MAX_DEPTH} under ${folder}`);
        await listAll(bucket, bucketName, path, depth + 1, out);
      } else {
        out.push(path);
      }
    }
    if (entries.length < PAGE) return;
  }
}

/**
 * Removes every object under `<userId>/` in every bucket of USER_BUCKETS,
 * then lists each bucket again and throws if anything is left. Throws on
 * the first error, before the caller deletes anything else.
 */
export async function eraseUserStorage(storage: StorageApi, userId: string): Promise<{ removed: number; byBucket: Record<string, number> }> {
  if (!UUID.test(userId)) throw new Error("erase-storage: not a user id");
  const byBucket: Record<string, number> = {};
  let removed = 0;
  for (const name of USER_BUCKETS) {
    const bucket = storage.from(name);
    const paths: string[] = [];
    await listAll(bucket, name, userId, 0, paths);
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const { error } = await bucket.remove(paths.slice(i, i + REMOVE_BATCH));
      if (error) throw failure("remove", name, error);
    }
    const left: string[] = [];
    await listAll(bucket, name, userId, 0, left);
    if (left.length > 0) throw failure("remove", name, `${left.length} object(s) still there after removal`);
    byBucket[name] = paths.length;
    removed += paths.length;
  }
  return { removed, byBucket };
}
