import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/email/send-welcome-email";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let email: string;
    let password: string;
    let termsAccepted: boolean;
    try {
      const body = await request.json();
      email = typeof body?.email === "string" ? body.email.trim() : "";
      password = typeof body?.password === "string" ? body.password : "";
      termsAccepted = body?.termsAccepted === true;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    if (!termsAccepted) {
      return NextResponse.json(
        { ok: false, error: "You must agree to the Terms of Service and Privacy Policy." },
        { status: 400 }
      );
    }

    const supabase = createClient();

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { terms_accepted_at: new Date().toISOString() },
      },
    });

    if (signUpError) {
      // eslint-disable-next-line no-console
      console.error(
        "SIGNUP - signUp() error:",
        JSON.stringify(signUpError, Object.getOwnPropertyNames(signUpError || {}))
      );
      logApiError("/api/signup", signUpError, { stage: "signUp" });
      return NextResponse.json(
        { ok: false, error: signUpError.message || "Could not create your account. Please try again." },
        { status: 400 }
      );
    }

    if (!signUpData.user) {
      logApiError("/api/signup", new Error("signUp returned no user"), { stage: "signUp" });
      return NextResponse.json(
        { ok: false, error: "Signup did not return a user. Please try again." },
        { status: 500 }
      );
    }

    // Supabase's anti-enumeration behavior: signUp() against an email that
    // already has a CONFIRMED account returns success (no signUpError) with
    // a user object whose identities array is empty, instead of an error —
    // so this has to be checked explicitly or the flow silently continues
    // with a stranger's account, only to fail confusingly at the
    // signInWithPassword step below (wrong password for that existing
    // account). Every account in this app is auto-confirmed at signup (see
    // the admin.auth.admin.updateUserById call below), so this check always
    // fires for a genuine duplicate rather than an unconfirmed-user edge case.
    if (signUpData.user.identities && signUpData.user.identities.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "An account with this email already exists. Try logging in instead.",
        },
        { status: 409 }
      );
    }

    // Auto-confirm the email so the user can sign in immediately. Real email
    // confirmation gets re-enabled before shipping to real users — until then
    // this is the only place SUPABASE_SERVICE_ROLE_KEY is used.
    const admin = createAdminClient();
    const { error: confirmError } = await admin.auth.admin.updateUserById(
      signUpData.user.id,
      { email_confirm: true }
    );

    if (confirmError) {
      // eslint-disable-next-line no-console
      console.error(
        "SIGNUP - admin confirm error:",
        JSON.stringify(confirmError, Object.getOwnPropertyNames(confirmError || {}))
      );
      logApiError("/api/signup", confirmError, { stage: "admin_confirm" });
      return NextResponse.json(
        {
          ok: false,
          error: confirmError.message || "Could not confirm your account. Please try again.",
        },
        { status: 500 }
      );
    }

    // Best-effort welcome email — sendWelcomeEmail never throws, so a failed
    // send (missing RESEND_API_KEY, Resend outage, etc.) never blocks signup.
    await sendWelcomeEmail(email);

    // Sign in on the same (cookie-aware) server client so the session lands
    // on this response and the browser is authenticated right away.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      logApiError("/api/signup", signInError, { stage: "signInWithPassword" });
      return NextResponse.json(
        {
          ok: false,
          error: signInError.message || "Account created, but sign-in failed. Please log in manually.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/signup", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
