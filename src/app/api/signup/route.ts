import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/email/send-welcome-email";
import { logApiError } from "@/lib/log-error";
import { getErrorMessage } from "@/lib/get-error-message";

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

    // Create the user directly via the Admin API instead of the client-side
    // supabase.auth.signUp(). signUp() has Supabase's GoTrue server send a
    // confirmation email as part of the same request, before our code ever
    // runs — with Resend's sender restriction, that send fails and takes
    // the whole signup down with it (500, "user_confirmation_requested" in
    // the Supabase logs). admin.auth.admin.createUser() with
    // email_confirm: true creates an already-confirmed user in one step,
    // server-side, and does not trigger any auth email at all.
    const admin = createAdminClient();
    const { data: createData, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { terms_accepted_at: new Date().toISOString() },
    });

    if (createError) {
      // eslint-disable-next-line no-console
      console.error(
        "SIGNUP - admin.createUser() error:",
        JSON.stringify(createError, Object.getOwnPropertyNames(createError || {}))
      );
      logApiError("/api/signup", createError, { stage: "admin_createUser" });
      const isDuplicate =
        createError.code === "email_exists" ||
        createError.code === "user_already_exists" ||
        /already.*(registered|exists)/i.test(createError.message || "");
      return NextResponse.json(
        {
          ok: false,
          error: isDuplicate
            ? "An account with this email already exists. Try logging in instead."
            : getErrorMessage(createError, "Could not create your account. Please try again."),
        },
        { status: isDuplicate ? 409 : 400 }
      );
    }

    if (!createData.user) {
      logApiError("/api/signup", new Error("admin.createUser returned no user"), {
        stage: "admin_createUser",
      });
      return NextResponse.json(
        { ok: false, error: "Signup did not return a user. Please try again." },
        { status: 500 }
      );
    }

    const supabase = createClient();

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
          error: getErrorMessage(
            signInError,
            "Account created, but sign-in failed. Please log in manually."
          ),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/signup", err);
    return NextResponse.json(
      { ok: false, error: getErrorMessage(err, "Something went wrong. Please try again.") },
      { status: 500 }
    );
  }
}
