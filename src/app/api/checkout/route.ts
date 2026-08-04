import { NextResponse } from "next/server";
import { diagLog } from "@/lib/diag";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { getPlan, isPaidPlanSlug } from "@/lib/billing/plans";
import { getPlanPriceId, getTeamSeatPriceId } from "@/lib/billing/price-ids";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const CHECKOUT_MAX_ATTEMPTS = 10;
const CHECKOUT_WINDOW_MINUTES = 60;

// "MISSING" / "EMPTY" / "set (len=N, prefix='price_12…')" — never the full
// value, safe for production logs.
function maskEnvVar(value: string | undefined): string {
  if (value === undefined) return "MISSING (env var not set)";
  if (value.trim() === "") return "EMPTY (env var set to empty string)";
  return `set (len=${value.length}, prefix='${value.slice(0, 8)}…')`;
}

export async function POST(request: Request) {
  try {
    let plan: string;
    let discountCode: string;
    let successPath: string;
    try {
      const body = await request.json();
      plan = typeof body?.plan === "string" ? body.plan : "";
      discountCode =
        typeof body?.discountCode === "string" ? body.discountCode.trim().slice(0, 100) : "";
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

    const { allowed } = await checkRateLimit({
      scope: "checkout",
      identifier: user.id,
      maxAttempts: CHECKOUT_MAX_ATTEMPTS,
      windowMinutes: CHECKOUT_WINDOW_MINUTES,
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many checkout attempts. Please try again later." },
        { status: 429 }
      );
    }

    const planDefinition = getPlan(plan);
    const planPriceId = getPlanPriceId(plan);
    // Team seats are only a paid, purchasable add-on for plans that both
    // support team collaboration AND don't already include seats for free
    // (Professional: pay-per-seat; Ultimate/Enterprise: teamSeatsIncluded,
    // no line item needed at all — see lib/billing/plans.ts). Starter/
    // Growth checkouts must not fail just because STRIPE_PRICE_TEAM_SEAT
    // isn't set, since they never use it either.
    const needsPaidTeamSeats = Boolean(planDefinition?.hasTeamSeats && !planDefinition.teamSeatsIncluded);
    const teamSeatPriceId = needsPaidTeamSeats ? getTeamSeatPriceId() : undefined;
    if (!planPriceId || (needsPaidTeamSeats && !teamSeatPriceId)) {
      // Masked (never the real value) so this is safe to leave in
      // production logs — tells you exactly which env var is the problem
      // without needing to reproduce with real Stripe keys locally.
      // eslint-disable-next-line no-console
      console.error(
        "[checkout] Billing is not configured yet. — env var check:",
        JSON.stringify({
          plan,
          hasTeamSeats: planDefinition?.hasTeamSeats ?? null,
          STRIPE_SECRET_KEY: maskEnvVar(process.env.STRIPE_SECRET_KEY),
          STRIPE_PRICE_STARTER: maskEnvVar(process.env.STRIPE_PRICE_STARTER),
          STRIPE_PRICE_GROWTH: maskEnvVar(process.env.STRIPE_PRICE_GROWTH),
          STRIPE_PRICE_PROFESSIONAL: maskEnvVar(process.env.STRIPE_PRICE_PROFESSIONAL),
          STRIPE_PRICE_ULTIMATE: maskEnvVar(process.env.STRIPE_PRICE_ULTIMATE),
          STRIPE_PRICE_TEAM_SEAT: maskEnvVar(process.env.STRIPE_PRICE_TEAM_SEAT),
          resolvedPlanPriceId: maskEnvVar(planPriceId),
          resolvedTeamSeatPriceId: maskEnvVar(teamSeatPriceId),
        })
      );
      logApiError("/api/checkout", new Error("Missing Stripe price id env var"), { plan });
      return NextResponse.json(
        { ok: false, error: "Billing is not configured yet." },
        { status: 500 }
      );
    }

    // TEMPORARY diagnostic logging for the "Business signup flow doesn't
    // work end-to-end" investigation — logs the exact resolved checkout
    // shape right before Stripe is called, since this sandbox has no
    // network path to api.stripe.com to reproduce it directly. Safe to
    // remove once confirmed live.
    diagLog(`[checkout-diag] plan=${plan} userId=${user.id} successPath=${successPath} needsPaidTeamSeats=${needsPaidTeamSeats} teamSeatPriceId=${maskEnvVar(teamSeatPriceId)} planPriceId=${maskEnvVar(planPriceId)}`);

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

    const siteUrl = getSiteUrl();

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

    diagLog(`[checkout-diag] session created id=${session.id} url=${session.url ? "present" : "MISSING"} success_url=${session.success_url}`);

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
