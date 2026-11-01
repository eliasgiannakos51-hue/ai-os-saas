import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { logAdminAction } from "@/lib/admin/audit-log";
import { isFeatureOn } from "@/lib/flags/flags";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isAdminEmail(user.email))
    return NextResponse.json({ ok: false }, { status: 404 });
  const on = await isFeatureOn("admin-dashboard", user);
  if (!on) return NextResponse.json({ ok: false }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "bad_json" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const action = body.action as string;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!userId) return NextResponse.json({ ok: false, code: "missing_user_id" }, { status: 400 });
  if (action !== "suspend" && action !== "unsuspend")
    return NextResponse.json({ ok: false, code: "invalid_action" }, { status: 400 });
  if (action === "suspend" && reason.length < 3)
    return NextResponse.json({ ok: false, code: "reason_required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: targetUser, error: fetchErr } = await admin.auth.admin.getUserById(userId);
  if (fetchErr || !targetUser?.user)
    return NextResponse.json({ ok: false, code: "user_not_found" }, { status: 404 });

  if (isAdminEmail(targetUser.user.email))
    return NextResponse.json({ ok: false, code: "cannot_suspend_admin" }, { status: 400 });

  const existingMeta = targetUser.user.user_metadata ?? {};

  try {
    if (action === "suspend") {
      const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingMeta,
          suspended: true,
          suspended_reason: reason,
          suspended_at: new Date().toISOString(),
          suspended_by: user.email,
        },
      });
      if (updateErr) throw updateErr;

      await logAdminAction(user.email!, "suspend_user", { reason }, userId);

      return NextResponse.json({ ok: true, action: "suspended" });
    } else {
      const { suspended: _s, suspended_reason: _r, suspended_at: _a, suspended_by: _b, ...cleanMeta } = existingMeta;
      const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...cleanMeta, suspended: false },
      });
      if (updateErr) throw updateErr;

      await logAdminAction(user.email!, "unsuspend_user", { previousReason: existingMeta.suspended_reason ?? "" }, userId);

      return NextResponse.json({ ok: true, action: "unsuspended" });
    }
  } catch (err) {
    logApiError("/api/admin/suspend", err);
    return NextResponse.json({ ok: false, code: "update_failed" }, { status: 500 });
  }
}
