import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { getSiteUrl } from "@/lib/site-url";
import { secretsMatch } from "@/lib/integrations/crypto";
import { getProvider, type ProviderId, type ProviderMeta } from "@/lib/integrations/providers";

// One OAuth implementation for every provider.
//
// The per-provider differences are three URLs and a couple of parameter
// names, so they are a table rather than three copies of the same flow.
// Everything that is easy to get wrong — CSRF state, PKCE, the redirect
// URI, what happens when the provider returns an error — is written once,
// here, and is the same for every provider added later.

export type OAuthFamilyConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl: string | null;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** RFC 7636. Google supports it; Slack's v2 flow does not. */
  usesPkce: boolean;
  /** Extra parameters on the authorize request. */
  extraAuthParams: Record<string, string>;
  /** Slack returns scopes space-separated under a different key. */
  scopeSeparator: string;
};

const FAMILIES: Record<ProviderMeta["oauthFamily"], OAuthFamilyConfig> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    usesPkce: true,
    extraAuthParams: {
      // Without access_type=offline Google issues NO refresh token, and
      // the integration silently dies an hour after it is connected.
      access_type: "offline",
      // And without prompt=consent it issues one only on the FIRST ever
      // authorisation for that client — so a user who connects Gmail,
      // disconnects, and reconnects gets an access token with no way to
      // renew it. This is the single most common way a Google integration
      // "works, then stops working, only for some users".
      prompt: "consent",
      // Do NOT quietly accumulate previously-granted scopes. A Drive
      // connection must ask for Drive, not inherit Gmail because the user
      // once connected that too — data minimisation is the whole reason
      // these are separate integrations.
      include_granted_scopes: "false",
    },
    scopeSeparator: " ",
  },
  slack: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    revokeUrl: "https://slack.com/api/auth.revoke",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    usesPkce: false,
    extraAuthParams: {},
    scopeSeparator: ",",
  },
};

export function familyConfig(provider: ProviderMeta): OAuthFamilyConfig {
  return FAMILIES[provider.oauthFamily];
}

/** True when this provider's OAuth app is configured on this deployment. */
export function providerConfigured(id: ProviderId): boolean {
  const provider = getProvider(id);
  if (!provider) return false;
  return provider.requiredEnv.every((name) => Boolean(process.env[name]?.trim()));
}

export function redirectUriFor(id: ProviderId): string {
  return `${getSiteUrl().replace(/\/+$/, "")}/api/integrations/${id}/callback`;
}

// ---------------------------------------------------------------------
// CSRF state, and why it is signed AND cookie-bound.
// ---------------------------------------------------------------------
//
// The attack this closes: an attacker completes an OAuth flow against
// THEIR OWN Google account, intercepts the resulting redirect, and feeds
// the `code` to a logged-in victim's browser. Without a check, the
// victim's account silently ends up connected to the attacker's mailbox —
// and from then on the "user's" AI is reading, and acting on, data the
// attacker controls. That is a prompt-injection channel with a login page.
//
// Two independent bindings, because either alone is defeatable:
//   1. The state is HMAC-signed with a server secret, so it cannot be
//      forged or edited (an attacker cannot swap the user id in it).
//   2. A nonce is ALSO stored in an HttpOnly cookie, so a state issued to
//      one browser cannot be replayed in another. Signing alone would let
//      an attacker reuse a state they legitimately obtained.

const STATE_TTL_MS = 10 * 60 * 1000;

export const OAUTH_STATE_COOKIE = "ionexa_oauth";

export type OAuthStatePayload = {
  /** Random, matched against the cookie. */
  n: string;
  p: ProviderId;
  /** The user the flow was started by. */
  u: string;
  /** Issued-at, epoch ms. */
  t: number;
};

function stateSecret(): string {
  // Reuses a secret that already exists on every correctly configured
  // deployment rather than inventing another one to forget. The service
  // role key never leaves the server, and this only ever derives an HMAC
  // key from it — the key itself is never transmitted or stored.
  const secret =
    process.env.INTEGRATION_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!secret) {
    throw new Error("No server secret available to sign the OAuth state with.");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", stateSecret()).update(value).digest("base64url");
}

export function encodeState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export type StateCheck =
  | { ok: true; payload: OAuthStatePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function decodeState(state: string, now = Date.now()): StateCheck {
  const parts = String(state ?? "").split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, signature] = parts;

  // Constant-time: a signature check that leaks timing is a signature
  // check an attacker can grind.
  if (!secretsMatch(signature, sign(body))) return { ok: false, reason: "bad_signature" };

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    !payload ||
    typeof payload.n !== "string" ||
    typeof payload.p !== "string" ||
    typeof payload.u !== "string" ||
    typeof payload.t !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (now - payload.t > STATE_TTL_MS || payload.t > now + 60_000) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

// ---------------------------------------------------------------------
// PKCE.
// ---------------------------------------------------------------------

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ---------------------------------------------------------------------
// The three calls.
// ---------------------------------------------------------------------

export function buildAuthorizeUrl(params: {
  provider: ProviderMeta;
  state: string;
  codeChallenge?: string;
}): string {
  const config = familyConfig(params.provider);
  const clientId = process.env[config.clientIdEnv]?.trim();
  if (!clientId) throw new Error(`${config.clientIdEnv} is not configured.`);

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUriFor(params.provider.id));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.provider.scopes.join(config.scopeSeparator));
  url.searchParams.set("state", params.state);
  for (const [k, v] of Object.entries(config.extraAuthParams)) url.searchParams.set(k, v);
  if (config.usesPkce && params.codeChallenge) {
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute expiry, or null for a token the provider says never expires. */
  expiresAt: Date | null;
  /** What was ACTUALLY granted, which can be less than what was asked. */
  scopes: string[];
  /** Non-sensitive display data for the card. */
  metadata: Record<string, unknown>;
};

