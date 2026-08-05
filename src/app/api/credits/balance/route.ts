import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrInitCredits, resolveEffectivePlan, getPurchasedPackCreditPriceEur } from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const plan = await resolveEffectivePlan(user);
    const row = await getOrInitCredits(user.id, plan);

    // The same rate settlement divides by, so the pre-submit estimate the
    // client shows and the charge the server applies agree.
    const creditPriceEur = effectiveCreditPriceEurForAccount(
      plan,
      await getPurchasedPackCreditPriceEur(user.id),
      resolvePricingConfig()
    );

    return NextResponse.json({
      ok: true,
      credits: row.credits_remaining,
      total: row.credits_total,
      creditPriceEur,
    });
  } catch (err) {
    logApiError("/api/credits/balance", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
