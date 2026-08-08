/* Ionexa service worker — offline shell + Web Push.
 *
 * Two jobs, deliberately kept apart:
 *
 * 1. OFFLINE SHELL. Navigations are network-first with a cache fallback,
 *    so a user who loses signal sees the last page they visited (or the
 *    offline page) instead of the browser's dinosaur. It is network-FIRST
 *    rather than cache-first because this app's pages are personalised
 *    and server-rendered: serving a stale dashboard to someone who is
 *    online would be worse than a slightly slower load. Static assets are
 *    the opposite — immutable and hashed — so they are cache-first.
 *
 *    API responses are NEVER cached. A cached /api/credits/balance would
 *    show a stale credit count as if it were live, and a cached POST is
 *    meaningless. Only GET navigations and static assets are stored.
 *
 * 2. PUSH. Renders notifications and focuses (or opens) the right page
 *    when one is clicked.
 */

const VERSION = "ionexa-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";

// The minimum needed to render something coherent with no network.
const SHELL_ASSETS = [OFFLINE_URL, "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll rejects the whole install if ANY asset 404s, which would
      // leave the app with no service worker at all. Each is added
      // independently so one missing file cannot do that.
      await Promise.all(
        SHELL_ASSETS.map((url) => cache.add(url).catch(() => undefined))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions — otherwise a deploy leaves the
      // previous build's HTML in a cache nothing ever evicts.
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    /\.(css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Same-origin only. A cross-origin request (Supabase, Stripe, an image
  // CDN) is left entirely alone.
  if (url.origin !== self.location.origin) return;
  // Never cache API responses or auth callbacks — see the file comment.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          }
          return response;
        } catch {
          // Offline: the same page if we have it, else the last-resort
          // offline shell.
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })()
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Ionexa", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Ionexa";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: payload.tag || "ionexa",
      data: { url: payload.url || "/dashboard/overview" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard/overview";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Focus an existing tab rather than opening a second copy of the app.
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              // Cross-origin or disallowed navigation — focusing is enough.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
