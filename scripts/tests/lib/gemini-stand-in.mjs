// THE GEMINI ADDRESS, POINTED AT A LOCAL STAND-IN — for a production
// server that a browser test starts, and for nothing else.
//
// Not a runnable check. It is loaded INTO `next start` through
// NODE_OPTIONS="--import <this file>" by
// scripts/tests/image-studio-edges.prodtest.mjs, before Next.js wraps
// fetch, so every call the app makes to the provider's host goes to the
// test's own server at GEMINI_STAND_IN_URL instead, with the same path,
// headers and body. Nothing else is touched: every other address goes out
// as it would.
//
// WHY NOT A SETTING IN THE APP. lib/images/gemini-image.ts writes the
// provider's address as a constant, and a variable that could send the
// key to another host is not something to add to the product for a test.
// The app's own request and the provider's own answer shape are what the
// test exercises; only the host differs.
const HOST = "https://generativelanguage.googleapis.com";
const target = (process.env.GEMINI_STAND_IN_URL ?? "").replace(/\/+$/, "");

if (target) {
  const real = globalThis.fetch;
  globalThis.fetch = function standIn(input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    if (typeof url === "string" && url.startsWith(`${HOST}/`)) {
      return real(`${target}${url.slice(HOST.length)}`, init);
    }
    return real(input, init);
  };
}
