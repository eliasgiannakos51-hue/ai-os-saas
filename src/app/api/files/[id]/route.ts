import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { FILE_BUCKET } from "@/lib/files/store";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Delete one file.
 *
 * OWNERSHIP IS CHECKED BY THE READ, and the read is what supplies the
 * storage path. That ordering is the whole defence: the path deleted from
 * the bucket is the one the database returned for a row that matched
 * `user_id = <this user>`, so there is no arrangement of request
 * parameters that reaches somebody else's object. A route that took the
 * path from the body — or trusted the id and looked the path up without
 * the ownership filter — would be a one-line delete of any file in the
 * system.
 *
 * The OBJECT goes first, then the row. If the object delete fails we stop
 * and say so: the other order leaves bytes in the bucket with nothing
 * left pointing at them, counted against nobody's quota and deletable by
 * no one.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data: file, error } = await supabase
      .from("user_files")
      .select("id, storage_path")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      logApiError("/api/files/[id]", error, { stage: "load" });
      return NextResponse.json({ ok: false, error: "Could not load that file." }, { status: 500 });
    }
    // 404 rather than 403 for somebody else's id: a 403 confirms the row
    // exists, which is an existence oracle over every file in the system.
    if (!file) {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
    }

    const { error: removeError } = await supabase.storage
      .from(FILE_BUCKET)
      .remove([String(file.storage_path)]);

    if (removeError) {
      logApiError("/api/files/[id]", removeError, { stage: "storage_remove" });
      return NextResponse.json({ ok: false, error: "The file could not be deleted." }, { status: 502 });
    }

    const { error: deleteError } = await supabase
      .from("user_files")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id);

    if (deleteError) {
      logApiError("/api/files/[id]", deleteError, { stage: "delete_row" });
      return NextResponse.json({ ok: false, error: "The file could not be deleted." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/files/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
