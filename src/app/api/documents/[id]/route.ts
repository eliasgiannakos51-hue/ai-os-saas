import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

const MAX_TITLE_LENGTH = 200;
// Generous ceiling on the editor's raw HTML — matches the pattern used
// elsewhere in the app (see e.g. website-builder's field limits) of a high
// but finite cap rather than no cap at all.
const MAX_CONTENT_LENGTH = 500_000;

// Auto-saved by the editor (components/documents/document-editor.tsx) on a
// ~2s debounce after the user stops typing — title and content are always
// sent together so a save never partially overwrites one without the
// other. RLS on user_documents already scopes every query to auth.uid(),
// so .eq("id", id) here is just for a precise 404 vs. a silent no-op.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    let title: string | undefined;
    let html: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.title === "string") {
        title = body.title.trim().slice(0, MAX_TITLE_LENGTH) || "Untitled";
      }
      if (typeof body?.content?.html === "string") {
        html = body.content.html.slice(0, MAX_CONTENT_LENGTH);
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (title === undefined && html === undefined) {
      return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) update.title = title;
    if (html !== undefined) update.content = { html };

    const { data, error } = await supabase
      .from("user_documents")
      .update(update)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      logApiError("/api/documents/[id]", error, { stage: "update" });
      return NextResponse.json({ ok: false, error: "Could not save document." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/documents/[id]", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_documents")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      logApiError("/api/documents/[id]", error, { stage: "delete" });
      return NextResponse.json(
        { ok: false, error: "Could not delete document." },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/documents/[id]", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
