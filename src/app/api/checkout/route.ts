import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { getPlan, isPaidPlanSlug } from "@/lib/billing/plans";
import { getPlanPriceId, getTeamSeatPriceId } from "@/lib/billing/price-ids";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let plan: string;
    let discountCode: string;
    let successPath: string;
    try {
      const body = await request.json();
      plan = typeof body?.plan === "string" ? body.plan : "";
      discountCode = typeof body?.discountCode === "string" ? body.discountCode.trim() : "";
      successPath =
        typeof body?.successPath === "string" && body.successPath.startsWith("/")
          ? body.successPath
          : "/dashboard/settings?checkout=success";
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

    const planDefinition = getPlan(plan);
    const planPriceId = getPlanPriceId(plan);
    // Team seats are only a real add-on for plans that support team
    // collaboration (professional/ultimate) — Starter/Growth checkouts must
    // not fail just because STRIPE_PRICE_TEAM_SEAT isn't set, since they
    // never use it.
    const teamSeatPriceId = planDefinition?.hasTeamSeats ? getTeamSeatPriceId() : undefined;
    if (!planPriceId || (planDefinition?.hasTeamSeats && !teamSeatPriceId)) {
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

    // Stripe's own "Add promotion code" field (allow_promotion_codes) and a
    // pre-applied discount (discounts) are mutually exclusive on a Checkout
    // Session — a code typed in the signup flow resolves to a Stripe
    // promotion_code id and pre-applies it; with no code, fall back to
    // letting Stripe show its own entry field, same as before this existed.
    let discounts: { promotion_code: string }[] | undefined;
    if (discountCode) {
      const matches = await stripe.promotionCodes.list({
        code: discountCode,
        active: true,
        limit: 1,
      });
      const promo = matches.data[0];
      if (promo) {
        discounts = [{ promotion_code: promo.id }];
      }
      // An unrecognized code is ignored rather than failing checkout — the
      // user can still enter it manually via allow_promotion_codes below.
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      line_items: [
        { price: planPriceId, quantity: 1 },
        ...(teamSeatPriceId
          ? [
              {
                price: teamSeatPriceId,
                quantity: 0,
                adjustable_quantity: { enabled: true, minimum: 0, maximum: 50 },
              },
            ]
          : []),
      ],
      success_url: `${siteUrl}${successPath}`,
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
