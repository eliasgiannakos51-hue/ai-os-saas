import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { getCreditPack } from "@/lib/billing/plans";
import { getCreditPackPriceId } from "@/lib/billing/price-ids";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const CREDITS_CHECKOUT_MAX_ATTEMPTS = 10;
const CREDITS_CHECKOUT_WINDOW_MINUTES = 60;

// One-time credit pack purchase — mode: "payment", not a subscription.
// Credits are granted on the "checkout.session.completed" webhook event
// for a payment-mode session (see api/webhooks/stripe/route.ts), never
// here directly, so a closed tab or a slow redirect can't lose the grant.
export async function POST(request: Request) {
  try {
    let packId: string;
    try {
      const body = await request.json();
      packId = typeof body?.packId === "string" ? body.packId : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const pack = getCreditPack(packId);
    if (!pack) {
      return NextResponse.json({ ok: false, error: "Unknown credit pack." }, { status: 400 });
    }

    const priceId = getCreditPackPriceId(pack.id);
    if (!priceId) {
      logApiError("/api/credits/checkout", new Error("Missing Stripe price id env var"), {
        packId: pack.id,
      });
      return NextResponse.json({ ok: false, error: "Billing is not configured yet." }, { status: 500 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { allowed } = await checkRateLimit({
      scope: "credits_checkout",
      identifier: user.id,
      maxAttempts: CREDITS_CHECKOUT_MAX_ATTEMPTS,
      windowMinutes: CREDITS_CHECKOUT_WINDOW_MINUTES,
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many checkout attempts. Please try again later." },
        { status: 429 }
      );
    }

    const stripe = createStripeClient();

    // Reuse the Stripe customer already linked to this user (set on first
    // ever checkout, plan or credits), or create one and persist its id.
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
        logApiError("/api/credits/checkout", updateError, { stage: "persist_customer_id" });
      }
    }

    const siteUrl = getSiteUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/dashboard/settings?credits=success`,
      cancel_url: `${siteUrl}/dashboard/settings?credits=cancelled`,
      metadata: { supabase_user_id: user.id, credit_pack_id: pack.id, credit_amount: String(pack.credits) },
    });

    if (!session.url) {
      logApiError("/api/credits/checkout", new Error("Checkout session has no url"), { packId: pack.id });
      return NextResponse.json({ ok: false, error: "Could not start checkout. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    logApiError("/api/credits/checkout", err);
    return NextResponse.json({ ok: false, error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
