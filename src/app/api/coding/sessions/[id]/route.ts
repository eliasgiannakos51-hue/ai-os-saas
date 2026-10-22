import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE_CHARS = 200;

function refuse(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

/**
 * RENAMING AND DELETING ONE CODING SESSION (the owner's message right
 * after #332, 2026-10-22: the left sessions list needs an "⋯" with both).
 *
 * NO MIGRATION. code_sessions.title was already "a free-text label the
 * user chooses" with its own update policy and update grant since the
 * table was created (20260902000000_data_analysis_and_coding.sql) — the
 * comment there says so outright: "The user may rename it". This route
 * is the first thing that actually calls that path.
 *
 * The owner's own row only; the `.eq("user_id", user.id)` is what makes
 * a mismatched id 404 rather than 403 (RLS already enforces the same
 * boundary — this is belt and suspenders, matching every other session
 * route in this codebase, e.g. api/images/[id]/route.ts).
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse("invalid_body", 400);
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MAX_TITLE_CHARS) return refuse("invalid_title", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);

  const { data, error } = await supabase
    .from("code_sessions")
    .update({ title })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, title")
    .maybeSingle();
  if (error) {
    logApiError("/api/coding/sessions/[id]", error, { stage: "rename" });
    return refuse("rename_failed", 500);
  }
  if (!data) return refuse("not_found", 404);
  return NextResponse.json({ ok: true, id: data.id, title: data.title });
}

/** The owner's row only, same boundary as PATCH above. */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);

  const { data, error } = await supabase
    .from("code_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) {
    logApiError("/api/coding/sessions/[id]", error, { stage: "delete" });
    return refuse("delete_failed", 500);
  }
  if (!data) return refuse("not_found", 404);
  return NextResponse.json({ ok: true });
}
