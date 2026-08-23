// A published site, actually served, in a production build.
//
// scripts/tests/publishing.test.mjs asserts the policy text exists in the
// source. That is not the same claim as "a browser receives it". This
// starts the real server and fetches the real public route, because the
// entire security model of this feature is a set of response headers, and
// a header that is written but not sent protects nobody.
//
// Run: node scripts/tests/published-site.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail !== undefined) console.log(`        ${detail}`);
}

const USER_ID = "00000000-0000-4000-8000-000000000001";
const STARTER_USER_ID = "00000000-0000-4000-8000-000000000002";
const SITE_ID = "44444444-4444-4444-8444-444444444444";
const SITE_HTML =
  "<!doctype html><html><head><title>Acme Cafe</title></head><body><h1>Acme Cafe</h1><p>Open daily.</p></body></html>";

const BADGE_MARKER = "data-ionexa-badge";
const DAY = 86_400_000;
const FUTURE = new Date(Date.now() + 10 * DAY).toISOString();
const PAST = new Date(Date.now() - 2 * DAY).toISOString();

// A stored document that ALREADY contains a badge — the state the whole
// feature forbids. Serving must strip it and re-decide from live state.
const POISONED_HTML = SITE_HTML.replace(
  "</body>",
  `<a ${BADGE_MARKER}="1" href="https://ionexa.ai" style="position:fixed">Made with Ionexa</a></body>`
);

// The row the public route reads, keyed by the subdomain it filters on.
const site = (over) => ({
  id: SITE_ID,
  user_id: USER_ID,
  html_content: SITE_HTML,
  status: "live",
  is_active: true,
  updated_at: "2026-01-14T10:00:00Z",
  badge_removal_paid_until: null,
  ...over,
});

const SITES = {
  // V4 #25 — the four badge states, each an independently addressable site.
  acme: site({}), // free owner, never bought -> badge
  paid: site({ id: "44444444-4444-4444-8444-44444444a001", badge_removal_paid_until: FUTURE }),
  lapsed: site({ id: "44444444-4444-4444-8444-44444444a002", badge_removal_paid_until: PAST }),
  included: site({ id: "44444444-4444-4444-8444-44444444a003", user_id: STARTER_USER_ID }),
  // Paid, but the stored bytes carry a badge from "an older snapshot".
  poisoned: site({
    id: "44444444-4444-4444-8444-44444444a004",
    html_content: POISONED_HTML,
    badge_removal_paid_until: FUTURE,
  }),
  gone: site({ id: "55555555-5555-4555-8555-555555555555", status: "unpublished", is_active: false }),
};

// user_credits.plan_tier is what the serve path reads to learn the owner's
// plan (see lib/publishing/badge-server.ts).
const PLAN_TIERS = { [USER_ID]: "free", [STARTER_USER_ID]: "starter" };

const rpcCalls = [];
const allHits = [];

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    allHits.push(`${req.method} ${url.pathname}`);
    const json = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/auth/v1/user") return json(401, { message: "no session" });
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: null, session: null });
    if (url.pathname === "/rest/v1/rpc/record_site_view") {
      rpcCalls.push(body);
      return json(200, null);
    }
    if (url.pathname === "/rest/v1/user_credits") {
      const filter = url.searchParams.get("user_id") ?? "";
      const wanted = filter.startsWith("eq.") ? filter.slice(3) : "";
      const tier = PLAN_TIERS[wanted];
      const row = tier ? { plan_tier: tier } : null;
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return row ? json(200, row) : json(406, { message: "no rows" });
      return json(200, row ? [row] : []);
    }
    if (url.pathname === "/rest/v1/published_sites") {
      // PostgREST puts the filter in the query string: subdomain=eq.acme
      const filter = url.searchParams.get("subdomain") ?? "";
      const wanted = filter.startsWith("eq.") ? filter.slice(3) : "";
      const row = SITES[wanted];
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return row ? json(200, row) : json(406, { message: "no rows" });
      return json(200, row ? [row] : []);
    }
    if (url.pathname.startsWith("/rest/v1/")) return json(200, []);
    json(200, {});
  });
});

const SUPA_PORT = 54333;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
const SUPA_URL = `http://127.0.0.1:${SUPA_PORT}`;

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: "127", role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: "127", role: "service_role", iat: 1, exp: 2000000000 });

