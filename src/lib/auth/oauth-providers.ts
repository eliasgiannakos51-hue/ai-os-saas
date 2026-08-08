import "server-only";

// WHY THIS FILE EXISTS.
//
// The reported bug was a "Continue with Google" button that answered every
// click with a raw API error:
//
//   {"code":400,"error_code":"validation_failed",
//    "msg":"Unsupported provider: provider is not enabled"}
//
// Nothing was wrong with the request. `signInWithOAuth({ provider:
// "google" })` sends exactly the slug GoTrue expects — the same one the
// Supabase dashboard's own toggle writes (GOTRUE_EXTERNAL_GOOGLE_ENABLED).
// The 400 means the auth server has that provider switched OFF, which is
// project configuration, not application code. No amount of client-side
// error handling makes that button work.
//
// So the fix is not to handle the error better. It is to stop rendering a
// button whose only possible outcome is that error. GoTrue publishes which
// providers are actually enabled at GET /auth/v1/settings — an
// unauthenticated, public endpoint (the anon key is still sent, because
// newer GoTrue builds require an apikey on every route). That is the
// single source of truth: the same server that would reject the sign-in
// is the one being asked whether it would.
//
// FAIL CLOSED. If the probe errors, times out, or answers with something
// unrecognisable, no provider is reported as enabled and no social button
// renders. A missing button is a page that still works — email and
// password are right below it. A button that 400s is a dead end that
// makes the product look broken, which is the exact bug being fixed.
//
// Deliberately NOT a NEXT_PUBLIC_* flag: an env var is a second copy of
// the truth that drifts the moment someone flips the toggle in the
// dashboard and forgets to redeploy, and this bug is precisely a
// mismatch between what the app believes and what the auth server does.

// Every provider the UI can render a button for. Probing is pointless for
// anything not in here, and this keeps an unexpected key in GoTrue's
// response from turning into a button with no implementation behind it.
export const SUPPORTED_OAUTH_PROVIDERS = ["google"] as const;
export type OAuthProvider = (typeof SUPPORTED_OAUTH_PROVIDERS)[number];

// The settings endpoint is small and its answer only changes when someone
// edits the project's auth config, so a five-minute cache is generous. It
// also bounds the blast radius of the probe: at most one request per
// server instance per five minutes, no matter how many people load /login.
const CACHE_TTL_MS = 5 * 60 * 1000;
// Short on purpose. This runs while rendering /login — a slow auth server
// must not hold the page. Timing out is a fail-closed answer, same as an
// error, and 3s is far longer than the endpoint's normal response.
const PROBE_TIMEOUT_MS = 3000;

type CacheEntry = { at: number; providers: OAuthProvider[] };
let cache: CacheEntry | null = null;

/** Test seam: drops the memoised answer so a test can probe again. */
export function resetOAuthProviderCache() {
  cache = null;
}

/**
 * Parses GoTrue's /auth/v1/settings body into the list of providers this
 * app both supports and finds switched on.
 *
 * The shape is `{ external: { google: true, github: false, ... } }`. A
 * provider is enabled only when its value is the boolean `true` — GoTrue
 * has shipped both booleans and strings here across versions, and treating
 * the string "false" as truthy is exactly how a fail-closed check turns
 * into a fail-open one.
 */
export function parseEnabledProviders(body: unknown): OAuthProvider[] {
  if (!body || typeof body !== "object") return [];
  const external = (body as { external?: unknown }).external;
  if (!external || typeof external !== "object") return [];
  const flags = external as Record<string, unknown>;
  return SUPPORTED_OAUTH_PROVIDERS.filter((p) => flags[p] === true);
}

/**
 * Which OAuth providers this project's auth server will actually accept.
 *
 * Returns an empty array — never throws — when the probe cannot be made or
 * cannot be trusted. Callers render a button only for what is in the list.
 */
export async function getEnabledOAuthProviders(): Promise<OAuthProvider[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.providers;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Not configured at all (a preview build, a misconfigured environment).
  // There is nothing to ask, so nothing is enabled.
  if (!url || !anonKey) {
    cache = { at: now, providers: [] };
    return [];
  }

  let providers: OAuthProvider[] = [];
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      // Next's fetch cache is per-request-scope and would also cache a
      // transient failure into the page's own full-route cache; the
      // module-level cache above is the one that should own this.
      cache: "no-store",
    });
    if (res.ok) providers = parseEnabledProviders(await res.json());
  } catch {
    // Fail closed. Intentionally silent: this runs on a public page and a
    // provider probe failing is not an application error, it is a reason
    // to show one fewer button.
    providers = [];
  }

  cache = { at: now, providers };
  return providers;
}
