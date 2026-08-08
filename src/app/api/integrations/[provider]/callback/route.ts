import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { getSiteUrl } from "@/lib/site-url";
import { secretsMatch, safeErrorDetail } from "@/lib/integrations/crypto";
import { getProvider, isProviderId } from "@/lib/integrations/providers";
import {
  decodeState,
  exchangeCodeForTokens,
  OAUTH_STATE_COOKIE,
} from "@/lib/integrations/oauth";
import { saveIntegration } from "@/lib/integrations/store";
import { fetchAccountLabel } from "@/lib/integrations/read";

export const dynamic = "force-dynamic";

// Step two: the provider sends the user back here with a code.
//
// THIS ROUTE AUTHENTICATES. It would be easy to argue it should not — the
// user is arriving from Google, not from our UI — but the attack this
// closes needs a logged-in victim, and the defence needs to know who that
// is. An attacker who completes OAuth against their OWN mailbox and then
// gets a victim's browser to visit this URL with the resulting code would,
// without the checks below, silently connect the VICTIM's account to the
// ATTACKER's mailbox. From then on the victim's AI reads, summarises and
// acts on data the attacker writes: a prompt-injection channel with a
// login page in front of it.
//
// Three independent checks have to agree before a token is stored:
//   1. the state's HMAC (it was minted by us and not edited),
//   2. the nonce in an HttpOnly cookie (it was minted for THIS browser),
//   3. the session (the logged-in user is the one the state was minted for).
//
// Any one of them failing sends the user back with an error and stores
// nothing.
export async function GET(request: Request, { params }: { params: { provider: string } }) {
  const back = (status: string) =>
    NextResponse.redirect(`${getSiteUrl().replace(/\/+$/, "")}/dashboard/integrations?status=${status}`);

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

    const url = new URL(request.url);
    const providerError = url.searchParams.get("error");
    if (providerError) {
      // The user pressed Cancel on the consent screen. That is a normal
      // outcome, not a failure to report as one.
      return back(providerError === "access_denied" ? "cancelled" : "provider_error");
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return back("invalid_response");

    const stateCheck = decodeState(state);
    if (!stateCheck.ok) return back(stateCheck.reason === "expired" ? "expired" : "invalid_state");

    // The state names a provider; the URL names a provider. If they
    // disagree, a state minted for Gmail is being replayed at the Drive
    // callback — which would store a Gmail token in the Drive row and
    // grant the Drive feature access to mail.
    if (stateCheck.payload.p !== provider.id) return back("invalid_state");

    // ...and the session must be the user the flow was started by.
    if (!secretsMatch(stateCheck.payload.u, user.id)) return back("invalid_state");

    const cookieStore = cookies();
    const raw = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
    if (!raw) return back("invalid_state");

    let stored: { n?: string; v?: string | null; p?: string };
    try {
      stored = JSON.parse(raw);
    } catch {
      return back("invalid_state");
    }
    if (!stored.n || !secretsMatch(stored.n, stateCheck.payload.n)) return back("invalid_state");
    if (stored.p !== provider.id) return back("invalid_state");

    const exchanged = await exchangeCodeForTokens({
      provider,
      code,
      codeVerifier: stored.v ?? undefined,
    });
    if (!exchanged.ok) {
      // The reason is a short OAuth error code, never a provider body.
      logApiError("/api/integrations/[provider]/callback", new Error(exchanged.reason), {
        provider: provider.id,
        stage: "exchange",
      });
      return back("exchange_failed");
    }

    // A grant the user narrowed on the consent screen is worse than no
    // grant: the card would say "Connected" and every read would fail. Say
    // so now, while they remember what they just clicked.
    const granted = new Set(exchanged.tokens.scopes);
    const missing = provider.scopes.filter((scope) => granted.size > 0 && !granted.has(scope));
    if (missing.length > 0) return back("missing_scopes");

    const label = await fetchAccountLabel(provider.id, exchanged.tokens.accessToken);

    const saved = await saveIntegration({
      userId: user.id,
      provider: provider.id,
      tokens: exchanged.tokens,
      accountLabel: label,
    });

    const response = saved.ok ? back("connected") : back("save_failed");
    // The one-time state is consumed whatever the outcome, so a code
    // cannot be replayed against a still-valid cookie.
    response.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/integrations",
      maxAge: 0,
    });
    return response;
  } catch (err) {
    logApiError("/api/integrations/[provider]/callback", safeErrorDetail(err), {
      provider: params.provider,
    });
    return back("error");
  }
}
