/*
 * THE SERVER'S CALLS TO GOOGLE AND TELEGRAM, ANSWERED ON THIS MACHINE.
 *
 * Preloaded into a prodtest's own production server and nothing else
 * (NODE_OPTIONS="--import <this file>", set by the test on the server it
 * spawns). The OAuth token exchange, the Calendar read and the Telegram
 * send are written against fixed https addresses in the product
 * (src/lib/integrations/oauth.ts, src/lib/integrations/read.ts,
 * src/lib/agents/deliver.ts) and none of them has a base URL to point
 * elsewhere, so the one place a test can stand in for them is the fetch
 * the server process calls.
 *
 * OUTBOUND_STUB is a JSON map of origin -> local address, e.g.
 *   {"https://oauth2.googleapis.com":"http://127.0.0.1:5000/oauth2"}
 * A request to a mapped origin goes to the local address with the same
 * path, query, method, headers and body; every other request is left
 * exactly as it was. Installed before Next.js patches fetch, so the
 * framework's own wrapper sits on top of this one as it would sit on the
 * real one.
 *
 * Used by: scripts/tests/connections-automations-edges.prodtest.mjs
 */
const map = (() => {
  try {
    return JSON.parse(process.env.OUTBOUND_STUB || "{}");
  } catch {
    return {};
  }
})();
const origins = Object.entries(map);

if (origins.length > 0 && typeof globalThis.fetch === "function") {
  const real = globalThis.fetch;
  globalThis.fetch = function stubbedFetch(input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    if (typeof url === "string") {
      for (const [origin, to] of origins) {
        if (url === origin || url.startsWith(`${origin}/`)) {
          const next = to + url.slice(origin.length);
          if (typeof input === "string" || input instanceof URL) return real(next, init);
          return real(new Request(next, input), init);
        }
      }
    }
    return real(input, init);
  };
}
