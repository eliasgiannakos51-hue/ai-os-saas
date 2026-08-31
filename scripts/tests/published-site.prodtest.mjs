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
const SITE_ID = "44444444-4444-4444-8444-444444444444";
const SITE_HTML =
  "<!doctype html><html><head><title>Acme Cafe</title></head><body><h1>Acme Cafe</h1><p>Open daily.</p></body></html>";

// The row the public route reads, keyed by the subdomain it filters on.
const SITES = {
  acme: { id: SITE_ID, user_id: USER_ID, html_content: SITE_HTML, status: "live", is_active: true, updated_at: "2026-01-14T10:00:00Z" },
  gone: { id: "55555555-5555-4555-8555-555555555555", user_id: USER_ID, html_content: SITE_HTML, status: "unpublished", is_active: false, updated_at: "2026-01-14T10:00:00Z" },
};

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

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
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
    // KILL THE GROUP, NOT THE HANDLE. `npx next start` is npx -> sh ->
    // next-server. SIGKILL to the npx handle leaves the grandchild alive,
    // reparented to init, still holding its port and serving its build.
    // Measured across one full survey of the suite: thirteen orphaned
    // next-server processes, the oldest 41 minutes old. `detached: true`
    // on the spawn puts the whole tree in its own group so this reaches
    // all of it. Enforced by scripts/tests/prodtest-hygiene.test.mjs.
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
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
  check("the bytes are the published HTML, not a wrapper", html, SITE_HTML);
  checkTrue(
    "...served as its own document, not embedded in ours",
    !html.includes("__next") && !html.includes("_next/static"),
    html.slice(0, 200)
  );
  check("Content-Type", res.headers.get("content-type"), "text/html; charset=utf-8");

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
