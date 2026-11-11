import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import {
  getPaymentsAccount,
  createPaymentsOnboardingLink,
  refreshPaymentsAccount,
} from "@/lib/payments/connect";

/**
 * POST /api/payments/connect — start or resume Stripe Connect onboarding.
 * GET  /api/payments/connect — read the account status (+ refresh from Stripe).
 */

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const limited = await checkRateLimit({
      scope: "payments_connect",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const admin = createAdminClient();
    const existing = await getPaymentsAccount(admin, user.id);

    const result = await createPaymentsOnboardingLink({
      userId: user.id,
      email: user.email!,
      existingAccount: existing,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ url: result.url });
  } catch (err) {
    logApiError("api/payments/connect:POST", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const admin = createAdminClient();
    let account = await getPaymentsAccount(admin, user.id);

    if (account && !account.details_submitted) {
      // Refresh from Stripe to get the latest onboarding status.
      account = await refreshPaymentsAccount(admin, account);
    }

    return NextResponse.json({
      connected: !!account,
      account: account
        ? {
            id: account.id,
            businessName: account.business_name,
            payoutsEnabled: account.payouts_enabled,
            chargesEnabled: account.charges_enabled,
            detailsSubmitted: account.details_submitted,
            country: account.country,
            defaultCurrency: account.default_currency,
          }
        : null,
    });
  } catch (err) {
    logApiError("api/payments/connect:GET", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
