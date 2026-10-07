import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";
import { isFlagAudience, isFlagKey } from "@/lib/flags/flags";

export const dynamic = "force-dynamic";

/**
 * THE OWNER TURNS ONE SWITCH (MASTER Μέρος 13 Β): 'off', 'staff' or
 * 'everyone', for a key the code declares (src/lib/flags/flags.ts).
 * Owner-only, and a 404 to anyone else, as the page it sits on.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { key?: unknown; audience?: unknown } | null;
  if (!isFlagKey(body?.key) || !isFlagAudience(body?.audience)) {
    return NextResponse.json({ ok: false, code: "bad_switch" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("feature_flags")
    .upsert({ key: body.key, audience: body.audience, updated_at: new Date().toISOString(), updated_by: user.email ?? null });
  if (error) {
    logApiError("/api/system-health/flags", error);
    return NextResponse.json({ ok: false, code: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
