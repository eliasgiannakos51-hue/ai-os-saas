import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * Deleting one of THIS TOOL's OWN question/answer threads — never a row
 * in any other table. RLS on my_stuff_sessions (delete_own_my_stuff_sessions,
 * supabase/migrations/20261024100000_my_stuff_sessions.sql) is the real
 * control; `.eq("user_id", user.id)` beside it is belt-and-braces so the
 * count here is over the right rows even if a policy is ever loosened —
 * the same redundancy api/conversations/[id]/route.ts states for itself.
 */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  if (!id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error } = await supabase.from("my_stuff_sessions").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    logApiError("/api/my-stuff/sessions/[id]", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
