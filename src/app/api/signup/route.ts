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
    try {
      const body = await request.json();
      email = typeof body?.email === "string" ? body.email.trim() : "";
      password = typeof body?.password === "string" ? body.password : "";
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

    const supabase = createClient();

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      return NextResponse.json(
        { ok: false, error: signUpError.message },
        { status: 400 }
      );
    }

    if (!signUpData.user) {
      return NextResponse.json(
        { ok: false, error: "Signup did not return a user." },
        { status: 500 }
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
      return NextResponse.json(
        { ok: false, error: confirmError.message },
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
      return NextResponse.json(
        { ok: false, error: signInError.message },
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
