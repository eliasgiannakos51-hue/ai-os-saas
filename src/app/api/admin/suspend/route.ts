import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { logAdminAction } from "@/lib/admin/audit-log";
import { isFeatureOn } from "@/lib/flags/flags";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";

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

  // READ, for the two questions above and for the audit row below. NOT for
  // the write: this route used to spread this snapshot back through
  // updateUserById, which replaces the whole object. Between the read and
  // the write anything another writer put in is gone, and the keys in the
  // gap are the ones the product gates on — subscription_tier,
  // stripe_subscription_id, seat_count, team_granted_tier. Stripe delivers
  // customer.subscription.updated and invoice.paid inside the same second
  // as two concurrent invocations, so suspending an account mid-webhook
  // could have wiped the plan it was paying for. mergeUserMetadata does the
  // merge in one statement, under that statement's row lock
  // (lib/auth/user-metadata.ts, migration 20260910000000).
  const existingMeta = targetUser.user.user_metadata ?? {};

  try {
    if (action === "suspend") {
      const merged = await mergeUserMetadata(
        userId,
        {
          suspended: true,
          suspended_reason: reason,
          suspended_at: new Date().toISOString(),
          suspended_by: user.email,
        },
        { context: "/api/admin/suspend" },
      );
      if (!merged) throw new Error("merge_user_metadata returned null");

      await logAdminAction(user.email!, "suspend_user", { reason }, userId);

      return NextResponse.json({ ok: true, action: "suspended" });
    } else {
      // `remove` runs BEFORE the patch merges, so the three reason keys go
      // and `suspended: false` lands in the same statement.
      const merged = await mergeUserMetadata(
        userId,
        { suspended: false },
        {
          remove: ["suspended_reason", "suspended_at", "suspended_by"],
          context: "/api/admin/suspend",
        },
      );
      if (!merged) throw new Error("merge_user_metadata returned null");

      await logAdminAction(user.email!, "unsuspend_user", { previousReason: existingMeta.suspended_reason ?? "" }, userId);

      return NextResponse.json({ ok: true, action: "unsuspended" });
    }
  } catch (err) {
    logApiError("/api/admin/suspend", err);
    return NextResponse.json({ ok: false, code: "update_failed" }, { status: 500 });
  }
}
