import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { MAX_QUICK_CHARS, readMoneySentence } from "@/lib/finance/quick-entry";

export const dynamic = "force-dynamic";

/**
 * «ΠΛΗΡΩΣΑ 50 ΕΥΡΩ ΡΕΥΜΑ» WRITTEN AS AN EXPENSE (MASTER 16, package 18),
 * behind the switch "finance-sales".
 *
 * Read by code (lib/finance/quick-entry.ts): no model, no charge. A
 * sentence whose amount or direction is missing or doubtful is NOT
 * written — 422, with what was missing, so the screen can ask. The row is
 * written through the person's own session, so finance_entries' RLS makes
 * it theirs.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_QUICK_CHARS) return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "unauthenticated" }, { status: 401 });
  if (!(await isFeatureOn("finance-sales", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });

  try {
    const limited = await checkRateLimit({ scope: "finance_quick", identifier: user.id, maxAttempts: 240, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

    const reading = readMoneySentence(text);
    if (!reading.ok) return NextResponse.json({ ok: false, code: "not_understood", missing: reading.missing }, { status: 422 });

    const { data: row, error } = await supabase
      .from("finance_entries")
      .insert({
        user_id: user.id,
        description: reading.entry.description,
        type: reading.entry.type,
        amount: reading.entry.amount,
        occurred_at: new Date().toISOString(),
      })
      .select("id, description, type, amount")
      .single();
    if (error || !row) throw error ?? new Error("no row returned");
    return NextResponse.json({ ok: true, entry: row });
  } catch (err) {
    logApiError("/api/finance/quick", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
