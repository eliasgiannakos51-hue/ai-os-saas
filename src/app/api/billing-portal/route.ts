import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createStripeClient } from "@/lib/stripe/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const customerId = user.user_metadata?.stripe_customer_id as string | undefined;
    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "No billing account found for this user yet." },
        { status: 400 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const stripe = createStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/dashboard/settings`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    logApiError("/api/billing-portal", err);
    return NextResponse.json(
      { ok: false, error: "Could not open the billing portal. Please try again." },
      { status: 500 }
    );
  }
}
