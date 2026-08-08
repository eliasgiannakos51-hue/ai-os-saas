import "server-only";
import { createHash } from "node:crypto";

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
//   img-src allows data: and https: because generated pages use inline
//     SVGs and real photos from Unsplash/picsum.
//   frame-src is the same allowlist the static scan enforces (maps,
//     video), so the two cannot disagree.
//   form-action is restricted to self, so a page cannot POST a visitor's
//     details to a third party — the one thing a phishing page most wants
//     to do, and the reason this is not just 'default-src'.
//   base-uri 'none' stops a <base> tag from re-pointing every relative
//     URL on the page.
//   object-src 'none' — no Flash/applet/plugin surface at all.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-src https://www.google.com https://maps.google.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

export function publishedSiteHeaders(options: { cacheSeconds?: number } = {}): HeadersInit {
  const cache = options.cacheSeconds ?? 60;
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": CSP_DIRECTIVES,
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

export const PUBLIC_RATE_LIMIT = {
  windowMs: WINDOW_MS,
  maxRequests: MAX_REQUESTS_PER_WINDOW,
};

// EU AI Act, Article 50 (V3 Task 15): a published site is AI-generated
// content served to the open web, so it carries a MACHINE-READABLE
// marking, injected at serve time. A <meta name="generator"> plus an
// HTML comment right after <head> — visible to crawlers, archives and
// anyone who views source, invisible to the page's design (altering the
// rendered layout of somebody's published site to add a badge would be
// defacing their work in the name of compliance; the human-facing
// disclosure lives in the product and on /ai-transparency instead).
// Idempotent: serving the same page twice never doubles the marking.
const AI_MARKING =
  '<!-- AI-generated content: this page was generated with AI on Ionexa AI (ionexa.ai). EU AI Act Art. 50 transparency marking. -->' +
  '<meta name="generator" content="Ionexa AI (AI-generated content)" />';

export function withAiContentMarking(html: string): string {
  if (html.includes('content="Ionexa AI (AI-generated content)"')) return html;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return html.slice(0, insertAt) + AI_MARKING + html.slice(insertAt);
  }
  // No <head> at all (malformed generation) — prepend, which keeps the
  // marking present without pretending to know the document's structure.
  return AI_MARKING + html;
}
