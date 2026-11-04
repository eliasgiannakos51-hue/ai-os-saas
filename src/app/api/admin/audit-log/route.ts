import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";
import { readAuditLog } from "@/lib/admin/audit-log";
import { isFeatureOn } from "@/lib/flags/flags";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });

  const on = await isFeatureOn("admin-dashboard", user);
  if (!on) return NextResponse.json({ ok: false }, { status: 404 });

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  try {
    const entries = await readAuditLog({ limit, offset });
    return NextResponse.json({ ok: true, entries });
  } catch (err) {
    logApiError("/api/admin/audit-log:GET", err);
    return NextResponse.json({ ok: false, code: "load_failed" }, { status: 500 });
  }
}
