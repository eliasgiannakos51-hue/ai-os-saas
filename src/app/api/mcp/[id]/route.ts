import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { deleteMcpServer } from "@/lib/mcp/store";

export const dynamic = "force-dynamic";

/** Remove one of the caller's apps, and the token stored with it. */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
  try {
    const { id } = await ctx.params;
    const removed = await deleteMcpServer(user.id, id);
    return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
  } catch (err) {
    logApiError("/api/mcp/[id]", err);
    return NextResponse.json({ ok: false, code: "delete_failed" }, { status: 500 });
  }
}
