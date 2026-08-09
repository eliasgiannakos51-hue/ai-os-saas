import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { logApiError } from "@/lib/log-error";

// @service-role-justified pre-auth — there is no session yet; the admin
// client only INSERTS into rate_limit_log and reads nothing across accounts.

export const dynamic = "force-dynamic";

// Suspicious-activity detection: repeated FAILED login attempts from the
// same IP, temporarily blocked. Deliberately routes sign-in through this
// server route (instead of the client calling supabase.auth.signInWithPassword
// directly, as it did before) specifically so this check can happen —
// rate limiting can only be a real security boundary when enforced
// server-side, never in client JS. Only actual FAILURES count toward the
// limit (recorded after a failed attempt below, not before) — a
// legitimate user who occasionally mistypes their password is never
// blocked, only a script hammering the same IP with wrong credentials.
const LOGIN_FAILURE_SCOPE = "login_failed";
const MAX_FAILED_ATTEMPTS = 8;
const WINDOW_MINUTES = 15;

export async function POST(request: Request) {
  try {
    let email: string;
    let password: string;
    try {
      const body = await request.json();
      email = typeof body?.email === "string" ? body.email.trim() : "";
      password = typeof body?.password === "string" ? body.password : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
    }

    const ip = getClientIp(request);
    const admin = createAdminClient();
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

    const { count, error: countError } = await admin
      .from("rate_limit_log")
      .select("id", { count: "exact", head: true })
      .eq("scope", LOGIN_FAILURE_SCOPE)
      .eq("identifier", ip)
      .gte("created_at", windowStart);

    if (countError) {
      // Fails open — same "a logging hiccup should never block a real
      // user" tolerance as lib/rate-limit.ts's checkRateLimit.
      logApiError("/api/auth/login", countError, { stage: "count_failures" });
    } else if ((count ?? 0) >= MAX_FAILED_ATTEMPTS) {
      return NextResponse.json(
        { ok: false, error: "Too many failed login attempts. Please try again later." },
        { status: 429 }
      );
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      const { error: insertError } = await admin.from("rate_limit_log").insert({
        scope: LOGIN_FAILURE_SCOPE,
        identifier: ip,
      });
      if (insertError) {
        logApiError("/api/auth/login", insertError, { stage: "record_failure" });
      }
      return NextResponse.json({ ok: false, error: signInError.message }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/auth/login", err);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
