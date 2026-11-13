// A WRITE TO THE API FROM ANOTHER SITE IS REFUSED (2026-11-05 review, A5).
//
// What must hold:
//   1. the verdict (lib/security/cross-site.ts) refuses a browser's
//      cross-site write to /api/* — by Sec-Fetch-Site, and by an Origin
//      that is not the app's — and lets everything else through. Run, not read.
//   2. the exceptions are routes other sites reach ON PURPOSE, and the
//      property that makes that safe is checked on the route itself: none
//      of them reads a browser session. The population is every route in
//      src/app/api; an exception that matches no route is stale.
//   3. the middleware asks before the session lookup, on every /api path.
//   4. every route that takes a password or an emailed token takes JSON
//      only. The population is the tree: every route whose body carries
//      `password` or `token`.
//
// Run: node scripts/tests/cross-site-writes.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { AUTHENTICATES, CALLER_CLIENT } from "./lib/route-mechanisms.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (f) => strip(readFileSync(f, "utf8"));

const { crossSiteVerdict, CROSS_SITE_EXCEPTIONS, isCrossSiteException, requireJsonBody } = await loadTs("src/lib/security/cross-site.ts");

console.log("== 1. the verdict ==");
const APP = "https://app.test";
const own = [null, "app.test", "app.test", undefined];
const v = (method, pathname, secFetchSite, origin) => crossSiteVerdict({ method, pathname, secFetchSite, origin, ownHosts: own });
for (const [label, args, want] of [
  ["a cross-site POST to the API", ["POST", "/api/chat", "cross-site", "https://evil.example"], "refuse"],
  ["...even with no Origin", ["POST", "/api/auth/login", "cross-site", null], "refuse"],
  ["a POST whose Origin is another site, from a browser with no Sec-Fetch-Site", ["POST", "/api/auth/login", null, "https://evil.example"], "refuse"],
  ["a POST from an opaque origin", ["POST", "/api/signup", null, "null"], "refuse"],
  ["a POST from the same host on another port", ["POST", "/api/chat", null, "https://app.test:8443"], "refuse"],
  ["a POST from a sibling subdomain", ["POST", "/api/chat", "same-site", "https://www.app.test"], "refuse"],
  ["a PUT, a PATCH, a DELETE likewise", ["delete", "/api/files/1", "cross-site", null], "refuse"],
  ["the app's own POST", ["POST", "/api/chat", "same-origin", APP], "allow"],
  ["...also when a proxy ended TLS and the request reads as http", ["POST", "/api/chat", "same-origin", "http://app.test"], "allow"],
  ["an Origin that only contains the app's host", ["POST", "/api/chat", null, "https://app.test.evil.example"], "refuse"],
  ["a POST with neither header (a server)", ["POST", "/api/iowork/pair/token", null, null], "allow"],
  ["a cross-site GET (it changes nothing)", ["GET", "/api/health", "cross-site", "https://evil.example"], "allow"],
  ["a page, not the API", ["POST", "/share", "cross-site", "https://evil.example"], "allow"],
  ["Stripe's webhook", ["POST", "/api/webhooks/stripe", "cross-site", null], "allow"],
  ["a cron", ["POST", "/api/cron/agent-runs", null, "https://evil.example"], "allow"],
  ["a published site's form", ["POST", "/api/websites/abc/submit-form", "cross-site", "null"], "allow"],
  // Built from parts: no such route exists, and a whole literal here would
  // read to the self-claims scan as a claim that one does.
  ["...but not a path that only starts like it", ["POST", ["/api/websites/abc/submit-form", "extra"].join("/"), "cross-site", "null"], "refuse"],
  ["...nor a site route that is not the form", ["POST", "/api/websites/abc/publish", "cross-site", "null"], "refuse"],
]) {
  check(`${label}: ${want}`, v(...args) === want, `got ${v(...args)}`);
}
check(
  "the configured site URL counts as the app's own",
  crossSiteVerdict({ method: "POST", pathname: "/api/chat", secFetchSite: null, origin: "https://ionexa.example", ownHosts: ["internal:3000", "https://ionexa.example/"] }) === "allow"
);

console.log("\n== 2. the exceptions: reached from elsewhere, and reading no session ==");
const routes = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const f = `${dir}/${e}`;
    if (statSync(f).isDirectory()) walk(f);
    else if (e === "route.ts") routes.push(f);
  }
})("src/app/api");
check(`the API routes were read (${routes.length})`, routes.length >= 150);
// The URL a route file answers, with each [segment] filled in.
const urlOf = (f) => f.replace(/^src\/app/, "").replace(/\/route\.ts$/, "").replace(/\[[^\]]+\]/g, "x");
const excepted = routes.filter((f) => isCrossSiteException(urlOf(f)));
check(`the routes the exceptions cover were found (${excepted.length})`, excepted.length >= 3, excepted.join(", "));
for (const f of excepted) {
  const src = read(f);
  check(`${f} reads no browser session`, !AUTHENTICATES.test(src) && !CALLER_CLIENT.test(src));
}
for (const e of CROSS_SITE_EXCEPTIONS) {
  check(`the exception for ${e.route} still names a route it covers`, excepted.includes(e.route));
  check(`...and says why (${e.why.slice(0, 50)}…)`, e.why.length > 60);
}

console.log("\n== 3. the middleware asks first ==");
const mw = read("src/proxy.ts");
const at = mw.indexOf("crossSiteVerdict({");
check("the middleware asks the verdict", at > 0);
check(
  "...with both headers and the request's own host",
  /secFetchSite: request\.headers\.get\("sec-fetch-site"\),\s*origin: request\.headers\.get\("origin"\),\s*ownHosts: \[\s*request\.headers\.get\("x-forwarded-host"\),\s*request\.headers\.get\("host"\),/.test(mw)
);
check("...and refuses by code", /=== "refuse"\s*\)\s*\{\s*return NextResponse\.json\(\{ ok: false, code: "cross_site_refused" \}, \{ status: 403 \}\);/.test(mw));
check("...before the session lookup it would otherwise pay for", at > 0 && at < mw.indexOf("await supabase.auth.getUser()"));
const matcher = /matcher:\s*\[[\s\S]*?"(\/\(\(\?![^"]+)"/.exec(readFileSync("src/proxy.ts", "utf8"))?.[1] ?? "";
check("...and the middleware runs on /api", matcher.length > 0 && !/\bapi\b/.test(matcher), matcher);

console.log("\n== 4. a password or an emailed token arrives as JSON only ==");
const json = (type) => requireJsonBody(new Request("https://app.test/api/x", { method: "POST", headers: type ? { "content-type": type } : {} }));
check("application/json is accepted", json("application/json") === null);
check("...with a charset too", json("application/json; charset=utf-8") === null);
for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", null]) {
  check(`${type ?? "no content type"} is refused`, json(type) === "unsupported_media_type");
}
const credential = routes.filter((f) => /\bbody\??\.(password|token)\b/.test(read(f)));
check(`the routes that take a password or a token were found (${credential.length})`, credential.length >= 4, credential.join(", "));
for (const f of credential) {
  const src = read(f);
  const guard = src.indexOf("if (requireJsonBody(request))");
  check(`${f} refuses anything but JSON, before it reads the body`, guard > 0 && guard < src.indexOf("request.json()"));
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
