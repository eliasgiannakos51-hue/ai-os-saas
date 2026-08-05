import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isFavoritableTable } from "@/lib/favoritable";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Toggle a single record's favorite state. No AI call, no credit cost —
// same free-to-use reasoning as entity-links (lib/favorites.ts's
// user_favorites table). Idempotent both ways: favoriting an already-
// favorited record just returns favorited:true again rather than erroring
// (the unique(user_id, table_name, record_id) constraint is the real
// guard against duplicates, this just avoids surfacing that as a 500).
export async function POST(request: Request) {
  try {
    let table: string;
    let recordId: string;
    try {
      const body = await request.json();
      table = typeof body?.table === "string" ? body.table : "";
      recordId = typeof body?.recordId === "string" ? body.recordId : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!table || !recordId || !isFavoritableTable(table)) {
      return NextResponse.json({ ok: false, error: "Invalid record." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("user_favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("table_name", table)
      .eq("record_id", recordId)
      .maybeSingle();

    if (existingError) {
      logApiError("/api/favorites/toggle", existingError, { stage: "check_existing" });
      return NextResponse.json({ ok: false, error: "Could not update favorite." }, { status: 500 });
    }

    if (existing) {
      const { error: deleteError } = await supabase
        .from("user_favorites")
        .delete()
        .eq("id", existing.id);
      if (deleteError) {
        logApiError("/api/favorites/toggle", deleteError, { stage: "delete" });
        return NextResponse.json({ ok: false, error: "Could not remove favorite." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, favorited: false });
    }

    const { error: insertError } = await supabase
      .from("user_favorites")
      .insert({ user_id: user.id, table_name: table, record_id: recordId });
    if (insertError) {
      // Unique-constraint race (double-click) — the record is favorited
      // either way, so this isn't a real failure from the caller's view.
      if (insertError.code === "23505") {
        return NextResponse.json({ ok: true, favorited: true });
      }
      logApiError("/api/favorites/toggle", insertError, { stage: "insert" });
      return NextResponse.json({ ok: false, error: "Could not save favorite." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, favorited: true });
  } catch (err) {
    logApiError("/api/favorites/toggle", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
