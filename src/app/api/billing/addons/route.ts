import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { logApiError } from "@/lib/log-error";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";
import {
  ADDONS,
  ADDON_SLUGS,
  addonAvailability,
  addonIsActive,
  checkPurchase,
  isAddonSlug,
} from "@/lib/billing/addons";
import { loadAddons } from "@/lib/billing/addon-store";

export const dynamic = "force-dynamic";

/**
 * BUYING AND CANCELLING AN ADD-ON.
 *
 * GET lists what is on offer on THIS deployment and what the account
 * already holds. An add-on whose Stripe price id is not configured is
 * reported as unavailable, with the env var named — the alternative is a
 * buy button that reaches Stripe with an undefined price and 500s, which
 * a customer reads as "this product is broken" rather than "this is not
 * set up".
 *
 * DELETE cancels a recurring add-on. It removes the Stripe subscription
 * item and marks the row cancelled with an expiry at the end of the paid
 * period — the entitlement survives until then, because taking it away on
 * click would be keeping their money and their agents.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const held = await loadAddons(user.id);
  const now = new Date();

  return NextResponse.json({
    addons: ADDON_SLUGS.map((slug) => {
      const spec = ADDONS[slug];
      const availability = addonAvailability(slug);
      const mine = held.filter((h) => h.slug === slug && addonIsActive(h, now));
      return {
        slug,
        priceEur: spec.priceEur,
        billing: spec.billing,
        stackable: spec.stackable,
        available: availability.available,
        // Named so the operator can fix it, and harmless to a customer:
        // it is the NAME of a variable, never its value.
        notConfiguredVar: availability.available ? null : availability.envVar,
        owned: mine.reduce((sum, h) => sum + (spec.stackable ? h.quantity : 1), 0),
        canBuy: availability.available && checkPurchase({ slug, held, now }).ok,
      };
    }),
  });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const limit = await checkRateLimit({
    scope: "addon-checkout",
    identifier: user.id,
    maxAttempts: 10,
    windowMinutes: 60,
  });
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  try {
    const body = (await request.json()) as { slug?: unknown };
    if (!isAddonSlug(body.slug)) return NextResponse.json({ error: "unknown_addon" }, { status: 400 });
    const slug = body.slug;
    const spec = ADDONS[slug];

    const availability = addonAvailability(slug);
    if (!availability.available) {
      return NextResponse.json(
        { error: "not_configured", detail: availability.envVar },
        { status: 503 }
      );
    }

    // NOT TWICE. Priority execution bought twice is twenty euros a month
    // for nothing, and a checkout that allows it is a refund request.
    const held = await loadAddons(user.id);
    const purchase = checkPurchase({ slug, held });
    if (!purchase.ok) return NextResponse.json({ error: purchase.reason }, { status: 409 });

    const stripe = createStripeClient();
    let customerId = user.user_metadata?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      // Merged, not replaced. This wrote `{ ...user.user_metadata,
      // stripe_customer_id }` from a snapshot taken at the top of the
      // request; a Stripe webhook or a team grant landing in that window was
      // erased by it. One key is all this route means to change.
      const merged = await mergeUserMetadata(
        user.id,
        { stripe_customer_id: customerId },
        { context: "/api/billing/addons" }
      );
      if (!merged)
        logApiError("/api/billing/addons", new Error("merge_user_metadata failed"), {
          stage: "persist_customer_id",
        });
    }

    const siteUrl = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      // A one-off pack is a payment; everything else is a monthly line.
      // Getting this backwards would either charge a subscription once or
      // bill a credit pack every month.
      mode: spec.billing === "one_off" ? "payment" : "subscription",
      customer: customerId,
      line_items: [{ price: availability.priceId, quantity: 1 }],
      success_url: `${siteUrl}/dashboard/settings?addon=success`,
      cancel_url: `${siteUrl}/dashboard/settings?addon=cancelled`,
      metadata: { supabase_user_id: user.id, addon_slug: slug },
      ...(spec.billing === "monthly"
        ? { subscription_data: { metadata: { supabase_user_id: user.id, addon_slug: slug } } }
        : {}),
    });

    if (!session.url) {
      logApiError("/api/billing/addons", new Error("Checkout session has no url"), { slug });
      return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    logApiError("/api/billing/addons", err, { stage: "checkout" });
    return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const slug = new URL(request.url).searchParams.get("slug");
    if (!isAddonSlug(slug)) return NextResponse.json({ error: "unknown_addon" }, { status: 400 });
    if (ADDONS[slug].billing === "one_off") {
      // A pack that has already been granted cannot be un-bought. Saying
      // so is more use than a cancel button that appears to work.
      return NextResponse.json({ error: "one_off_cannot_be_cancelled" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("account_addons")
      .select("id, stripe_subscription_item_id")
      .eq("user_id", user.id)
      .eq("addon_slug", slug)
      .eq("status", "active");
    if (error) throw error;
    if (!rows || rows.length === 0) return NextResponse.json({ error: "not_owned" }, { status: 404 });

    const stripe = createStripeClient();
    let periodEnd: string | null = null;

    for (const row of rows) {
      const itemId = row.stripe_subscription_item_id as string | null;
      if (!itemId) continue;
      try {
        // Removed at PERIOD END rather than immediately, so the customer
        // keeps what they have paid for. Stripe's own proration is left
        // alone: we are not issuing a refund, we are stopping the next
        // charge.
        const item = await stripe.subscriptionItems.retrieve(itemId);
        const subscription = await stripe.subscriptions.retrieve(String(item.subscription));
        const end = (subscription as unknown as { current_period_end?: number }).current_period_end;
        if (typeof end === "number") periodEnd = new Date(end * 1000).toISOString();
        await stripe.subscriptionItems.del(itemId);
      } catch (stripeError) {
        logApiError("/api/billing/addons", stripeError, { stage: "stripe_cancel", slug });
      }
    }

    const { error: markError } = await admin
      .from("account_addons")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        // NO PERIOD END MEANS IT ENDS NOW. An expiry we could not read is
        // not an excuse to keep granting something nobody is being billed
        // for any more.
        expires_at: periodEnd,
      })
      .eq("user_id", user.id)
      .eq("addon_slug", slug)
      .eq("status", "active");
    if (markError) throw markError;

    return NextResponse.json({ ok: true, expiresAt: periodEnd });
  } catch (err) {
    logApiError("/api/billing/addons", err, { stage: "cancel" });
    return NextResponse.json({ error: "cancel_failed" }, { status: 500 });
  }
}
