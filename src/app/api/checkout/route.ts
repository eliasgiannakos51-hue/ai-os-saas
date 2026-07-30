import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { isPaidPlanSlug } from "@/lib/billing/plans";
import { getPlanPriceId, getTeamSeatPriceId } from "@/lib/billing/price-ids";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let plan: string;
    try {
      const body = await request.json();
      plan = typeof body?.plan === "string" ? body.plan : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!isPaidPlanSlug(plan)) {
      return NextResponse.json(
        { ok: false, error: "Unknown or unsupported plan." },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const planPriceId = getPlanPriceId(plan);
    const teamSeatPriceId = getTeamSeatPriceId();
    if (!planPriceId || !teamSeatPriceId) {
      logApiError("/api/checkout", new Error("Missing Stripe price id env var"), { plan });
      return NextResponse.json(
        { ok: false, error: "Billing is not configured yet." },
        { status: 500 }
      );
    }

    const stripe = createStripeClient();

    // Reuse the Stripe customer already linked to this user (set the first
    // time they ever checked out), or create one and persist its id so
    // every future checkout/portal/webhook call can find it again.
    let customerId = user.user_metadata?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      const admin = createAdminClient();
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, stripe_customer_id: customerId },
      });
      if (updateError) {
        logApiError("/api/checkout", updateError, { stage: "persist_customer_id" });
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      allow_promotion_codes: true,
      line_items: [
        { price: planPriceId, quantity: 1 },
        {
          price: teamSeatPriceId,
          quantity: 0,
          adjustable_quantity: { enabled: true, minimum: 0, maximum: 50 },
        },
      ],
      success_url: `${siteUrl}/dashboard/settings?checkout=success`,
      cancel_url: `${siteUrl}/pricing?checkout=cancelled`,
      metadata: { supabase_user_id: user.id, plan },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan },
      },
    });

    if (!session.url) {
      logApiError("/api/checkout", new Error("Checkout session has no url"), { plan });
      return NextResponse.json(
        { ok: false, error: "Could not start checkout. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    logApiError("/api/checkout", err);
    return NextResponse.json(
      { ok: false, error: "Could not start checkout. Please try again." },
      { status: 500 }
    );
  }
}
