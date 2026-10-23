import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectGitHub } from "@/lib/github/store";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const result = await disconnectGitHub(user.id);
    return NextResponse.json({ ok: result.ok });
  } catch (err) {
    logApiError("/api/github/disconnect", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
