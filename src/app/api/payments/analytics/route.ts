import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { logApiError } from "@/lib/log-error";
import { getPaymentsAnalytics } from "@/lib/payments/analytics";

/**
 * GET /api/payments/analytics — full business metrics for the dashboard.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const admin = createAdminClient();
    const analytics = await getPaymentsAnalytics(admin, user.id);
    return NextResponse.json(analytics);
  } catch (err) {
    logApiError("api/payments/analytics:GET", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
