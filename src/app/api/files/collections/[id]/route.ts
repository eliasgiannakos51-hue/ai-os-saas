import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_NAME = 80;
const MAX_DESCRIPTION = 400;
const MAX_FILES_PER_COLLECTION = 200;

/**
 * Rename a collection and/or replace its membership.
 *
 * Membership is REPLACED rather than merged. A merge endpoint needs a
 * separate "remove" endpoint to be usable at all, and two endpoints that
 * must agree about ownership is two chances to get it wrong. The client
 * sends the list it wants; this route makes that list true.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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

    const { data: collection, error: loadError } = await supabase
      .from("file_collections")
      .select("id")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError) {
      logApiError("/api/files/collections/[id]", loadError, { stage: "load" });
      return NextResponse.json({ ok: false, error: "Could not load that collection." }, { status: 500 });
    }
    if (!collection) {
      return NextResponse.json({ ok: false, error: "Collection not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);

    const updates: Record<string, string | null> = {};
    if (typeof body?.name === "string") {
      const name = body.name.trim().slice(0, MAX_NAME);
      if (!name) return NextResponse.json({ ok: false, error: "Give the collection a name." }, { status: 400 });
      updates.name = name;
    }
    if (typeof body?.description === "string") {
      updates.description = body.description.trim().slice(0, MAX_DESCRIPTION) || null;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("file_collections")
        .update(updates)
        .eq("id", params.id)
        .eq("user_id", user.id);
      if (error) {
        logApiError("/api/files/collections/[id]", error, { stage: "update" });
        return NextResponse.json({ ok: false, error: "Could not update the collection." }, { status: 500 });
      }
    }

    let fileIds: string[] | undefined;
    if (Array.isArray(body?.fileIds)) {
      const requested: string[] = Array.from(
        new Set<string>(body.fileIds.filter((id: unknown): id is string => typeof id === "string"))
      ).slice(0, MAX_FILES_PER_COLLECTION);

      // Same reason as the create route: the FK proves the file exists,
      // only this proves it is theirs.
      let owned: string[] = [];
      if (requested.length > 0) {
        const { data, error } = await supabase
          .from("user_files")
          .select("id")
          .eq("user_id", user.id)
          .in("id", requested);
        if (error) {
          logApiError("/api/files/collections/[id]", error, { stage: "verify_files" });
          return NextResponse.json({ ok: false, error: "Could not update the collection." }, { status: 500 });
        }
        owned = (data ?? []).map((row) => String(row.id));
        if (owned.length !== requested.length) {
          return NextResponse.json({ ok: false, error: "One of those files does not exist." }, { status: 404 });
        }
      }

      const { error: clearError } = await supabase
        .from("file_collection_items")
        .delete()
        .eq("collection_id", params.id)
        .eq("user_id", user.id);
      if (clearError) {
        logApiError("/api/files/collections/[id]", clearError, { stage: "clear_items" });
        return NextResponse.json({ ok: false, error: "Could not update the collection." }, { status: 500 });
      }

      if (owned.length > 0) {
        const { error: insertError } = await supabase.from("file_collection_items").insert(
          owned.map((fileId) => ({ collection_id: params.id, file_id: fileId, user_id: user.id }))
        );
        if (insertError) {
          logApiError("/api/files/collections/[id]", insertError, { stage: "insert_items" });
          return NextResponse.json({ ok: false, error: "Could not update the collection." }, { status: 500 });
        }
      }
      fileIds = owned;
    }

    return NextResponse.json({ ok: true, fileIds });
  } catch (err) {
    logApiError("/api/files/collections/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/** Delete a collection. The FILES are untouched — a collection is a way
 *  of grouping documents, and deleting the group must never be a way to
 *  lose the documents. `on delete cascade` clears the membership rows. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data: collection, error: loadError } = await supabase
      .from("file_collections")
      .select("id")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError) {
      logApiError("/api/files/collections/[id]", loadError, { stage: "load" });
      return NextResponse.json({ ok: false, error: "Could not load that collection." }, { status: 500 });
    }
    if (!collection) {
      return NextResponse.json({ ok: false, error: "Collection not found." }, { status: 404 });
    }

    const { error } = await supabase
      .from("file_collections")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id);

    if (error) {
      logApiError("/api/files/collections/[id]", error, { stage: "delete" });
      return NextResponse.json({ ok: false, error: "Could not delete the collection." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/files/collections/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
