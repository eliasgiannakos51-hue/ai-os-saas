import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 20;

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("credit_transactions")
      .select("id, amount, action_type, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) {
      logApiError("/api/credits/transactions", error);
      return NextResponse.json({ ok: false, error: "Could not load transaction history." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, transactions: data ?? [] });
  } catch (err) {
    logApiError("/api/credits/transactions", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
