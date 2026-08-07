import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { isMarketplaceOpen, commissionPercent } from "@/lib/marketplace/marketplace-config";
import { syncSellerAccount } from "@/lib/marketplace/connect";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * The seller's own account: sales, earnings, payout state.
 *
 * Readable whether or not the marketplace is open, because a seller who
 * has already sold must always be able to see what they are owed. Only
 * the paths that MOVE money are gated.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "marketplace_seller",
      identifier: user.id,
      maxAttempts: 120,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const [{ data: account }, { data: listings }, { data: sales }] = await Promise.all([
      supabase
        .from("seller_accounts")
        .select("stripe_account_id, onboarding_status, charges_enabled, payouts_enabled, country")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("marketplace_listings")
        .select("id, kind, title, price_cents, status, purchase_count, rating_sum, rating_count, created_at")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("marketplace_purchases")
        .select("id, listing_id, price_cents, seller_cents, platform_fee_cents, status, created_at")
        .eq("seller_id", user.id)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    // Summed from the frozen per-purchase figures, never recomputed from
    // today's commission. Changing the platform fee must not retroactively
    // rewrite what past sales earned.
    const paid = sales ?? [];
    const grossCents = paid.reduce((sum, s) => sum + (s.price_cents ?? 0), 0);
    const earnedCents = paid.reduce((sum, s) => sum + (s.seller_cents ?? 0), 0);

    return NextResponse.json({
      ok: true,
      open: isMarketplaceOpen(),
      commissionPercent: commissionPercent(),
      account: account ?? null,
      listings: listings ?? [],
      sales: paid,
      totals: { salesCount: paid.length, grossCents, earnedCents },
    });
  } catch (err) {
    logApiError("/api/marketplace/seller", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Start (or resume) Stripe Express onboarding.
 *
 * Returns a one-time Stripe-hosted URL. Identity documents, bank details
 * and tax information go there and never here, which is the whole reason
 * to use Express: we cannot leak what we never receive.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    if (!isMarketplaceOpen()) {
      return NextResponse.json(
        { ok: false, notOpen: true, error: "The marketplace is not open for sellers yet." },
        { status: 503 }
      );
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ ok: false, error: "Payments are not configured." }, { status: 503 });
    }

    const limited = await checkRateLimit({
      scope: "marketplace_onboard",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many attempts. Try again shortly." }, { status: 429 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      return NextResponse.json({ ok: false, error: "The site URL is not configured." }, { status: 503 });
    }

    const stripe = createStripeClient();
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("seller_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let accountId = existing?.stripe_account_id ?? null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email ?? undefined,
        capabilities: {
          transfers: { requested: true },
        },
        // The link back to the Supabase user. Read on every Connect
        // webhook, because the event names the Stripe account and
        // nothing else — without this there is no way to know whose it
        // is that does not involve a table scan.
        metadata: { supabase_user_id: user.id },
      });
      accountId = account.id;
      await syncSellerAccount({ admin, userId: user.id, account });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      // Both point back into our seller dashboard. `refresh_url` is not
      // a nicety: an account link expires in minutes and is single-use,
      // so a user who leaves the tab open lands here and gets a fresh
      // one rather than a Stripe error page.
      refresh_url: `${siteUrl}/dashboard/marketplace/sell?onboarding=refresh`,
      return_url: `${siteUrl}/dashboard/marketplace/sell?onboarding=done`,
      type: "account_onboarding",
    });

    return NextResponse.json({ ok: true, url: link.url });
  } catch (err) {
    logApiError("/api/marketplace/seller", err, { stage: "onboard" });
    return NextResponse.json({ ok: false, error: "Could not start seller onboarding." }, { status: 500 });
  }
}
