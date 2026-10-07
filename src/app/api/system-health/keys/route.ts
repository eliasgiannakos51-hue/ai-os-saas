import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { KEY_INVENTORY, checkKey } from "@/lib/ai/providers/key-inventory";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * "Which of my keys actually work?" — asked from INSIDE the deployment,
 * because that is where the keys live (Vercel), and the build environment
 * has none of them.
 *
 * One free read per provider (lib/ai/providers/key-inventory.ts says which
 * call, and why it costs nothing), all at once. The response carries the
 * variable NAME, a status word and the HTTP code; the values never leave
 * this function. Owner-only, like the rest of /dashboard/system-health,
 * and a 404 to anybody else so the route does not advertise itself.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });

  try {
    const results = await Promise.all(KEY_INVENTORY.map((entry) => checkKey(entry, process.env)));
    return NextResponse.json(
      { ok: true, checkedAt: new Date().toISOString(), results },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    // checkKey turns every provider failure into a status, so reaching
    // here is a bug in this route, not a bad key. The error is logged; the
    // response says only that the check did not run.
    logApiError("/api/system-health/keys", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
