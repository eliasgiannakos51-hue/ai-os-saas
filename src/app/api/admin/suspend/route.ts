import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { logAdminAction } from "@/lib/admin/audit-log";
import { isFeatureOn } from "@/lib/flags/flags";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";
import { LIFT_BAN_DURATION, SUSPEND_BAN_DURATION, SUSPENSION_KEYS } from "@/lib/auth/suspension";

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

  // READ, for the two questions above and for the audit row below.
  const existingApp = targetUser.user.app_metadata ?? {};
  const existingMeta = targetUser.user.user_metadata ?? {};

  // A SUSPENSION THAT HOLDS (2026-11-05 review, A1; lib/auth/suspension.ts).
  // It used to be one key in user_metadata, which the account can rewrite
  // itself, and only the dashboard layout read it. Now, in one call to
  // Supabase Auth's admin API: a ban, so sign-in and token refresh are
  // refused, and app_metadata, which only the service role can write, so
  // the middleware can refuse the access token that is still alive.
  // app_metadata is MERGED by that API key by key (a null removes a key),
  // so nothing else the object carries is touched.
  try {
    if (action === "suspend") {
      const { error: banError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: SUSPEND_BAN_DURATION,
        app_metadata: {
          suspended: true,
          suspended_reason: reason,
          suspended_at: new Date().toISOString(),
          suspended_by: user.email,
        },
      });
      if (banError) throw banError;

      await logAdminAction(user.email!, "suspend_user", { reason }, userId);

      return NextResponse.json({ ok: true, action: "suspended" });
    } else {
      const { error: liftError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: LIFT_BAN_DURATION,
        app_metadata: Object.fromEntries(SUSPENSION_KEYS.map((k) => [k, null])),
      });
      if (liftError) throw liftError;

      // THE KEYS AN OLDER SUSPENSION WROTE INTO user_metadata, removed
      // through merge_user_metadata (lib/auth/user-metadata.ts) — one
      // statement under the row lock, so a Stripe webhook landing at the
      // same moment keeps the plan it wrote.
      if (SUSPENSION_KEYS.some((k) => k in existingMeta)) {
        const merged = await mergeUserMetadata(userId, {}, { remove: [...SUSPENSION_KEYS], context: "/api/admin/suspend" });
        if (!merged) throw new Error("merge_user_metadata returned null");
      }

      await logAdminAction(
        user.email!,
        "unsuspend_user",
        { previousReason: existingApp.suspended_reason ?? existingMeta.suspended_reason ?? "" },
        userId
      );

      return NextResponse.json({ ok: true, action: "unsuspended" });
    }
  } catch (err) {
    logApiError("/api/admin/suspend", err);
    return NextResponse.json({ ok: false, code: "update_failed" }, { status: 500 });
  }
}
