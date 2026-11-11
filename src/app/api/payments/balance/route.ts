import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { logApiError } from "@/lib/log-error";
import { getPaymentsAccount } from "@/lib/payments/connect";
import { getBalance, listTransactions, listPayouts } from "@/lib/payments/balance";

/**
 * GET /api/payments/balance — the user's payment balance, recent
 * transactions and payouts, all in one call (the page loads once).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const admin = createAdminClient();
    const account = await getPaymentsAccount(admin, user.id);
    if (!account) {
      return NextResponse.json({ error: "not_connected" }, { status: 400 });
    }

    const [balanceResult, { transactions, total }, payouts] = await Promise.all([
      account.payouts_enabled ? getBalance(account) : Promise.resolve(null),
      listTransactions(admin, user.id, 20),
      listPayouts(admin, user.id, 10),
    ]);

    return NextResponse.json({
      balance: balanceResult?.ok ? balanceResult.balance : null,
      transactions,
      transactionCount: total,
      payouts,
    });
  } catch (err) {
    logApiError("api/payments/balance:GET", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
