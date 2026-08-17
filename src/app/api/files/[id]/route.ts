import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { FILE_BUCKET } from "@/lib/files/store";
import { deserialisePages } from "@/lib/files/extract";

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

/**
 * The readable text we extracted from one file.
 *
 * WHY THIS EXISTS: the workspace could show a file's page count and its
 * character count and let you download the original — a PDF, a DOCX —
 * but never gave you the text itself. That is the one form of it that
 * can be pasted somewhere else, and it is the form we already have.
 *
 * Page markers become headers rather than being stripped: text copied
 * out of a 200-page manual with no page boundaries is text nobody can
 * cite back. Same content, same order, readable.
 *
 * The 404 for somebody else's id is deliberate and matches DELETE below:
 * a 403 confirms the row exists, which is an existence oracle over every
 * file in the system.
 *
 * CODES, NOT PROSE, unlike the DELETE handler in this same file. That is
 * not an oversight — see the note in api/conversations/[id]. Every
 * English sentence a route returns is one the client shows verbatim to a
 * reader who may not read English, and i18n-coverage.test.mjs counts
 * them. New handlers stop adding to that count; the old one is left
 * alone rather than rewritten inside an unrelated change.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, code: "not_authenticated" }, { status: 401 });
    }

    const { data: file, error } = await supabase
      .from("user_files")
      .select("id, filename, extracted_text, processing_status")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      logApiError("/api/files/[id]", error, { stage: "load_text" });
      return NextResponse.json({ ok: false, code: "load_failed" }, { status: 500 });
    }
    if (!file) {
      return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    }

    const stored = typeof file.extracted_text === "string" ? file.extracted_text : "";
    if (!stored.trim()) {
      // Not an error. A file still being processed, or one we could not
      // read at all, has no text to give — and the client says which of
      // those it is from the row it already has.
      return NextResponse.json({ ok: true, filename: file.filename, text: "", pages: 0 });
    }

    const pages = deserialisePages(stored);
    const text = pages.map((page) => `--- ${page.label} ---\n${page.text}`).join("\n\n");

    return NextResponse.json({ ok: true, filename: file.filename, text, pages: pages.length });
  } catch (err) {
    logApiError("/api/files/[id]", err, { stage: "get_text" });
    return NextResponse.json({ ok: false, code: "unexpected" }, { status: 500 });
  }
}
