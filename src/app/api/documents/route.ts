import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Creates a blank document and returns its id — the editor page then loads
// it and the client takes over from there via PATCH /api/documents/[id].
// No AI call, no credit cost: this is user-authored freeform text, not a
// generated artifact.
export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { allowed } = await checkRateLimit({
      scope: "documents_create",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many documents created. Please try again later." },
        { status: 429 }
      );
    }

    const { data, error } = await supabase
      .from("user_documents")
      .insert({ user_id: user.id, title: "Untitled", content: { html: "" } })
      .select("id")
      .single();

    if (error || !data) {
      logApiError("/api/documents", error, { stage: "insert" });
      return NextResponse.json(
        { ok: false, error: "Could not create document." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    logApiError("/api/documents", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
