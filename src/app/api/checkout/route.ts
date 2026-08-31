import { NextResponse } from "next/server";
import { diagLog } from "@/lib/diag";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import {
  getPlan,
  isPaidPlanSlug,
  isBillingInterval,
  annualPriceEur,
  type BillingInterval,
} from "@/lib/billing/plans";
import { getPlanPriceId, getPlanFromPriceId, getTeamSeatPriceId } from "@/lib/billing/price-ids";
import { logApiError } from "@/lib/log-error";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";
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
    let interval: BillingInterval;
    try {
      const body = await request.json();
      plan = typeof body?.plan === "string" ? body.plan : "";
      // Monthly unless the client explicitly asks for annual. Validated
      // against the union rather than trusted, because it selects a
      // Stripe price and therefore an amount to charge.
      interval = isBillingInterval(body?.interval) ? body.interval : "month";
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
    const planPriceId = getPlanPriceId(plan, interval);
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

      // Merged, not replaced. This wrote `{ ...user.user_metadata,
      // stripe_customer_id }` from a snapshot taken at the top of the
      // request; a Stripe webhook or a team grant landing in that window was
      // erased by it. One key is all this route means to change.
      const merged = await mergeUserMetadata(
        user.id,
        { stripe_customer_id: customerId },
        { context: "/api/checkout" }
      );
      if (!merged) {
        logApiError("/api/checkout", new Error("merge_user_metadata failed"), {
          stage: "persist_customer_id",
        });
      }
    }

    const siteUrl = getSiteUrl();

    // ------------------------------------------------------------------
    // ALREADY SUBSCRIBED? CHANGE THE SUBSCRIPTION, DO NOT SELL A SECOND ONE.
    // ------------------------------------------------------------------
    //
    // This route only ever created Checkout Sessions. A customer on
    // Starter who pressed "Growth" therefore got a SECOND active
    // subscription: billed for both, credited for neither correctly (the
    // webhook re-derives the tier from whichever subscription the event
    // was about), and with no proration for the Starter time they had
    // already paid for. That is the pre-existing shape "add proration on
    // upgrade/downgrade" runs into first — there was nothing to prorate
    // because nothing was being changed.
    //
    // Updating the existing subscription item is what makes proration
    // possible at all, and Stripe then does the arithmetic:
    //   UPGRADE  -> always_invoice: the customer gets the bigger plan now
    //               and pays the difference now, minus credit for the
    //               unused remainder of what they already bought.
    //   DOWNGRADE-> create_prorations: the unused remainder becomes a
    //               credit balance applied to their next invoice. Nobody
    //               expects a refund to arrive as a card charge.
    const existingSubscriptionId =
      typeof user.user_metadata?.stripe_subscription_id === "string"
        ? user.user_metadata.stripe_subscription_id
        : "";
    if (existingSubscriptionId) {
      try {
        const existing = await stripe.subscriptions.retrieve(existingSubscriptionId);
        const live = existing.status === "active" || existing.status === "trialing";
        // The plan line, as opposed to the team-seat line.
        const planItem = existing.items.data.find((item) => getPlanFromPriceId(item.price.id));
        const current = planItem ? getPlanFromPriceId(planItem.price.id) : null;

        if (live && planItem && current) {
          if (planItem.price.id === planPriceId) {
            // Nothing to change. Returned as a success with no url so the
            // client shows "you are already on this plan" rather than
            // bouncing the user through a Stripe page that would create a
            // duplicate subscription.
            return NextResponse.json({ ok: true, unchanged: true, redirectPath: successPath });
          }

          // Which direction, measured on what the account actually pays
          // per month — so month→year counts as an upgrade (a year up
          // front) even though the monthly-equivalent is lower.
          const currentMonthly =
            current.interval === "year"
              ? (annualPriceEur(getPlan(current.slug) ?? { price: 0 }) ?? 0)
              : (typeof getPlan(current.slug)?.price === "number"
                  ? (getPlan(current.slug)!.price as number)
                  : 0);
          const nextMonthly =
            interval === "year"
              ? (annualPriceEur(planDefinition ?? { price: 0 }) ?? 0)
              : (typeof planDefinition?.price === "number" ? planDefinition.price : 0);
          const isUpgrade = nextMonthly > currentMonthly;

          // TWO CLICKS MUST NOT BE TWO CHARGES.
          //
          // `always_invoice` on an upgrade does not schedule anything: it
          // creates a prorated invoice and charges the card there and
          // then. This call had no replay protection of any kind, while
          // the two Stripe calls that were harder to get wrong — the
          // affiliate transfer and the overage invoice item — both had
          // it. A double-submit (two tabs, a retry after a timeout, a
          // client that fires twice) sends two updates that both read the
          // OLD price and both prorate from it.
          //
          // The route's own rate limit does not stop it: ten checkout
          // attempts an hour is the right bound for "stop hammering
          // Stripe" and far too loose for "charge this card once".
          //
          // THE PRIMARY GUARD IS OURS, not Stripe's. consume_rate_limit()
          // is atomic — measured at exactly N of 30 concurrent callers
          // allowed, in rate-limit-atomicity.dbtest.mjs — so one intent
          // gets through and the other is refused, whatever the timing.
          // Two minutes covers a double-submit and expires long before a
          // customer could legitimately want the same change again.
          const changeGuard = await checkRateLimit({
            scope: "subscription_change",
            identifier: `${user.id}:${plan}:${interval}`,
            maxAttempts: 1,
            windowMinutes: 2,
          });
          if (!changeGuard.allowed) {
            // 409, not 429: this is not "too fast", it is "that change is
            // already in flight". The first request is doing the work.
            return NextResponse.json(
              { ok: true, updated: true, alreadyInFlight: true, redirectPath: successPath },
              { status: 409 }
            );
          }

          const subscriptionUpdate = {
            items: [{ id: planItem.id, price: planPriceId, quantity: 1 }],
            proration_behavior: isUpgrade ? "always_invoice" : "create_prorations",
            // Stripe otherwise keeps the old anniversary when moving
            // between intervals, which bills a full year on a date the
            // customer has no reason to expect.
            ...(current.interval !== interval ? { billing_cycle_anchor: "now" as const } : {}),
            metadata: { supabase_user_id: user.id, plan, interval },
          };

          // THE BACKSTOP, and its limitation stated rather than left to be
          // discovered. A Stripe idempotency key lives for 24 hours, so a
          // key derived only from (subscription, plan, interval) would
          // silently no-op a customer who moved A -> B -> A -> B inside a
          // day: Stripe would replay the first response and the plan would
          // not change while the app reported success. The two-minute
          // bucket keeps the replay window at the size of a double-click.
          // A pair of clicks that straddles a bucket boundary is not
          // deduped HERE — that is what the database guard above is for,
          // and it has no buckets.
          await stripe.subscriptions.update(existingSubscriptionId, subscriptionUpdate, {
            idempotencyKey: `sub_update:${existingSubscriptionId}:${plan}:${interval}:${Math.floor(
              Date.now() / 120000
            )}`,
          });

          diagLog(
            `[checkout-diag] subscription updated id=${existingSubscriptionId} ${current.slug}/${current.interval} -> ${plan}/${interval} upgrade=${isUpgrade}`
          );
          // The webhook (customer.subscription.updated) owns the tier and
          // the credits from here — the same path a renewal takes, so a
          // plan change and a renewal cannot diverge.
          return NextResponse.json({ ok: true, updated: true, redirectPath: successPath });
        }
      } catch (err) {
        // A subscription id that Stripe no longer knows (deleted in the
        // dashboard, wrong environment) must not block the customer from
        // buying. Fall through to a normal Checkout Session.
        logApiError("/api/checkout", err, { stage: "update_existing_subscription" });
      }
    }

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
      metadata: { supabase_user_id: user.id, plan, interval },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan, interval },
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
