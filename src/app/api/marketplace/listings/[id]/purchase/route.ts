import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import {
  commissionPercent,
  isMarketplaceOpen,
  splitPrice,
} from "@/lib/marketplace/marketplace-config";
import { sellerCanBePaid } from "@/lib/marketplace/connect";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Buy a listing.
 *
 * Creates a Stripe Checkout session and a `pending` purchase row. It does
 * NOT install anything — fulfilment happens in the webhook, on Stripe's
 * signed word that the money moved. Installing here, on the strength of
 * the browser having reached a success URL, is the oldest free-products
 * bug there is.
 *
 * DESTINATION CHARGES. The platform is the merchant of record: the funds
 * land in our balance and Stripe transfers the seller's share to their
 * connected account, minus `application_fee_amount`. The more onerous
 * option for us, and the right one for digital goods delivered instantly
 * — the alternative puts a card dispute in front of a seller who has no
 * relationship with the buyer's bank and no way to answer it.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "marketplace_purchase",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many attempts. Try again shortly." }, { status: 429 });
    }

    if (!isMarketplaceOpen()) {
      return NextResponse.json(
        { ok: false, notOpen: true, error: "The marketplace is not open yet." },
        { status: 503 }
      );
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!process.env.STRIPE_SECRET_KEY || !siteUrl) {
      return NextResponse.json({ ok: false, error: "Payments are not configured." }, { status: 503 });
    }

    // Read through the CALLER's client, so the published-only RLS policy
    // applies: a draft, rejected or withdrawn listing is not purchasable
    // and is not even visible here.
    const { data: listing, error } = await supabase
      .from("marketplace_listings")
      .select("id, seller_id, title, price_cents, status")
      .eq("id", params.id)
      .eq("status", "published")
      .maybeSingle();

    if (error) {
      logApiError("/api/marketplace/purchase", error, { stage: "read_listing" });
      return NextResponse.json({ ok: false, error: "Could not load that listing." }, { status: 500 });
    }
    if (!listing) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    if (listing.seller_id === user.id) {
      return NextResponse.json({ ok: false, error: "This is your own listing." }, { status: 400 });
    }

    const admin = createAdminClient();

    // Already owned? Buying the same template twice is almost always a
    // double-click or a back button, not an intention, and the second
    // copy is indistinguishable from the first.
    const { data: existing } = await admin
      .from("marketplace_purchases")
      .select("id, status")
      .eq("listing_id", listing.id)
      .eq("buyer_id", user.id)
      .eq("status", "paid")
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { ok: false, alreadyOwned: true, error: "You already own this." },
        { status: 409 }
      );
    }

    const { data: sellerAccount } = await admin
      .from("seller_accounts")
      .select("stripe_account_id")
      .eq("user_id", listing.seller_id)
      .maybeSingle();

    const stripe = createStripeClient();
    // Re-checked against Stripe, not against our cached booleans. A
    // seller Stripe has restricted since they listed is a sale we would
    // take and then be unable to pay out — money held on behalf of
    // someone we cannot send it to.
    const payable = await sellerCanBePaid(stripe, sellerAccount?.stripe_account_id);
    if (!payable.ok) {
      return NextResponse.json(
        { ok: false, error: "This item is temporarily unavailable." },
        { status: 409 }
      );
    }

    const percent = commissionPercent();
    const { platformFeeCents, sellerCents } = splitPrice(listing.price_cents, percent);

    // The purchase row FIRST, so the webhook has something to find. Its
    // id travels in the session metadata and is what fulfilment resolves
    // — never a listing id and a user id read back out of the event,
    // which would let a forged-looking session name any pair.
    const { data: purchase, error: purchaseError } = await admin
      .from("marketplace_purchases")
      .insert({
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
        price_cents: listing.price_cents,
        platform_fee_cents: platformFeeCents,
        seller_cents: sellerCents,
        commission_percent: percent,
        status: "pending",
      })
      .select("id")
      .single();

    if (purchaseError || !purchase) {
      logApiError("/api/marketplace/purchase", purchaseError, { stage: "insert_purchase" });
      return NextResponse.json({ ok: false, error: "Could not start the purchase." }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: listing.price_cents,
            product_data: { name: listing.title.slice(0, 250) },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: sellerAccount!.stripe_account_id! },
      },
      success_url: `${siteUrl}/dashboard/marketplace/${listing.id}?purchase=done`,
      cancel_url: `${siteUrl}/dashboard/marketplace/${listing.id}?purchase=cancelled`,
      // The only thing fulfilment reads. One id, ours, pointing at a row
      // that already carries the buyer, the seller and the frozen split.
      metadata: { marketplace_purchase_id: purchase.id },
      client_reference_id: purchase.id,
    });

    const { error: sessionError } = await admin
      .from("marketplace_purchases")
      .update({ stripe_session_id: session.id })
      .eq("id", purchase.id);
    if (sessionError) {
      logApiError("/api/marketplace/purchase", sessionError, { stage: "store_session" });
    }

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    logApiError("/api/marketplace/purchase", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
