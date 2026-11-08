import "server-only";
import { createHash } from "node:crypto";
import { ALLOWED_IFRAME_EMBEDS } from "@/lib/website-html-security-scan";
import { REFERENCE_IMAGE_BUCKET } from "@/lib/website-reference-image";
import { getSiteUrl } from "@/lib/site-url";

// Everything the public site route needs that is not a database call.
//
// Kept out of the route itself so the two things that are easy to get
// wrong — the response headers and the "is this the same visitor" rule —
// are readable on their own and testable without a server.

// ---------------------------------------------------------------------
// Response headers.
// ---------------------------------------------------------------------
//
// A published site is arbitrary AI-generated HTML that we serve from our
// own origin. That is the whole risk: anything it contains runs with our
// domain's privileges unless the response says otherwise.
//
// The CSP below is the strictest one the generated sites can actually
// live under, derived from what lib/website-builder.ts's system prompt is
// allowed to produce:
//
//   'unsafe-inline' for script and style — generated sites are ONE file,
//     with their CSS and their (small, self-contained) JS inline. This is
//     the real cost of single-file generation and it is stated rather than
//     hidden. What it does NOT allow is the thing that matters: no
//     external script host is in script-src, so an injected
//     <script src="//evil"> is blocked by the browser even if it somehow
//     survived the static scan.
//   'self' is also in script-src, for exactly ONE reference the
//     generation prompt is allowed to write: <script src="/ionexa-players.js">
//     (cinematic sites, docs/v6-cinematic-sites-2026-10-03.md). It is
//     same-origin by construction — the published site IS this app's
//     origin — and nothing else widens 'self' into an attacker's host.
//     The scanner's own allowlist (ALLOWED_OWN_SCRIPT_SRCS,
//     website-html-security-scan.ts) is what keeps it to that one path.
//   img-src and media-src name the hosts a generated page's pictures
//     really come from, and nothing else (since 2026-11-05; before, any
//     https: host): inline SVG and data: URIs, Unsplash's CDN (the
//     resolver's `urls.regular`, lib/unsplash.ts), and the owner's own
//     uploads under this project's Storage bucket for them
//     (lib/website-reference-image.ts). There is no picsum fallback any
//     more — an unresolved photo placeholder has its <img> removed rather
//     than filled with a random image; see lib/website-image-resolver.ts.
//     A picture from anywhere else does not load; the point is that a
//     request to anywhere else does not leave either.
//   frame-src is BUILT FROM the static scan's own allowlist below, so the
//     two cannot disagree. They used to be two hand-written lists with
//     this same comment claiming they could not — and they did: the scan
//     allowed "youtube.com" with no subdomain, which this directive's
//     https://www.youtube.com blocks. A page passed the scan, got
//     published, and then failed to render its own video with no error
//     anywhere. The comment is true now because there is one list.
//   form-action and connect-src name the app's own form endpoint path
//     (/api/websites/), where a site's contact form posts; connect-src
//     names nothing else, so a page's script cannot call the rest of the
//     app's API. form-action keeps 'self' as well.
//   WHAT THIS DOES NOT DO, said plainly because an earlier version of
//     this comment claimed otherwise: none of it stops a page from sending
//     what a visitor typed somewhere else. A page can navigate itself or
//     open a window to any address with the text in the URL, and a browser
//     resolves names it is asked to prefetch — a CSP governs what a page
//     LOADS, not where it GOES. And the form endpoint it may reach stores
//     a submission for whoever owns the site. So a page that asks for a
//     password is refused before it is published
//     (lib/publishing/credential-fields.ts, read by the site scan and by
//     Rebuild's checkAppHtml), the form endpoint drops password-like
//     fields, and the lasting answer is serving all of this from a domain
//     that is not ours (lib/publishing/content-origin.ts).
//   base-uri 'none' stops a <base> tag from re-pointing every relative
//     URL on the page.
//   object-src 'none' — no Flash/applet/plugin surface at all.
//   sandbox WITHOUT allow-same-origin — the one directive that answers
//     "we serve it from our own origin". Everything above limits what the
//     page may load; none of it stops the page's own inline script from
//     acting AS our origin. Measured 2026-10-02 in a real browser
//     (scripts/tests/published-origin.prodtest.mjs) before this line
//     existed: a published page's script read a signed-in visitor's whole
//     session cookie — @supabase/ssr keeps it in document.cookie, so it is
//     not httpOnly — and read /api/credits/balance as them, 200 with their
//     balance. The only thing in the way was the generator's prompt asking
//     it not to write script, and a prompt is not a boundary.
//     Sandboxed, the page gets an opaque origin of its own: no cookie, no
//     storage, and a fetch to the app is a cross-site request carrying no
//     credentials. What the page still needs is granted by name:
//       allow-scripts      scroll-reveal and the contact-form handler
//       allow-forms        the contact form
//       allow-popups       target="_blank" links (Instagram, a map)
//       allow-popups-to-escape-sandbox  so the site a link opens is a
//                          normal page, not a crippled sandboxed one
//     The contact form keeps working because its endpoint already answers
//     any origin (api/websites/[id]/submit-form, corsHeaders — a site is
//     also meant to be downloaded and hosted elsewhere). NEVER add
//     allow-same-origin here: next to allow-scripts it hands the page our
//     origin back, and scripts/tests/publishing-sandbox.test.mjs is red on it.
const SANDBOX_TOKENS = ["allow-scripts", "allow-forms", "allow-popups", "allow-popups-to-escape-sandbox"];

