import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { logApiError } from "@/lib/log-error";
import { getPaymentsAccount } from "@/lib/payments/connect";
import { listCoupons, createCoupon, deactivateCoupon } from "@/lib/payments/coupons";

export const dynamic = "force-dynamic";

/**
 * GET    /api/payments/coupons       — list the user's coupons.
 * POST   /api/payments/coupons       — create a new coupon.
 * DELETE /api/payments/coupons?id=X  — deactivate a coupon.
 */

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const admin = createAdminClient();
    const coupons = await listCoupons(admin, user.id);
    return NextResponse.json({ coupons });
  } catch (err) {
    logApiError("api/payments/coupons:GET", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const admin = createAdminClient();
    const account = await getPaymentsAccount(admin, user.id);
    if (!account) return NextResponse.json({ error: "no_account" }, { status: 400 });

    const body = await req.json();
    const result = await createCoupon(admin, account, {
      code: String(body.code ?? ""),
      percentOff: body.percentOff ? Number(body.percentOff) : undefined,
      amountOffCents: body.amountOffCents ? Number(body.amountOffCents) : undefined,
      currency: body.currency,
      duration: body.duration,
      durationMonths: body.durationMonths ? Number(body.durationMonths) : undefined,
      maxRedemptions: body.maxRedemptions ? Number(body.maxRedemptions) : undefined,
    });

    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ coupon: result.coupon });
  } catch (err) {
    logApiError("api/payments/coupons:POST", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const url = new URL(req.url);
    const couponId = url.searchParams.get("id");
    if (!couponId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const admin = createAdminClient();
    const account = await getPaymentsAccount(admin, user.id);
    if (!account) return NextResponse.json({ error: "no_account" }, { status: 400 });

    // Ownership: verify the coupon belongs to this user before deactivating.
    const coupons = await listCoupons(admin, user.id);
    const coupon = coupons.find((c) => c.id === couponId);
    if (!coupon || coupon.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const result = await deactivateCoupon(admin, account, couponId);
    if (!result.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("api/payments/coupons:DELETE", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
