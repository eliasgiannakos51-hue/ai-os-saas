import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { logApiError } from "@/lib/log-error";
import { getPaymentsAccount, createDashboardLink } from "@/lib/payments/connect";

/**
 * POST /api/payments/dashboard-link — get a one-time Stripe Express
 * dashboard link so the user can see their full Stripe dashboard.
 */
export async function POST() {
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

    const result = await createDashboardLink(account);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ url: result.url });
  } catch (err) {
    logApiError("api/payments/dashboard-link:POST", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