/** Where a generated page's photographs come from besides its own
 *  uploads: Unsplash's CDN. `plus.` is Unsplash+'s, which the search API
 *  can return. */
export const PUBLISHED_IMAGE_HOSTS = ["https://images.unsplash.com", "https://plus.unsplash.com"] as const;

/** An origin, or null for anything that does not parse as http(s). */
function originOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The published pages' policy. `appUrl` is the app's own address (forms
 * post to its /api/websites/), `supabaseUrl` the project whose Storage
 * serves the owner's uploads. Either missing leaves its source out rather
 * than widening anything.
 */
export function buildPublishedCsp(options: { appUrl?: string | null; supabaseUrl?: string | null }): string {
  const app = originOf(options.appUrl);
  const storage = originOf(options.supabaseUrl);
  const uploads = storage ? [`${storage}/storage/v1/object/public/${REFERENCE_IMAGE_BUCKET}/`] : [];
  const formPath = app ? [`${app}/api/websites/`] : [];
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    ["img-src 'self' data: blob:", ...PUBLISHED_IMAGE_HOSTS, ...uploads].join(" "),
    ["media-src 'self' data: blob:", ...uploads].join(" "),
    formPath.length > 0 ? `connect-src ${formPath.join(" ")}` : "connect-src 'none'",
    ["form-action 'self'", ...formPath].join(" "),
    `frame-src ${ALLOWED_IFRAME_EMBEDS.map((embed) => `https://${embed.host}`).join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
    `sandbox ${SANDBOX_TOKENS.join(" ")}`,
  ].join("; ");
}

export function publishedSiteHeaders(options: { cacheSeconds?: number } = {}): HeadersInit {
  const cache = options.cacheSeconds ?? 60;
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": buildPublishedCsp({
      // The same address the generator wrote into each form's endpoint
      // (api/websites/generate/process and api/websites/edit).
      appUrl: getSiteUrl(),
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    }),
    // Belt and braces with frame-ancestors: older browsers honour only
    // this one, and clickjacking a published site is a real attack on its
    // owner's visitors.
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Nothing a generated marketing page has any business asking for.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    // Short, and revalidated: a live edit has to be visible within about a
    // minute, which is what "the live site updates immediately" has to
    // mean once a CDN is in front of this. s-maxage lets the edge cache it
    // while keeping the browser honest.
    "Cache-Control": `public, max-age=0, s-maxage=${cache}, stale-while-revalidate=300`,
    // Published pages are indexable — that is the point of having one.
    "X-Robots-Tag": "index, follow",
  };
}

