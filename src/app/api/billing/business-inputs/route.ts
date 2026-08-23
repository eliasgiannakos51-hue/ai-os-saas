import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import { monthKey } from "@/lib/billing/revenue-history";

export const dynamic = "force-dynamic";

/**
 * THE THREE NUMBERS THIS DATABASE CANNOT KNOW.
 *
 * Marketing spend, fixed costs and the bank balance. CAC, burn and runway
 * are unanswerable without them, and the alternative to asking was a CAC
 * computed from a marketing spend of zero — infinitely good, and a lie.
 *
 * OWNER-ONLY, through the same isAdminEmail gate the margin report uses.
 * The table itself has RLS on with no policy at all, so it is unreachable
 * by any client whatever this route does; this gate decides who may reach
 * it THROUGH the service role.
 */
async function requireOwner() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "not_signed_in" };
  if (!isAdminEmail(user.email)) return { ok: false as const, status: 403, error: "not_the_owner" };
  return { ok: true as const, user };
}

export async function GET(request: Request) {
  const auth = await requireOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const month = new URL(request.url).searchParams.get("month") ?? monthKey(new Date());
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("business_inputs")
      .select("month, marketing_spend_eur, fixed_costs_eur, cash_balance_eur, note")
      .eq("month", month)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ month, inputs: data ?? null });
  } catch (err) {
    logApiError("/api/billing/business-inputs", err, { stage: "read" });
    return NextResponse.json({ error: "could_not_read" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const month = typeof body.month === "string" && /^\d{4}-\d{2}-01$/.test(body.month)
      ? body.month
      : monthKey(new Date());

    // NULL AND ZERO ARE DIFFERENT. A cleared field means "not entered",
    // which makes the metric say what it needs; a zero means the owner
    // really spent nothing, which makes CAC zero. Collapsing the two
    // would turn "I have not filled this in" into "our acquisition is
    // free".
    const number = (value: unknown): number | null => {
      if (value === null || value === undefined || value === "") return null;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.round(n * 100) / 100;
    };

    const admin = createAdminClient();
    const { error } = await admin.from("business_inputs").upsert(
      {
        month,
        marketing_spend_eur: number(body.marketingSpendEur),
        fixed_costs_eur: number(body.fixedCostsEur),
        cash_balance_eur: number(body.cashBalanceEur),
        note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "month" }
    );
    if (error) throw error;

    return NextResponse.json({ ok: true, month });
  } catch (err) {
    logApiError("/api/billing/business-inputs", err, { stage: "write" });
    return NextResponse.json({ error: "could_not_save" }, { status: 500 });
  }
}
