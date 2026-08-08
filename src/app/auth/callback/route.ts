import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantCredits } from "@/lib/billing/credits";
import { getPlan } from "@/lib/billing/plans";
import { sendWelcomeEmail } from "@/lib/email/send-welcome-email";
import { logApiError } from "@/lib/log-error";
import { attributeReferral } from "@/lib/affiliate/store";
import { REFERRAL_COOKIE } from "@/lib/affiliate/cookie";

export const dynamic = "force-dynamic";

// OAuth redirect target for every social provider (see
// components/auth/social-auth-buttons.tsx's redirectTo). Supabase sends
// the browser back here with a ?code=, which must be exchanged for a real
// session cookie before anything else works.
//
// Why this route also BOOTSTRAPS the account: api/signup/route.ts is what
// normally gives a brand-new account its starting state (user_metadata's
// subscription_tier/seat_count/terms_accepted_at, a user_credits row via
// grantCredits, and a welcome email). An OAuth signup never touches that
// route at all — Supabase's GoTrue creates the user itself — so without
// the bootstrap below a Google user would land in the dashboard with no
// explicit tier and no credits row, i.e. NOT "the same flow as a normal
// signup" the way the rest of the app assumes. (The dashboard layout's
// getOrInitCredits would eventually lazily create a credits row as a
// fallback, but that's a safety net, not the same starting state — it
// never sets user_metadata and never sends the welcome email.)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  // Only ever a same-origin path — never an absolute URL, so a crafted
  // ?next=https://evil.example can't turn this into an open redirect.
  const rawNext = url.searchParams.get("next") ?? "/dashboard/overview";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard/overview";

  if (oauthError) {
    logApiError("/auth/callback", new Error(oauthError), { stage: "provider_returned_error" });
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(oauthError)}`, url.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    logApiError("/auth/callback", error, { stage: "exchange_code_for_session" });
    return NextResponse.redirect(new URL("/login?error=oauth_failed", url.origin));
  }

  const user = data.user;
  // subscription_tier is the one field api/signup always sets and nothing
  // else writes on a brand-new account, so its absence is the reliable
  // "this account has never been bootstrapped" signal — safe to re-run on
  // every login without double-granting credits to an existing user.
  const needsBootstrap = !user.user_metadata?.subscription_tier;

  if (needsBootstrap) {
    const admin = createAdminClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        // Same shape api/signup writes. Accepting the terms is implicit in
        // completing the provider's consent screen, which the social
        // buttons disclose in their own helper text before the redirect.
        terms_accepted_at: new Date().toISOString(),
        subscription_tier: "free",
        seat_count: 0,
        signup_provider: user.app_metadata?.provider ?? "oauth",
      },
    });
    if (updateError) {
      logApiError("/auth/callback", updateError, { stage: "bootstrap_user_metadata" });
    }

    const freePlan = getPlan("free")!;
    const freeCredits = typeof freePlan.monthlyCredits === "number" ? freePlan.monthlyCredits : 0;
    try {
      await grantCredits(user.id, freeCredits, "signup_grant", "Free plan signup credits", {
        setTotal: freeCredits,
        setPlanTier: freePlan.slug,
        // Same key api/signup uses — see there. needsBootstrap is read
        // before this runs, so two concurrent callbacks (a double-click, a
        // browser prefetch) could both pass that check; the key is what
        // actually makes the grant happen once.
        idempotencyKey: `signup_grant:${user.id}`,
      });
    } catch (err) {
      logApiError("/auth/callback", err, { stage: "bootstrap_grant_credits" });
    }

    // Affiliate attribution — same rules and the same cookie as
    // api/signup. Inside the needsBootstrap branch on purpose: this route
    // runs on every OAuth LOGIN, not only the first one, and attributing
    // on a login would let an existing user pick up a referral cookie
    // years later. Only a brand-new account can be referred.
    const referralCode = request.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${REFERRAL_COOKIE}=`))
      ?.slice(REFERRAL_COOKIE.length + 1);
    if (referralCode) {
      try {
        await attributeReferral({ referredUserId: user.id, code: referralCode });
      } catch (err) {
        logApiError("/auth/callback", err, { stage: "affiliate_attribution" });
      }
    }

    // Best-effort, exactly as in api/signup — never throws, so a missing
    // RESEND_API_KEY can't break the login redirect.
    if (user.email) {
      await sendWelcomeEmail(user.email);
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