const PORT = await new Promise((resolve) => {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: SUPA_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
};

console.log("running `next build` ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
if ((await new Promise((r) => build.on("close", r))) !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  supa.close();
  process.exit(1);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/login`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
function cleanup() {
  try {
    server.kill("SIGKILL");
  } catch {
    /* already gone */
  }
  supa.close();
}

if (!(await waitForServer())) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT}`);

const base = `http://127.0.0.1:${PORT}`;

try {
  console.log("\n== a live site is served to an anonymous visitor ==");
  const res = await fetch(`${base}/s/acme`);
  check("200", res.status, 200);
  const html = await res.text();
  checkTrue(
    "the bytes are the published HTML, not a wrapper",
    html.includes("<h1>Acme Cafe</h1>") && html.includes("<p>Open daily.</p>"),
    html.slice(0, 300)
  );
  checkTrue(
    "...served as its own document, not embedded in ours",
    !html.includes("__next") && !html.includes("_next/static"),
    html.slice(0, 200)
  );
  check("Content-Type", res.headers.get("content-type"), "text/html; charset=utf-8");

  console.log("\n== V4 #25: the badge is decided at SERVE time, every request ==");
  // The full verification the requirement asks for, against the real
  // production server: free site with a badge -> paid -> badge gone ->
  // lapsed -> badge back. Four separate rows, one fetch each, real bytes.
  {
    check("free + never bought  -> badge IS on the page", html.includes(BADGE_MARKER), true);
    checkTrue("...and it says what it should", html.includes("Made with Ionexa"), html.slice(-300));
    check("...exactly once", html.split(BADGE_MARKER).length - 1, 1);
    checkTrue("...injected before </body>", /data-ionexa-badge[\s\S]*<\/body>/i.test(html), html.slice(-300));

    const paid = await (await fetch(`${base}/s/paid`)).text();
    check("free + inside a paid period -> badge GONE", paid.includes(BADGE_MARKER), false);
    check("...and the document is otherwise untouched", paid, SITE_HTML);

    const lapsed = await (await fetch(`${base}/s/lapsed`)).text();
    check("free + credits ran out (period lapsed) -> badge is BACK", lapsed.includes(BADGE_MARKER), true);

    const included = await (await fetch(`${base}/s/included`)).text();
    check("starter (included in plan) -> no badge, nothing bought", included.includes(BADGE_MARKER), false);

    // The anti-snapshot proof. The row is PAID and the STORED html already
    // contains a badge; if the stored bytes could decide this, the paying
    // customer would keep seeing a badge forever.
    const poisoned = await (await fetch(`${base}/s/poisoned`)).text();
    check("a paid site whose STORED html carries a badge is served WITHOUT one", poisoned.includes(BADGE_MARKER), false);
    check("...restored to the clean document", poisoned, SITE_HTML);

    // Same URL twice: the badge must not accumulate.
    const again = await (await fetch(`${base}/s/acme`)).text();
    check("a second request still produces exactly one badge", again.split(BADGE_MARKER).length - 1, 1);
  }

  console.log("\n== the headers a browser actually receives ==");
  const csp = res.headers.get("content-security-policy") ?? "";
  checkTrue(`a CSP is sent (${csp.slice(0, 60)}...)`, csp.length > 0);
  for (const directive of [
    "default-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ]) {
    checkTrue(`CSP contains: ${directive}`, csp.includes(directive), csp);
  }
  checkTrue("script-src allows no external host", !/script-src[^;]*https:/.test(csp), csp);
  check("X-Frame-Options", res.headers.get("x-frame-options"), "DENY");
  check("X-Content-Type-Options", res.headers.get("x-content-type-options"), "nosniff");
  checkTrue("Referrer-Policy is set", Boolean(res.headers.get("referrer-policy")));
  checkTrue("Permissions-Policy is set", Boolean(res.headers.get("permissions-policy")));
  checkTrue("it is cacheable but revalidated", /s-maxage/.test(res.headers.get("cache-control") ?? ""));
  checkTrue("it is indexable", /index/.test(res.headers.get("x-robots-tag") ?? ""));
  // No session, no cookie, in either direction.
  check("no cookie is set on a public page view", res.headers.get("set-cookie"), null);

  console.log("\n== the view was counted, atomically ==");
  await new Promise((r) => setTimeout(r, 300));
  checkTrue(`record_site_view was called (${rpcCalls.length}x)`, rpcCalls.length >= 1, `hits: ${allHits.join(" | ")}`);
  checkTrue("...with the site and its owner", (rpcCalls[0] ?? "").includes(SITE_ID));

  console.log("\n== what must NOT be served ==");
  for (const [path, why] of [
    ["/s/gone", "an unpublished site"],
    ["/s/never-existed", "an address nobody has"],
    ["/s/ab", "an address too short to be valid"],
    ["/s/ADMIN", "a reserved name"],
    ["/s/www", "a reserved name"],
    ["/s/-bad", "a malformed address"],
  ]) {
    const r = await fetch(`${base}${path}`);
    check(`${path} (${why}) -> 404`, r.status, 404);
    const body = await r.text();
    checkTrue(`${path}: does not leak the real HTML`, !body.includes("Acme Cafe"));
    checkTrue(
      `${path}: does not say whether the address ever existed`,
      !/unpublish|withdrawn|removed/i.test(body)
    );
    checkTrue(`${path}: is not indexed`, /noindex/.test(r.headers.get("x-robots-tag") ?? ""));
  }

  console.log("\n== the publish API refuses an unauthenticated caller ==");
  for (const [method, path] of [
    ["POST", `/api/websites/${SITE_ID}/publish`],
    ["GET", `/api/websites/${SITE_ID}/publish`],
    ["DELETE", `/api/websites/${SITE_ID}/publish`],
    ["POST", `/api/published/${SITE_ID}/rollback`],
  ]) {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" || method === "DELETE" ? undefined : "{}",
    });
    check(`${method} ${path}`, r.status, 401);
  }

  console.log("\n== the auth middleware does not run on public traffic ==");
  // The stand-in answers /auth/v1/user with 401 for every call. If the
  // middleware ran on /s/, the page would still render (it is not a
  // dashboard route) — so the assertion that matters is that a public
  // page view is served correctly with NO session anywhere in the
  // picture, which the 200 + exact-bytes checks above already prove.
  // What is asserted here is the cheaper property: the route works with
  // an auth server that refuses everything.
  const second = await fetch(`${base}/s/acme`);
  check("a second view still serves 200 with no session", second.status, 200);
} catch (err) {
  fail++;
  console.log(`  FAIL  unhandled: ${err.message}\n${err.stack ?? ""}`);
} finally {
  cleanup();
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
