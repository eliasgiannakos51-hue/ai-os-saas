import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_NAME = 80;
const MAX_DESCRIPTION = 400;
const MAX_COLLECTIONS = 100;

/** The user's collections, with the file ids in each. Sent together
 *  because a collection with no membership is not something the picker
 *  can do anything with. */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const [{ data: collections, error }, { data: items, error: itemsError }] = await Promise.all([
      supabase
        .from("file_collections")
        .select("id, name, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(MAX_COLLECTIONS),
      supabase
        .from("file_collection_items")
        .select("collection_id, file_id")
        .eq("user_id", user.id)
        .limit(5000),
    ]);

    if (error || itemsError) {
      logApiError("/api/files/collections", error ?? itemsError, { stage: "list" });
      return NextResponse.json({ ok: false, error: "Could not load your collections." }, { status: 500 });
    }

    const byCollection = new Map<string, string[]>();
    for (const item of items ?? []) {
      const key = String(item.collection_id);
      const list = byCollection.get(key) ?? [];
      list.push(String(item.file_id));
      byCollection.set(key, list);
    }

    return NextResponse.json({
      ok: true,
      collections: (collections ?? []).map((c) => ({
        ...c,
        fileIds: byCollection.get(String(c.id)) ?? [],
      })),
    });
  } catch (err) {
    logApiError("/api/files/collections", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Create a collection, optionally with its first members.
 *
 * The file ids in the body are RE-CHECKED against the user's own files
 * rather than trusted. `file_collection_items.user_id` is what RLS reads,
 * so writing a row with this user's id but somebody else's file id would
 * pass RLS and quietly attach a foreign document to a collection this
 * user can then ask questions about. The FK guarantees the file exists;
 * only this check guarantees whose it is.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "file_collection_write",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many changes. Try again shortly." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME) : "";
    const description =
      typeof body?.description === "string" ? body.description.trim().slice(0, MAX_DESCRIPTION) : null;

    if (!name) {
      return NextResponse.json({ ok: false, error: "Give the collection a name." }, { status: 400 });
    }

    const { count, error: countError } = await supabase
      .from("file_collections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (countError) {
      logApiError("/api/files/collections", countError, { stage: "count" });
      return NextResponse.json({ ok: false, error: "Could not create the collection." }, { status: 500 });
    }
    if ((count ?? 0) >= MAX_COLLECTIONS) {
      return NextResponse.json(
        { ok: false, error: `You can have up to ${MAX_COLLECTIONS} collections.` },
        { status: 403 }
      );
    }

    const requested = Array.isArray(body?.fileIds)
      ? body.fileIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 200)
      : [];

    let ownedIds: string[] = [];
    if (requested.length > 0) {
      const { data: owned, error: ownedError } = await supabase
        .from("user_files")
        .select("id")
        .eq("user_id", user.id)
        .in("id", requested);
      if (ownedError) {
        logApiError("/api/files/collections", ownedError, { stage: "verify_files" });
        return NextResponse.json({ ok: false, error: "Could not create the collection." }, { status: 500 });
      }
      ownedIds = (owned ?? []).map((row) => String(row.id));
      if (ownedIds.length !== requested.length) {
        return NextResponse.json({ ok: false, error: "One of those files does not exist." }, { status: 404 });
      }
    }

    const { data: collection, error } = await supabase
      .from("file_collections")
      .insert({ user_id: user.id, name, description })
      .select("id, name, description, created_at")
      .single();

    if (error || !collection) {
      logApiError("/api/files/collections", error, { stage: "insert" });
      return NextResponse.json({ ok: false, error: "Could not create the collection." }, { status: 500 });
    }

    if (ownedIds.length > 0) {
      const { error: itemsError } = await supabase.from("file_collection_items").insert(
        ownedIds.map((fileId) => ({
          collection_id: collection.id,
          file_id: fileId,
          user_id: user.id,
        }))
      );
      if (itemsError) {
        logApiError("/api/files/collections", itemsError, { stage: "insert_items" });
        // The collection exists but is empty — recoverable by the user,
        // and reported rather than presented as a success.
        return NextResponse.json(
          { ok: true, collection: { ...collection, fileIds: [] }, warning: "The files could not be added." },
          { status: 200 }
        );
      }
    }

    return NextResponse.json({ ok: true, collection: { ...collection, fileIds: ownedIds } });
  } catch (err) {
    logApiError("/api/files/collections", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
