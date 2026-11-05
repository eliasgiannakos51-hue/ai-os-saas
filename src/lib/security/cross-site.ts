/**
 * A WRITE TO THE API FROM ANOTHER SITE IS REFUSED (2026-11-05 review, A5).
 *
 * The session cookie's SameSite was the only thing standing between a
 * page on another site and a write made with this browser's session —
 * including the one that SETS a session, the sign-in. Browsers say where a
 * request came from in two headers, and src/proxy.ts asks both before any
 * `/api/*` route runs:
 *
 *   Sec-Fetch-Site: cross-site     refused
 *   Origin: <not this app's host>  refused (including the opaque "null")
 *
 * A request with neither header is not a browser's cross-site request —
 * Stripe, Vercel's scheduler and the desktop app send neither — so it
 * passes to the route, which has its own check of who is asking. Reads
 * (GET, HEAD, OPTIONS) pass: they change nothing.
 *
 * THE EXCEPTIONS, each a route that other sites reach ON PURPOSE.
 * scripts/tests/cross-site-writes.test.mjs ranges over every
 * route in src/app/api, and an exception must still match a route and
 * say why it needs to be one.
 */
export type CrossSiteException = { readonly pattern: RegExp; readonly route: string; readonly why: string };

export const CROSS_SITE_EXCEPTIONS: readonly CrossSiteException[] = [
  {
    pattern: /^\/api\/webhooks\//,
    route: "src/app/api/webhooks/stripe/route.ts",
    why: "Stripe's servers post here; every event is verified by its signature (constructEvent) over the raw body, and no browser session is read.",
  },
  {
    pattern: /^\/api\/cron\//,
    route: "src/app/api/cron/scheduled-runs/route.ts",
    why: "Vercel's scheduler calls these with the cron secret (checkCronAuth); no browser session is read.",
  },
  {
    pattern: /^\/api\/websites\/[^/]+\/submit-form$/,
    route: "src/app/api/websites/[id]/submit-form/route.ts",
    why: "the contact form on a customer's published site. Those pages are served sandboxed without allow-same-origin (/s/), so their requests carry an opaque origin on purpose; the route reads no session, only the site id, and is bounded per IP.",
  },
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCrossSiteException(pathname: string): boolean {
  return CROSS_SITE_EXCEPTIONS.some((e) => e.pattern.test(pathname));
}

/**
 * The host (with its port) an Origin header or a configured URL names, or
 * null for anything that is not one — the opaque "null" included. A bare
 * host, as the Host header carries it, is accepted as itself.
 *
 * COMPARED BY HOST, the way Next's own server-action check compares Origin
 * with the request's host: behind a proxy that ends TLS, the request this
 * code sees can say http while the browser's Origin says https, and a
 * scheme mismatch must not refuse every write the app makes.
 */
function hostOf(value: string): string | null {
  // No lower-casing here: the URL parser already lower-cases a host, and
  // browsers write the opaque origin as exactly "null".
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") return null;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).host || null;
  } catch {
    return null;
  }
}

export function crossSiteVerdict(input: {
  method: string;
  pathname: string;
  secFetchSite: string | null;
  origin: string | null;
  /** Every host this app is served from: the request's own Host, and the configured site URL. */
  ownHosts: readonly (string | null | undefined)[];
}): "allow" | "refuse" {
  if (!input.pathname.startsWith("/api/")) return "allow";
  if (SAFE_METHODS.has(input.method.toUpperCase())) return "allow";
  if (isCrossSiteException(input.pathname)) return "allow";
  if (input.secFetchSite?.toLowerCase() === "cross-site") return "refuse";
  if (input.origin !== null) {
    const own = new Set(input.ownHosts.map((h) => (h ? hostOf(h) : null)).filter((h): h is string => h !== null));
    const from = hostOf(input.origin);
    if (from === null || !own.has(from)) return "refuse";
  }
  return "allow";
}

/**
 * The credential routes take JSON and nothing else (A5). A form on another
 * site can post url-encoded or plain text without the browser asking first;
 * it cannot post JSON to another origin without a preflight this app never
 * answers. Returns the reason to refuse, or null.
 */
export function requireJsonBody(request: Request): "unsupported_media_type" | null {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return type === "application/json" ? null : "unsupported_media_type";
}
