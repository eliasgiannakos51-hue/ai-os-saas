import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrInitCredits, resolvePlan } from "@/lib/billing/credits";
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

    const plan = resolvePlan(user);
    const row = await getOrInitCredits(user.id, plan);

    return NextResponse.json({ ok: true, credits: row.credits_remaining, total: row.credits_total });
  } catch (err) {
    logApiError("/api/credits/balance", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
