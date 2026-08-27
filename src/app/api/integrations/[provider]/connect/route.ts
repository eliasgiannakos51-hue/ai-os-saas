import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { encryptionAvailable } from "@/lib/integrations/crypto";
import { getProvider, isProviderId } from "@/lib/integrations/providers";
import {
  buildAuthorizeUrl,
  createPkcePair,
  encodeState,
  familyConfig,
  providerConfigured,
  OAUTH_STATE_COOKIE,
} from "@/lib/integrations/oauth";
import { countConnectedIntegrations } from "@/lib/integrations/store";
import { maxIntegrationsForPlan } from "@/lib/integrations/limits";

export const dynamic = "force-dynamic";

// Step one of the OAuth dance: send the user to the provider.
//
// Everything that can be checked BEFORE the redirect is checked here,
// because after the redirect the user is on Google's consent screen and
// the only way to tell them "your plan does not include this" is to bring
// them back and explain — having already asked them to approve access to
// their mail. Refusing before the redirect is both cheaper and honest.
export async function GET(request: Request, { params }: { params: { provider: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    if (!isProviderId(params.provider)) {
      return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 404 });
    }
    const provider = getProvider(params.provider)!;

    // Rate limited even though it costs us nothing: this endpoint mints
    // signed state and sets a cookie, and an unbounded loop of it is a
    // cheap way to fill a log.
    const limited = await checkRateLimit({
      scope: "integration_connect",
      identifier: user.id,
      maxAttempts: 20,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many connection attempts. Try again shortly." },
        { status: 429 }
      );
    }

    // Fail CLOSED on a missing encryption key. Sending the user through
    // consent and then discovering we cannot store the token would leave a
    // live grant on their account that this app has no record of — the
    // worst possible outcome of a configuration mistake.
    if (!encryptionAvailable()) {
      return NextResponse.json(
        { ok: false, error: "Integrations are not configured on this deployment." },
        { status: 503 }
      );
    }
    if (!providerConfigured(provider.id)) {
      return NextResponse.json(
        { ok: false, error: "That integration is not configured on this deployment." },
        { status: 503 }
      );
    }

    const isAdmin = isAdminEmail(user.email);
    if (!isAdmin) {
      const planSlug = await resolveEffectivePlanSlug(user);
      const cap = maxIntegrationsForPlan(planSlug);
      if (cap <= 0) {
        return NextResponse.json(
          { ok: false, upgradeRequired: true, error: "Integrations are available on paid plans." },
          { status: 403 }
        );
      }
      if (Number.isFinite(cap)) {
        const connected = await countConnectedIntegrations(user.id);
        // Reconnecting something already connected must not be blocked by
        // the cap it already occupies.
        const { data: existing } = await supabase
          .from("user_integrations")
          .select("id")
          .eq("user_id", user.id)
          .eq("provider", provider.id)
          .maybeSingle();
        if (!existing && connected >= cap) {
          return NextResponse.json(
            {
              ok: false,
              limitReached: true,
              error: `Your plan includes ${cap} integration${cap === 1 ? "" : "s"} — disconnect one or upgrade.`,
            },
            { status: 403 }
          );
        }
      }
    }

    const nonce = randomBytes(24).toString("base64url");
    const state = encodeState({ n: nonce, p: provider.id, u: user.id, t: Date.now() });

    const usesPkce = familyConfig(provider).usesPkce;
    const pkce = usesPkce ? createPkcePair() : null;

    const authorizeUrl = buildAuthorizeUrl({
      provider,
      state,
      codeChallenge: pkce?.challenge,
    });

    const response = NextResponse.redirect(authorizeUrl);
    // The browser-bound half of the CSRF defence. HttpOnly so no script
    // can read it, SameSite=lax so it survives the provider's redirect
    // back (a strict cookie is not sent on a cross-site navigation, which
    // would break the callback for every user), and short-lived.
    response.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: JSON.stringify({ n: nonce, v: pkce?.verifier ?? null, p: provider.id }),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/integrations",
      maxAge: 600,
    });
    return response;
  } catch (err) {
    logApiError("/api/integrations/[provider]/connect", err, { provider: params.provider });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
