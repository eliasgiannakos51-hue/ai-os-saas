import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/email/send-welcome-email";
import { logApiError } from "@/lib/log-error";
import { getErrorMessage } from "@/lib/get-error-message";
import { grantCredits } from "@/lib/billing/credits";
import { getPlan } from "@/lib/billing/plans";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { COUNTRIES } from "@/lib/countries";
import { getBetaInviteCode, computeBetaExpiresAt } from "@/lib/beta";

// @service-role-justified pre-auth — account creation happens before a
// session can exist. admin.auth.admin.createUser only creates the caller's
// own account.

export const dynamic = "force-dynamic";

const SIGNUP_MAX_ATTEMPTS = 10;
const SIGNUP_WINDOW_MINUTES = 60;

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimit({
      scope: "signup",
      identifier: ip,
      maxAttempts: SIGNUP_MAX_ATTEMPTS,
      windowMinutes: SIGNUP_WINDOW_MINUTES,
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many signup attempts. Please try again later." },
        { status: 429 }
      );
    }

    let email: string;
    let password: string;
    let termsAccepted: boolean;
    let country: string | null;
    let inviteCode: string;
    try {
      const body = await request.json();
      email = typeof body?.email === "string" ? body.email.trim() : "";
      password = typeof body?.password === "string" ? body.password : "";
      termsAccepted = body?.termsAccepted === true;
      country =
        typeof body?.country === "string" && COUNTRIES.includes(body.country)
          ? body.country
          : null;
      inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim().slice(0, 100) : "";
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

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { ok: false, error: "Password must be between 8 and 128 characters." },
        { status: 400 }
      );
    }

    if (!termsAccepted) {
      return NextResponse.json(
        { ok: false, error: "You must agree to the Terms of Service and Privacy Policy." },
        { status: 400 }
      );
    }

    // Never blocks signup — an empty, missing, or wrong code just means no
    // beta bonus, same as if the field were never shown at all.
    // getBetaInviteCode() falls back to a hardcoded default ("IONEXA200")
    // so this works even without BETA_INVITE_CODE configured.
    const betaCode = getBetaInviteCode();
    const isValidBetaCode = Boolean(inviteCode && inviteCode === betaCode);

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
      // subscription_tier/seat_count mirror the shape the Stripe webhook
      // writes on checkout (see api/webhooks/stripe/route.ts) — every
      // account gets an explicit "free" tier from the moment it exists,
      // rather than relying on that webhook (which never fires for a Free
      // signup) or a fallback default sprinkled across every place that
      // reads user_metadata.subscription_tier. A valid beta invite code
      // sets tier straight to "ultimate" instead — every existing
      // capability/minPlanSlug check already reads this same field, so
      // that alone unlocks every feature with zero changes anywhere else;
      // is_beta_tester is the separate flag lib/beta.ts checks to also
      // skip credit deduction entirely (see api/chat, api/create,
      // api/modules/create, api/text-actions) and to show the Settings
      // badge / Home feedback banner. is_beta_tester itself never expires
      // (historical record) — the actual 30-day access window lives in
      // user_credits.beta_expires_at (set below via grantCredits), and
      // resolveEffectivePlanSlug/hasActiveBetaBypass (lib/billing/credits.ts,
      // lib/beta.ts) are what collapse this back to "free" once it passes.
      user_metadata: {
        terms_accepted_at: new Date().toISOString(),
        subscription_tier: isValidBetaCode ? "ultimate" : "free",
        seat_count: 0,
        ...(isValidBetaCode ? { is_beta_tester: true } : {}),
        ...(country ? { country } : {}),
      },
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

    // Grant the signup plan's monthly credits so user_credits exists from
    // the moment the account does — everything downstream (api/create,
    // api/chat, api/modules/create) reads that row directly. Beta testers
    // get Ultimate's allotment for display consistency with their
    // subscription_tier above, and — same as admin — never actually have
    // it deducted (see lib/beta.ts's hasActiveBetaBypass at every credit
    // call site) for as long as beta_expires_at (set here, 30 days out) is
    // still in the future; this number is really just a starting display
    // value, not a real cap, until that window closes.
    const signupPlan = getPlan(isValidBetaCode ? "ultimate" : "free")!;
    const signupCredits = typeof signupPlan.monthlyCredits === "number" ? signupPlan.monthlyCredits : 0;
    try {
      await grantCredits(
        createData.user.id,
        signupCredits,
        "signup_grant",
        isValidBetaCode ? "Beta tester signup credits" : "Free plan signup credits",
        {
          setTotal: signupCredits,
          setPlanTier: signupPlan.slug,
          // One signup grant per account, ever. api/signup and
          // auth/callback are normally disjoint paths (password vs OAuth),
          // but both bootstrap an account and both used to grant
          // unconditionally — a shared key means whichever runs first wins
          // and a concurrent or repeated run grants nothing.
          idempotencyKey: `signup_grant:${createData.user.id}`,
          ...(isValidBetaCode ? { setBetaExpiresAt: computeBetaExpiresAt() } : {}),
        }
      );
    } catch (err) {
      logApiError("/api/signup", err, { stage: "grant_credits" });
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
    // Deliberately NOT getErrorMessage(err) here. This is the catch-all
    // for anything unexpected, so the message is whatever some library
    // happened to throw — a real signup attempt against an environment
    // missing SUPABASE_SERVICE_ROLE_KEY renders "supabaseKey is required."
    // straight onto the signup form, which tells a stranger which of our
    // secrets is unset. Every failure this route can actually explain is
    // already handled above with its own specific, deliberate message;
    // whatever reaches here is by definition not one of those.
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
