import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { affiliatePercent, COMMISSION_MONTHS } from "@/lib/affiliate/affiliate";
import { ensureAffiliateAccount } from "@/lib/affiliate/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** The affiliate's own dashboard: their code, their referrals, what they
 *  have earned. Read through their own client, so RLS decides what is
 *  visible — a referral row belongs to the AFFILIATE, and the referred
 *  person never sees it. */
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
      scope: "affiliate_read",
      identifier: user.id,
      maxAttempts: 120,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const [{ data: account }, { data: referrals }, { data: commissions }] = await Promise.all([
      supabase
        .from("affiliate_accounts")
        .select("code, status, created_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("affiliate_referrals")
        .select("id, signed_up_at, first_paid_at, commission_ends_at")
        .eq("affiliate_user_id", user.id)
        .order("signed_up_at", { ascending: false })
        .limit(500),
      supabase
        .from("affiliate_commissions")
        .select("id, commission_cents, invoice_amount_cents, percent, earned_at, paid_out_at")
        .eq("affiliate_user_id", user.id)
        .order("earned_at", { ascending: false })
        .limit(500),
    ]);

    const earned = commissions ?? [];
    // Summed from the FROZEN per-commission figures, never recomputed
    // from today's rate — changing the programme's percentage must not
    // rewrite what past referrals earned.
    const totalCents = earned.reduce((sum, c) => sum + (c.commission_cents ?? 0), 0);
    const unpaidCents = earned
      .filter((c) => !c.paid_out_at)
      .reduce((sum, c) => sum + (c.commission_cents ?? 0), 0);

    return NextResponse.json({
      ok: true,
      account: account ?? null,
      percent: affiliatePercent(),
      commissionMonths: COMMISSION_MONTHS,
      referrals: referrals ?? [],
      commissions: earned,
      totals: {
        referrals: (referrals ?? []).length,
        converted: (referrals ?? []).filter((r) => r.first_paid_at).length,
        totalCents,
        unpaidCents,
      },
    });
  } catch (err) {
    logApiError("/api/affiliate", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/** Join the programme. Idempotent — a second call returns the same code,
 *  because a referral link that changes is a referral link that stops
 *  working wherever it was already posted. */
export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "affiliate_join",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many attempts. Try again shortly." }, { status: 429 });
    }

    const result = await ensureAffiliateAccount(user.id);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: "Could not create your referral link." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, code: result.code, status: result.status });
  } catch (err) {
    logApiError("/api/affiliate", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