/** Headers for the 404. Never cached for long: a site published a minute
 *  ago must not keep serving "not found" to the first person who tried. */
export function notFoundHeaders(): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=0, s-maxage=30",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

// ---------------------------------------------------------------------
// Visitor counting, without cookies and without personal data.
// ---------------------------------------------------------------------
//
// The rule this is built around: nothing that could identify a person is
// ever WRITTEN anywhere. site_analytics has no column that could hold an
// IP or a user agent, and this function never returns one — it returns a
// boolean.
//
// The fingerprint is salted with a value that changes every day and is
// never stored, so yesterday's hash cannot be recomputed even by us; and
// it is truncated, so it is a bucket rather than an identifier. It lives
// in memory for the current day only.
//
// HONEST LIMITATION, stated because the alternative is a number that
// quietly lies: this process's memory is not shared across serverless
// instances. On a deployment with several warm instances the same visitor
// can be counted as unique once per instance, so unique_visitors is a
// LOWER-BOUND-ish approximation and views is exact. That is why the
// dashboard shows views and not uniques.

const DAILY_SALT = createHash("sha256")
  .update(String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "ionexa"))
  .digest("hex");

type SeenState = { day: string; hashes: Set<string> };
const seen: SeenState = { day: "", hashes: new Set() };

// A ceiling on the in-memory set, so a busy day cannot grow it without
// bound. Past this, every further visitor is counted as returning — which
// under-counts uniques rather than leaking memory.
const MAX_TRACKED_PER_DAY = 50_000;

export function isLikelyNewVisitor(request: Request, siteId: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (seen.day !== today) {
    seen.day = today;
    seen.hashes.clear();
  }
  if (seen.hashes.size >= MAX_TRACKED_PER_DAY) return false;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "";
  const ua = request.headers.get("user-agent") ?? "";
  // Truncated to 16 hex chars: enough to make collisions rare at this
  // scale, short enough that it is a bucket and not a handle.
  const fingerprint = createHash("sha256")
    .update(`${DAILY_SALT}:${today}:${siteId}:${ip}:${ua}`)
    .digest("hex")
    .slice(0, 16);

  if (seen.hashes.has(fingerprint)) return false;
  seen.hashes.add(fingerprint);
  return true;
}

// ---------------------------------------------------------------------
// Rate limiting the public route.
// ---------------------------------------------------------------------
//
// In memory, not in the database, on purpose: the DB-backed limiter in
// lib/rate-limit.ts writes a row per check, and doing that on every public
// page view would turn a traffic spike into a write storm — the limiter
// would become the outage.
//
// What this is: a per-instance sliding window that blunts a single noisy
// source. What it is NOT, and must not be mistaken for: DDoS protection.
// That is the CDN's job, and it is stated here so nobody reads this and
// concludes the problem is handled.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 240; // 4/second sustained from one source

const buckets = new Map<string, { count: number; resetAt: number }>();

export function publicRequestAllowed(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  // Hashed so the key held in memory is not itself an IP address.
  const key = createHash("sha256").update(`${DAILY_SALT}:${ip}`).digest("hex").slice(0, 16);
  const now = Date.now();

  // Opportunistic sweep, so the map cannot grow without bound.
  if (buckets.size > 20_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= MAX_REQUESTS_PER_WINDOW;
}

// THE LIMIT IS NOT EXPORTED, AND NOTHING WANTED IT. `PUBLIC_RATE_LIMIT`
// mirrored WINDOW_MS and MAX_REQUESTS_PER_WINDOW into a two-field object
// "so a caller can report or reuse the limit"; no caller ever imported
// it, and the limiter above reads the two module-private constants
// directly. A mirror with no reader is a second copy of two numbers that
// must agree, kept in step by nothing.
