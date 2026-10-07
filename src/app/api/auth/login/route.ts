import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, countRateLimitHits, recordRateLimitHit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmLinkFor } from "@/lib/auth/confirm-email";
import { sendConfirmEmail } from "@/lib/email/send-confirm-email";
import { LOCALE_COOKIE, resolveSupportedLocale } from "@/i18n/constants";
import { getClientIp } from "@/lib/get-client-ip";
import { logApiError } from "@/lib/log-error";
import { noteLoginFailure } from "@/lib/auth/login-failure-alert";

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

    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    // THE PASSWORD WAS RIGHT, THE ADDRESS IS NOT YET PROVED (NEEDS 22).
    // Supabase answers this only after the password checks out, so a new
    // link is sent to the address on the account — three an hour, keyed on
    // the address — and the form says so in the reader's language.
    if (signInError?.code === "email_not_confirmed") {
      const limit = await checkRateLimit({
        scope: "login_resend_confirmation",
        identifier: email.toLowerCase(),
        maxAttempts: 3,
        windowMinutes: 60,
      });
      if (!limit.allowed) {
        return NextResponse.json({ ok: false, code: "email_not_confirmed" }, { status: 403 });
      }
      const link = await confirmLinkFor(createAdminClient(), email, "/dashboard/overview");
      // The language of the page they are signing in from (the cookie
      // i18n/request.ts reads), as at signup.
      const locale = resolveSupportedLocale(
        request.headers
          .get("cookie")
          ?.split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
          ?.slice(LOCALE_COOKIE.length + 1)
      );
      const sent = link ? await sendConfirmEmail(email, link, locale) : false;
      if (!sent) logApiError("/api/auth/login", new Error("confirmation link not sent"), { stage: "resend_confirmation" });
      return NextResponse.json({ ok: false, code: "email_not_confirmed" }, { status: 403 });
    }

    if (signInError) {
      await recordRateLimitHit({ scope: LOGIN_FAILURE_SCOPE, identifier: ip });
      // The waves the per-IP block cannot see (ΑΣ-8.5): many addresses at
      // once, or one account from many. lib/auth/login-failure-alert.ts.
      await noteLoginFailure(email);
      return NextResponse.json({ ok: false, error: signInError.message }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/auth/login", err);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
