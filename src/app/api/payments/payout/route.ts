import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { getPaymentsAccount } from "@/lib/payments/connect";
import { requestPayout } from "@/lib/payments/balance";

/**
 * POST /api/payments/payout — request a payout (cashout) to the user's bank.
 *
 * Body: { amountCents: number, currency?: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const limited = await checkRateLimit({
      scope: "payments_payout",
      identifier: user.id,
      maxAttempts: 5,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const admin = createAdminClient();
    const account = await getPaymentsAccount(admin, user.id);
    if (!account) {
      return NextResponse.json({ error: "not_connected" }, { status: 400 });
    }
    if (!account.payouts_enabled) {
      return NextResponse.json({ error: "payouts_not_enabled" }, { status: 400 });
    }

    const body = await req.json();
    const { amountCents, currency } = body;
    if (typeof amountCents !== "number" || amountCents <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }

    const result = await requestPayout(admin, account, amountCents, currency);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ payoutId: result.payoutId });
  } catch (err) {
    logApiError("api/payments/payout:POST", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
