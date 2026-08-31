import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { countRateLimitHits, recordRateLimitHit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { logApiError } from "@/lib/log-error";

// @service-role-justified pre-auth — there is no session yet; the
// rate_limit_log access in lib/rate-limit.ts uses the admin client, reads
// and writes only that table, and reads nothing across accounts.

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

    // ONE IMPLEMENTATION OF THE TABLE ACCESS, in lib/rate-limit.ts. This
    // route used to carry its own — its own window arithmetic, its own
    // fails-open branch — which is how two limiters drift into meaning
    // different things. The SHAPE is still this route's own, because it
    // counts failures rather than attempts: a busy legitimate user must
    // not be blocked by their own successful logins.
    const failures = await countRateLimitHits({
      scope: LOGIN_FAILURE_SCOPE,
      identifier: ip,
      windowMinutes: WINDOW_MINUTES,
    });

    // Fails open — same "a logging hiccup should never block a real user"
    // tolerance as lib/rate-limit.ts's checkRateLimit.
    if (failures.ok && failures.count >= MAX_FAILED_ATTEMPTS) {
      return NextResponse.json(
        { ok: false, error: "Too many failed login attempts. Please try again later." },
        { status: 429 }
      );
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      await recordRateLimitHit({ scope: LOGIN_FAILURE_SCOPE, identifier: ip });
      return NextResponse.json({ ok: false, error: signInError.message }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/auth/login", err);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
