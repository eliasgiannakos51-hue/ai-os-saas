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
  addonOffered,
  addonAvailability,
  addonIsActive,
  checkPurchase,
  isAddonSlug,
  type AddonSlug,
} from "@/lib/billing/addons";
import { loadAddons } from "@/lib/billing/addon-store";
import { currentPeriodEndIso } from "@/lib/billing/subscription-period";

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
 * DELETE cancels a recurring add-on. It sets the add-on's own Stripe
 * subscription to cancel at period end and marks the row cancelled with an
 * expiry at the end of the paid period — the entitlement survives until
 * then, because taking it away on click would be keeping their money and
 * their agents.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const held = await loadAddons(user.id);
  const now = new Date();

  return NextResponse.json({
    // A withdrawn add-on (lib/billing/addons.ts) is listed only to an
    // account that holds one, so it can still be cancelled.
    addons: ADDON_SLUGS.filter(
      (slug) => addonOffered(slug) || held.some((h) => h.slug === slug && addonIsActive(h, now))
    ).map((slug) => {
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
        canBuy: addonOffered(slug) && availability.available && checkPurchase({ slug, held, now }).ok,
      };
    }),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
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
    // Withdrawn from sale (NEEDS 17): refused here, not only hidden.
    if (!addonOffered(slug)) return NextResponse.json({ error: "withdrawn" }, { status: 410 });

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
  const supabase = await createClient();
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
    const customerId =
      typeof user.user_metadata?.stripe_customer_id === "string" ? user.user_metadata.stripe_customer_id : null;
    // A subscription already matched to one row is not matched to another,
    // so two held agents_5 add-ons are two cancellations, not one twice.
    const claimed = new Set<string>();
    // Row id -> when its paid period ends (null: it has already ended).
    const ends = new Map<string, string | null>();

    for (const row of rows) {
      let itemId = row.stripe_subscription_item_id as string | null;
      let subscriptionId: string | null = null;

      // A NULL ITEM ID ON A RECURRING ADD-ON IS THE SAME DEFECT AS A
      // STRIPE FAILURE, AND IT USED TO `continue`.
      //
      // The handler refuses one-off add-ons at the top, so by here the
      // slug is always monthly, and a recurring add-on HAS a subscription
      // of its own. So a null here is never "nothing to stop": it is the
      // link being lost, and skipping it fell straight through to the
      // update below, marking the row cancelled while the subscription
      // lived on. The product stops delivering and the card goes on
      // paying.
      //
      // HOW IT GETS LOST: api/webhooks/stripe reads the item out of the
      // session's subscription inside a try, and on failure logs and
      // inserts the row anyway with null. That is the right call for the
      // entitlement — the customer has paid — and it leaves this to
      // recover, which it can: the add-on's own subscription is found
      // among the customer's by its metadata.
      if (!itemId) {
        const found = await recoverAddonSubscription(stripe, { userId: user.id, customerId }, slug, claimed);
        if (!found) {
          logApiError("/api/billing/addons", new Error("recurring add-on has no resolvable subscription"), {
            stage: "recover_item",
            slug,
            rowId: row.id,
          });
          return NextResponse.json(
            {
              ok: false,
              error:
                "Could not find the billing line for this add-on, so it has been left active rather than cancelled here and charged in Stripe. Nothing has changed — please contact support.",
            },
            { status: 502 }
          );
        }
        itemId = found.itemId;
        subscriptionId = found.subscriptionId;
        // Write it back, so the next cancellation does not have to
        // rediscover it and so the row stops lying about what it knows.
        await admin.from("account_addons").update({ stripe_subscription_item_id: itemId }).eq("id", row.id);
      }

      try {
        // THROUGH THE ADD-ON'S OWN SUBSCRIPTION (2026-11-05, ΑΣ-4.17).
        // This deleted the subscription ITEM, and the item is the only one
        // on the add-on's subscription — which Stripe refuses, so the
        // cancel never worked. The add-on's subscription is set to cancel
        // at the end of the period already paid for: no refund, no next
        // charge, and the entitlement lasts until that end.
        if (!subscriptionId) {
          const item = await stripe.subscriptionItems.retrieve(itemId);
          subscriptionId = String(item.subscription);
        }
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        // ONLY THAT SUBSCRIPTION. An item that leads anywhere else — the
        // plan's subscription above all — is refused, never cancelled.
        if (subscription.metadata?.addon_slug !== slug || subscription.metadata?.supabase_user_id !== user.id) {
          logApiError("/api/billing/addons", new Error("add-on item is not on the add-on's own subscription"), {
            stage: "verify_subscription",
            slug,
            rowId: row.id,
          });
          return NextResponse.json(
            {
              ok: false,
              error:
                "Could not find the billing line for this add-on, so it has been left active rather than cancelled here and charged in Stripe. Nothing has changed — please contact support.",
            },
            { status: 502 }
          );
        }
        claimed.add(subscription.id);
        if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
          ends.set(row.id, null);
          continue;
        }
        const updated = subscription.cancel_at_period_end
          ? subscription
          : await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
        ends.set(row.id, currentPeriodEndIso(updated));
      } catch (stripeError) {
        logApiError("/api/billing/addons", stripeError, { stage: "stripe_cancel", slug });
        // A STRIPE FAILURE MUST NOT BE FOLLOWED BY A LOCAL CANCELLATION.
        //
        // This used to log and fall through to the update below, so the
        // row said "cancelled" while the subscription lived on: the
        // product stopped delivering the add-on and the card went on
        // paying for it every month. That is the wrong direction to fail
        // in — the two states disagree, and the one that costs money is
        // the one that kept running.
        //
        // The exception is something Stripe says is already gone. A 404
        // there means the thing this call exists to stop is stopped, and
        // refusing on it would leave a row stuck "active" forever with
        // nothing behind it.
        const code = (stripeError as { code?: string; statusCode?: number })?.code;
        const status = (stripeError as { statusCode?: number })?.statusCode;
        const alreadyGone = code === "resource_missing" || status === 404;
        if (!alreadyGone) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Could not stop the billing for this add-on, so it has been left active. Nothing has changed — please try again.",
            },
            { status: 502 }
          );
        }
        ends.set(row.id, null);
      }
    }

    // Each row ends with ITS subscription's paid period. A refusal above
    // returned before any row was marked; a subscription already set to
    // cancel is also caught by the webhook (syncAddonSubscription), which
    // marks the row the same way.
    const cancelledAt = new Date().toISOString();
    for (const row of rows) {
      const { error: markError } = await admin
        .from("account_addons")
        .update({
          status: "cancelled",
          cancelled_at: cancelledAt,
          // NO PERIOD END MEANS IT ENDS NOW. An expiry we could not read is
          // not an excuse to keep granting something nobody is being billed
          // for any more.
          expires_at: ends.get(row.id) ?? null,
        })
        .eq("id", row.id)
        .eq("user_id", user.id)
        .eq("status", "active");
      if (markError) throw markError;
    }

    const periodEnd = [...ends.values()].filter((v): v is string => typeof v === "string").sort().pop() ?? null;
    return NextResponse.json({ ok: true, expiresAt: periodEnd });
  } catch (err) {
    logApiError("/api/billing/addons", err, { stage: "cancel" });
    return NextResponse.json({ error: "cancel_failed" }, { status: 500 });
  }
}

