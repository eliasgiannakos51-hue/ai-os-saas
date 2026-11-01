import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/auth/admin-emails";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { logApiError } from "@/lib/log-error";
import { logAdminAction } from "@/lib/admin/audit-log";
import { isFeatureOn } from "@/lib/flags/flags";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isOwnerEmail(user.email))
    return NextResponse.json({ ok: false }, { status: 404 });
  const on = await isFeatureOn("admin-dashboard", user);
  if (!on) return NextResponse.json({ ok: false }, { status: 404 });

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId)
    return NextResponse.json({ ok: false, code: "missing_user_id" }, { status: 400 });

  const admin = createAdminClient();
  const { data: targetUser } = await admin.auth.admin.getUserById(userId);
  if (!targetUser?.user)
    return NextResponse.json({ ok: false, code: "user_not_found" }, { status: 404 });

  const customerId = targetUser.user.user_metadata?.stripe_customer_id as
    | string
    | undefined;
  if (!customerId)
    return NextResponse.json({ ok: true, charges: [] });

  try {
    const stripe = createStripeClient();
    const charges = await stripe.charges.list({
      customer: customerId,
      limit: 20,
    });

    return NextResponse.json({
      ok: true,
      charges: charges.data.map((c) => ({
        id: c.id,
        paymentIntentId: c.payment_intent,
        amount: c.amount,
        currency: c.currency,
        status: c.status,
        refunded: c.refunded,
        amountRefunded: c.amount_refunded,
        created: c.created,
        description: c.description,
      })),
    });
  } catch (err) {
    logApiError("/api/admin/refund:GET", err);
    return NextResponse.json({ ok: false, code: "stripe_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isOwnerEmail(user.email))
    return NextResponse.json({ ok: false }, { status: 404 });
  const on = await isFeatureOn("admin-dashboard", user);
  if (!on) return NextResponse.json({ ok: false }, { status: 404 });

  let body: {
    paymentIntentId?: string;
    amountCents?: number;
    reason?: string;
    userId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "bad_json" }, { status: 400 });
  }

  const { paymentIntentId, amountCents, reason, userId } = body;

  if (!paymentIntentId || typeof paymentIntentId !== "string")
    return NextResponse.json(
      { ok: false, code: "missing_payment_intent" },
      { status: 400 },
    );
  if (!reason || typeof reason !== "string" || reason.trim().length < 3)
    return NextResponse.json(
      { ok: false, code: "missing_reason" },
      { status: 400 },
    );

  try {
    const stripe = createStripeClient();

    const params: { payment_intent: string; reason: "requested_by_customer"; amount?: number } = {
      payment_intent: paymentIntentId,
      reason: "requested_by_customer",
    };
    if (typeof amountCents === "number" && amountCents > 0) {
      params.amount = amountCents;
    }

    const refund = await stripe.refunds.create(params);

    await logAdminAction(user.email!, "refund", {
      paymentIntentId,
      amountCents: refund.amount,
      currency: refund.currency,
      reason: reason.trim(),
      refundId: refund.id,
      targetUserId: userId,
    }, userId);

    return NextResponse.json({
      ok: true,
      refundId: refund.id,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
    });
  } catch (err) {
    logApiError("/api/admin/refund:POST", err);
    const message =
      err instanceof Error ? err.message : "Refund failed";
    return NextResponse.json(
      { ok: false, code: "refund_failed", message },
      { status: 500 },
    );
  }
}
