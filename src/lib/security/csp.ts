/**
 * THE APP'S CSP, BUILT PER REQUEST WITH A FRESH NONCE (security audit,
 * 2026-10-21).
 *
 * WHY THIS CANNOT BE A STATIC HEADER IN next.config.mjs. The first
 * attempt was exactly that — `script-src 'self' 'sha256-<hash of the
 * one inline script in layout.tsx>'` — and it broke every page: the App
 * Router streams Server Component data to the client through its OWN
 * inline `<script>self.__next_f.push(...)</script>` tags, one or more
 * per page, and their content is the page's actual data — different on
 * every request, so no fixed hash can ever cover them. A real `next
 * build && next start` with Playwright caught this before it shipped;
 * without the nonce below, every dashboard page would have failed to
 * hydrate (React error #412) the moment this CSP reached production.
 *
 * THE FIX IS NEXT.JS'S OWN DOCUMENTED PATTERN: src/proxy.ts (this
 * project's middleware, renamed by Next 16's own convention) generates
 * one nonce per request and writes it onto BOTH the outgoing request
 * headers (so Next's renderer discovers it and stamps the same nonce on
 * every script IT generates) and the response headers (so the browser
 * enforces it). layout.tsx reads the identical nonce from headers() and
 * applies it to the one inline script this app writes itself,
 * INIT_SCRIPT — so that script is allowed by its nonce now, not by
 * 'unsafe-inline' and not by a hash.
 *
 * object-src 'none' and base-uri 'none' need no nonce: the app embeds no
 * <object>/<embed> and never changes <base>, so there is nothing for
 * either directive to break.
 */
export function buildCsp(nonce: string): string {
  return `frame-ancestors 'none'; script-src 'self' 'nonce-${nonce}'; object-src 'none'; base-uri 'none'`;
}