/**
 * The add-on's own subscription, found among the customer's by the
 * metadata its checkout wrote (api/billing/addons POST:
 * subscription_data.metadata.addon_slug and supabase_user_id).
 *
 * WHY IT IS HERE AND NOT ONLY IN THE WEBHOOK. The webhook reads the item
 * once, inside a try, at the moment of purchase — and when that call fails
 * the row is written with a null item. This is the lookup run later, when
 * it usually succeeds, so a transient Stripe error at purchase time does
 * not become an add-on that can never be cancelled.
 *
 * IT USED TO SEARCH THE PLAN'S SUBSCRIPTION (user_metadata.
 * stripe_subscription_id), which never holds an add-on line, so it found
 * nothing and every such add-on was stuck (2026-11-05, ΑΣ-4.17).
 *
 * Returns null rather than throwing: the caller's job is to REFUSE on
 * null, and an exception here would land in the outer catch and be
 * reported as `cancel_failed` — a 500 that reads like our bug rather than
 * a 502 that tells the user their billing is untouched.
 */
async function recoverAddonSubscription(
  stripe: ReturnType<typeof createStripeClient>,
  owner: { userId: string; customerId: string | null },
  slug: AddonSlug,
  claimed: ReadonlySet<string>
): Promise<{ subscriptionId: string; itemId: string } | null> {
  try {
    if (!owner.customerId) return null;
    const priceId = process.env[ADDONS[slug].priceEnvVar];
    const list = await stripe.subscriptions.list({ customer: owner.customerId, status: "all", limit: 100 });
    for (const subscription of list.data) {
      if (claimed.has(subscription.id)) continue;
      if (subscription.metadata?.addon_slug !== slug || subscription.metadata?.supabase_user_id !== owner.userId) continue;
      if (subscription.status === "canceled" || subscription.status === "incomplete_expired") continue;
      const item = subscription.items.data.find((i) => !priceId || i.price.id === priceId);
      if (item) return { subscriptionId: subscription.id, itemId: item.id };
    }
    return null;
  } catch (err) {
    logApiError("/api/billing/addons", err, { stage: "recover_item_lookup", slug });
    return null;
  }
}