export type TokenExchangeResult =
  | { ok: true; tokens: TokenSet }
  | { ok: false; reason: string };

/** Shared fetch wrapper. Never returns a provider body to the caller —
 *  those routinely echo the request, and the request carried a secret. */
async function postForm(
  url: string,
  form: Record<string, string>
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; reason: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      // Never cached: Next patches global fetch with a Data Cache that
      // persists across builds, and a cached token response would hand the
      // same expiring token to every later request.
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  let json: Record<string, unknown>;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: `bad_response_${response.status}` };
  }

  if (!response.ok) {
    // `error` on an OAuth error response is a short machine code
    // ("invalid_grant"), not free text — safe to surface, and the only
    // thing that makes a failure diagnosable.
    const code = typeof json.error === "string" ? json.error : `http_${response.status}`;
    return { ok: false, reason: code };
  }
  // Slack answers 200 with { ok: false, error: "..." }.
  if (json.ok === false) {
    return { ok: false, reason: typeof json.error === "string" ? json.error : "provider_error" };
  }
  return { ok: true, json };
}

function expiryFrom(json: Record<string, unknown>): Date | null {
  const seconds = Number(json.expires_in);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  // 60 seconds of slack, so a token is refreshed just before it dies
  // rather than just after a request fails with it.
  return new Date(Date.now() + (seconds - 60) * 1000);
}

export async function exchangeCodeForTokens(params: {
  provider: ProviderMeta;
  code: string;
  codeVerifier?: string;
}): Promise<TokenExchangeResult> {
  const config = familyConfig(params.provider);
  const clientId = process.env[config.clientIdEnv]?.trim();
  const clientSecret = process.env[config.clientSecretEnv]?.trim();
  if (!clientId || !clientSecret) return { ok: false, reason: "not_configured" };

  const form: Record<string, string> = {
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUriFor(params.provider.id),
    grant_type: "authorization_code",
  };
  if (config.usesPkce && params.codeVerifier) form.code_verifier = params.codeVerifier;

  const result = await postForm(config.tokenUrl, form);
  if (!result.ok) return result;

  return { ok: true, tokens: normaliseTokens(params.provider, result.json) };
}

export async function refreshAccessToken(params: {
  provider: ProviderMeta;
  refreshToken: string;
}): Promise<TokenExchangeResult> {
  const config = familyConfig(params.provider);
  const clientId = process.env[config.clientIdEnv]?.trim();
  const clientSecret = process.env[config.clientSecretEnv]?.trim();
  if (!clientId || !clientSecret) return { ok: false, reason: "not_configured" };

  const result = await postForm(config.tokenUrl, {
    refresh_token: params.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  if (!result.ok) return result;

  const tokens = normaliseTokens(params.provider, result.json);
  // A refresh response usually omits the refresh token, which means "keep
  // using the one you have" — NOT "you no longer have one". Returning null
  // here would make the caller wipe a perfectly good refresh token and
  // break the integration permanently on its first renewal.
  return { ok: true, tokens: { ...tokens, refreshToken: tokens.refreshToken ?? params.refreshToken } };
}

function normaliseTokens(provider: ProviderMeta, json: Record<string, unknown>): TokenSet {
  const config = familyConfig(provider);

  if (provider.oauthFamily === "slack") {
    // Slack's v2 shape: the BOT token is what posts messages, and it is
    // nested differently from the user token. Taking authed_user.access_token
    // by mistake yields a token that cannot post to a channel.
    const team = (json.team ?? {}) as Record<string, unknown>;
    const accessToken = String(json.access_token ?? "");
    return {
      accessToken,
      refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
      expiresAt: expiryFrom(json),
      scopes: String(json.scope ?? "")
        .split(config.scopeSeparator)
        .map((s) => s.trim())
        .filter(Boolean),
      metadata: {
        team_id: typeof team.id === "string" ? team.id : null,
        team_name: typeof team.name === "string" ? team.name : null,
        bot_user_id: typeof json.bot_user_id === "string" ? json.bot_user_id : null,
      },
    };
  }

  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresAt: expiryFrom(json),
    scopes: String(json.scope ?? "")
      .split(" ")
      .map((s) => s.trim())
      .filter(Boolean),
    metadata: {},
  };
}

/**
 * Tells the PROVIDER to forget the grant.
 *
 * Deleting our row is necessary and not sufficient: the grant still exists
 * in the user's Google or Slack account until it is revoked there, and a
 * "Disconnect" that leaves a live grant behind is not a disconnect. Best
 * effort — a provider that is down must not stop us deleting our copy.
 */
export async function revokeAtProvider(provider: ProviderMeta, accessToken: string): Promise<boolean> {
  const config = familyConfig(provider);
  if (!config.revokeUrl) return false;
  try {
    if (provider.oauthFamily === "slack") {
      const response = await fetch(config.revokeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });
      return response.ok;
    }
    const response = await fetch(config.revokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: accessToken }).toString(),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
