import { validateSubdomain } from "@/lib/publishing/subdomain";

/**
 * WHERE PUBLISHED SITES AND APPS ARE SERVED FROM — THE APP'S OWN DOMAIN
 * TODAY, A DOMAIN OF THEIR OWN ONCE ONE IS CONFIGURED.
 *
 * A published site (/s/<name>) and a published Rebuild app (/a/<name>) are
 * HTML somebody else's AI wrote, and on the app's own domain the address
 * bar shows OUR name above it. The CSP sandbox (lib/publishing/
 * public-serving.ts) keeps the page from acting AS the app; it cannot keep
 * it from LOOKING like the app. Only a different domain does that.
 *
 * Set PUBLISHED_SITE_DOMAIN (e.g. `ionexa.site`, with a wildcard domain
 * `*.ionexa.site` and the apex `ionexa.site` both added to the Vercel
 * project) and:
 *   - a site is served at https://<name>.<domain>/ and its pages below it,
 *     rewritten to /s/<name>/... by src/proxy.ts before any session is read;
 *   - an app is served at https://<domain>/a/<name>;
 *   - the same paths on the app's own domain answer with a permanent
 *     redirect there (wrongOriginRedirect, called first by each /s/ and /a/
 *     route), so an old link keeps working and the app's domain serves no
 *     user content at all;
 *   - nothing else is reachable on the content domain: not a page of the
 *     app, not its API — except a site's own form endpoint, for a form
 *     written with a relative action.
 * docs/NEEDS-FROM-ELIAS.md («Ασφάλεια 2026-11-05») has the owner's steps.
 * Unset, nothing here changes anything.
 *
 * Pure: scripts/tests/published-isolation.test.mjs runs it.
 */

/** The configured content domain, normalised, or null when there is none
 *  (or it is not a plain host name). */
export function contentDomain(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const normalised = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!normalised) return null;
  // A bare host: labels of letters, digits and hyphens, at least one dot,
  // no port, no path, no credentials.
  if (!/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalised)) return null;
  return normalised;
}

/** The host a request arrived for, lowercased, port removed. `host` first:
 *  it is what the platform routed on. */
export function requestHost(headers: { get(name: string): string | null }): string | null {
  const raw = headers.get("host") ?? headers.get("x-forwarded-host");
  if (!raw) return null;
  const first = raw.split(",")[0].trim().toLowerCase();
  return first.replace(/:\d+$/, "") || null;
}

/** The label of `host` under `domain` (`acme` for `acme.ionexa.site`), or
 *  null when `host` is not one label directly under it. */
function siteLabel(host: string, domain: string): string | null {
  if (!host.endsWith(`.${domain}`)) return null;
  const label = host.slice(0, -(domain.length + 1));
  if (!label || label.includes(".")) return null;
  const check = validateSubdomain(label);
  return check.ok ? check.subdomain : null;
}

/** Is `host` the content domain or a site under it? */
export function isContentHost(host: string | null, domain: string | null): boolean {
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

const FORM_ENDPOINT = /^\/api\/websites\/[^/]+\/submit-form\/?$/;

export type ContentRoute =
  /** Serve this path of the app instead (no session read). */
  | { kind: "rewrite"; pathname: string }
  /** Serve the path as it is (an app under /a/, a form endpoint). */
  | { kind: "pass" }
  /** Nothing of the app lives on the content domain. */
  | { kind: "not_found" };

/**
 * What a request to the content domain is, or null when it is not for the
 * content domain at all (then the app handles it as before).
 */
export function routeContentHost(host: string | null, pathname: string, domain: string | null): ContentRoute | null {
  if (!isContentHost(host, domain)) return null;
  const h = host as string;
  const d = domain as string;
  if (FORM_ENDPOINT.test(pathname)) return { kind: "pass" };
  if (h === d) {
    // The apex carries apps, at /a/<name> and nothing below it.
    const m = /^\/a\/([^/]+)\/?$/.exec(pathname);
    return m && validateSubdomain(m[1]).ok ? { kind: "pass" } : { kind: "not_found" };
  }
  const label = siteLabel(h, d);
  if (!label) return { kind: "not_found" };
  const rest = pathname === "/" ? "" : pathname.replace(/\/+$/, "");
  // A site's pages are one segment deep (/services), plus its sitemap and
  // robots file; anything deeper is not a page of a site.
  if (rest !== "" && !/^\/[^/]+$/.test(rest)) return { kind: "not_found" };
  return { kind: "rewrite", pathname: `/s/${label}${rest}` };
}

/**
 * Where a request for a site or app on the APP's own domain belongs, once
 * a content domain is configured — or null to serve it here (no domain is
 * configured, or the request already came in through the content domain).
 */
export function wrongOriginRedirect(
  request: { url: string; headers: { get(name: string): string | null } },
  domain: string | null
): string | null {
  if (!domain) return null;
  if (isContentHost(requestHost(request.headers), domain)) return null;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  const site = /^\/s\/([^/]+)(\/[^/]+)?\/?$/.exec(url.pathname);
  if (site) {
    const check = validateSubdomain(site[1]);
    if (!check.ok) return null;
    return `https://${check.subdomain}.${domain}${site[2] ?? "/"}${url.search}`;
  }
  const app = /^\/a\/([^/]+)\/?$/.exec(url.pathname);
  if (app) {
    const check = validateSubdomain(app[1]);
    if (!check.ok) return null;
    return `https://${domain}/a/${check.subdomain}${url.search}`;
  }
  return null;
}

/** The base a published app's address is built on: the content domain
 *  when one is configured, else null (the caller uses its own origin). */
export function publishedAppBase(domain: string | null): string | null {
  return domain ? `https://${domain}` : null;
}
