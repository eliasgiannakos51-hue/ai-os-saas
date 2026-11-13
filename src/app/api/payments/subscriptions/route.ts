import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { logApiError } from "@/lib/log-error";
import { getPaymentsAccount } from "@/lib/payments/connect";
import {
  listSubscriptions,
  cancelSubscription,
  subscriptionMetrics,
} from "@/lib/payments/subscriptions";

export const dynamic = "force-dynamic";

/**
 * GET    /api/payments/subscriptions         — list all subscriptions.
 * DELETE /api/payments/subscriptions?id=X    — cancel a subscription.
 */

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const admin = createAdminClient();
    const [subscriptions, metrics] = await Promise.all([
      listSubscriptions(admin, user.id),
      subscriptionMetrics(admin, user.id),
    ]);
    return NextResponse.json({ subscriptions, metrics });
  } catch (err) {
    logApiError("api/payments/subscriptions:GET", err);
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
    const stripeSubId = url.searchParams.get("id");
    if (!stripeSubId) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }

    const immediately = url.searchParams.get("immediately") === "true";

    const admin = createAdminClient();
    const account = await getPaymentsAccount(admin, user.id);
    if (!account) {
      return NextResponse.json({ error: "no_account" }, { status: 400 });
    }

    // Verify this subscription belongs to this user. The admin client
    // bypasses RLS, so ownership is established by filtering on user_id.
    // @ownership-check: listSubscriptions scopes to userId as its second arg.
    const subs = await listSubscriptions(admin, user.id);
    const sub = subs.find((s) => s.stripe_subscription_id === stripeSubId);
    // Double-check: the row's user_id must equal the caller's.
    if (sub && sub.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!sub) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const result = await cancelSubscription({
      account,
      stripeSubscriptionId: stripeSubId,
      immediately,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("api/payments/subscriptions:DELETE", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
