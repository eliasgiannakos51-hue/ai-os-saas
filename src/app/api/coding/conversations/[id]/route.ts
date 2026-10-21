import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * DELETING A CODING CONVERSATION — the one action its [◧] history panel
 * offers beyond opening one, on purpose: the owner's own spec for it is
 * «[◧] για τη λίστα με τις προηγούμενες δουλειές του Coding, όπως στο
 * Chat, και "Νέο"», not the four-action «⋯» menu he spelled out in full
 * for Chat's own column. No rename, no pin, no move, no Undo window —
 * a confirm and a delete, the same weight the old code_sessions UI's
 * own history list carried.
 *
 * RLS already makes this safe (code_conversations' delete policy is
 * `user_id = auth.uid()`); the explicit .eq below is belt-and-braces so
 * the response code is right even if a policy is ever loosened, the
 * same reasoning api/conversations/[id]/route.ts states for chat's own
 * equivalent check.
 *
 * code_messages cascades with it (conversation_id references ... on
 * delete cascade, in the table's own migration) — deleting the parent
 * row is enough.
 */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, code: "not_authenticated" }, { status: 401 });

    const { data: found } = await supabase
      .from("code_conversations")
      .select("id")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!found) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });

    const { error } = await supabase.from("code_conversations").delete().eq("id", params.id).eq("user_id", user.id);
    if (error) {
      logApiError("/api/coding/conversations/[id]", error, { stage: "delete" });
      return NextResponse.json({ ok: false, code: "delete_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/coding/conversations/[id]", err);
    return NextResponse.json({ ok: false, code: "unexpected" }, { status: 500 });
  }
}
