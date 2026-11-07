import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * «ΜΟΝΟ ΕΥΡΩΠΗ» (agent/mistral, 2026-11-07): the account's own on/off
 * switch for lib/ai/providers/eu-only.ts's promise. Reads through the
 * caller's own client — select_own_user_credits already lets an account
 * read its own row, so GET needs no mechanism of its own. The write goes
 * through the service role, filtered to the caller's own id: the column
 * is deny-all from a browser (20261122000000_eu_only_ai.sql carries no
 * policy for it), the same shape every other account-written-through-the-
 * server setting in this app uses.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });

    const { data, error } = await supabase.from("user_credits").select("eu_only_ai").eq("user_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
    return NextResponse.json({ ok: true, euOnly: data?.eu_only_ai === true });
  } catch (err) {
    logApiError("/api/settings/eu-only", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });

    const limited = await checkRateLimit({ scope: "eu_only_ai_toggle", identifier: user.id, maxAttempts: 20, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }
    if (typeof body.euOnly !== "boolean") return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

    const { error } = await createAdminClient().from("user_credits").update({ eu_only_ai: body.euOnly }).eq("user_id", user.id);
    if (error) return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
    return NextResponse.json({ ok: true, euOnly: body.euOnly });
  } catch (err) {
    logApiError("/api/settings/eu-only", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
