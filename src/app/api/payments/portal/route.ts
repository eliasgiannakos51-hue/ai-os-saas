import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { logApiError } from "@/lib/log-error";
import { getPaymentsAccount } from "@/lib/payments/connect";
import { createCustomerPortal } from "@/lib/payments/subscriptions";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/portal — create a Stripe Customer Portal session
 * for a subscriber to manage their own subscriptions (cancel, update
 * payment method, view invoices).
 *
 * Body: { stripeCustomerId: string, returnUrl?: string }
 *
 * The portal lives on Stripe's own domain, fully hosted. The seller's
 * connected account's portal settings (branding, cancellation flows)
 * apply automatically through the stripeAccount header.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const admin = createAdminClient();
    if (!await isFeatureOn("ionexa-payments", user)) {
      return NextResponse.json({ error: "feature_disabled" }, { status: 403 });
    }

    const account = await getPaymentsAccount(admin, user.id);
    if (!account || account.user_id !== user.id) {
      return NextResponse.json({ error: "no_payments_account" }, { status: 400 });
    }

    const body = await request.json() as { stripeCustomerId?: string; returnUrl?: string };
    const stripeCustomerId = String(body.stripeCustomerId ?? "");
    if (!stripeCustomerId) {
      return NextResponse.json({ error: "missing_customer_id" }, { status: 400 });
    }

    const result = await createCustomerPortal({
      account,
      stripeCustomerId,
      returnUrl: body.returnUrl || undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ ok: true, url: result.url });
  } catch (err) {
    logApiError("api/payments/portal", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
