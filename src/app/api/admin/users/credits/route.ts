import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";
import { logAdminAction } from "@/lib/admin/audit-log";
import { grantCredits } from "@/lib/billing/credits";
import { isFeatureOn } from "@/lib/flags/flags";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });

  const on = await isFeatureOn("admin-dashboard", user);
  if (!on) return NextResponse.json({ ok: false }, { status: 404 });

  let body: { userId?: string; amount?: number; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "bad_json" }, { status: 400 });
  }

  const { userId, amount, reason } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ ok: false, code: "missing_user_id" }, { status: 400 });
  }
  if (typeof amount !== "number" || amount === 0 || !Number.isFinite(amount)) {
    return NextResponse.json({ ok: false, code: "invalid_amount" }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    return NextResponse.json({ ok: false, code: "missing_reason" }, { status: 400 });
  }

  try {
    const result = await grantCredits(
      userId,
      amount,
      "admin_adjustment",
      `[Admin: ${user.email}] ${reason.trim()}`,
    );

    await logAdminAction(user.email!, "adjust_credits", {
      userId,
      amount,
      reason: reason.trim(),
      creditsAfter: result.creditsRemaining,
    });

    return NextResponse.json({
      ok: true,
      creditsRemaining: result.creditsRemaining,
    });
  } catch (err) {
    logApiError("/api/admin/users/credits", err);
    return NextResponse.json({ ok: false, code: "adjustment_failed" }, { status: 500 });
  }
}
