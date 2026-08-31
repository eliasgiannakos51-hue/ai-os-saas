// Every route, in a production build: does it load, is it clean, does it
// fit on a phone?
//
// The three failures this catches are the ones that reach a user before
// anyone notices. A 500 on a route nobody clicks in review. An
// unresolved i18n key rendering its own dotted path as body text. A page
// that scrolls sideways at 375px, which on a phone makes the layout feel
// broken even when every element is present.
//
// Deliberately NOT in the build gate. `next build` runs test:unit, and a
// suite that needs a port, a browser and a writable node_modules is not a
// gate — it is a coin flip. That mistake already cost one Vercel deploy.
// This lives in `npm run test:prod` and runs after a build, not inside
// one; billing-coverage.test.mjs asserts no *.test.mjs can bind a port.
//
// Run: node scripts/tests/routes-smoke.prodtest.mjs
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

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  // Free by default, because most of this file checks what a brand-new
  // account sees. Section 4 raises it: Deep Research is Starter-and-above,
  // so on a free account that page renders an upgrade wall and "the
  // examples are missing" would be a true statement about the wrong
  // screen. Asserting a feature is discoverable requires an account that
  // can reach the feature.
  user_metadata: {},
  identities: [],
};

/** Swapped in for the sections that need a paying account. */
function setPlan(tier) {
  USER.user_metadata = tier ? { subscription_tier: tier } : {};
}

// --- a local stand-in for the Supabase project ------------------------
// GoTrue's /auth/v1/user plus PostgREST table reads. Every table answers
// with an empty result unless named, which is all the dashboard layout
// needs to render its shell.
const TABLE_ROWS = {
  user_credits: [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }],
};

const supaHits = [];
const supa = http.createServer((req, res) => {
  // CORS — the same headers scripts/lib/prod-harness.mjs sends, and for
  // the same reason it wrote down after losing hours to it.
  //
  // This file has its OWN stand-in Supabase; it predates the shared
  // harness and never got the lesson the shared one learned. The page and
  // this server are on different ports, so any BROWSER-side Supabase call
  // is cross-origin. /dashboard/settings and /dashboard/team read
  // notification_settings and notification_preferences from the browser,
  // Chromium blocked the preflight, and this file reported two console
  // errors on two pages that were behaving perfectly — every run, for as
  // long as nobody ran it. Real Supabase sends these headers; a stand-in
  // that does not is not standing in for it.
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, prefer, accept-profile, content-profile, range"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "content-range, x-supabase-api-version");
  res.setHeader("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    supaHits.push(`${req.method} ${req.url}`);
    const url = new URL(req.url, "http://x");
    const json = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/auth/v1/user") return json(200, USER);
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: USER, session: null });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows = TABLE_ROWS[table] ?? [];
      // COUNTS COME BACK IN A HEADER, not in the body — and a stand-in
      // that skips it does not merely answer less, it answers WRONG.
      // supabase-js reports `count: null` when Content-Range is absent,
      // and dashboard/mission/page.tsx reads exactly that as a degraded
      // session: it then renders "please reload" instead of the mission
      // list, so an assertion about anything on that page was being made
      // against an error screen. The page was right; the fake was not.
      if ((req.headers.prefer ?? "").includes("count=")) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : `*/0`,
        });
        return res.end(JSON.stringify(req.method === "HEAD" ? null : rows));
      }
      // PostgREST returns a bare object (not an array) for .single()
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows);
    }
    json(200, {});
  });
});
// A FIXED port, because NEXT_PUBLIC_* values are inlined into the server
// and middleware bundles by `next build` — they are not read at start
// time. The build below has to bake in the same URL this server listens
// on, which is also why this file builds rather than reusing an existing
// .next: a build made against the real project would send middleware's
// getUser() to the real Supabase.
const SUPA_PORT = 54329;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
const SUPA_URL = `http://127.0.0.1:${SUPA_PORT}`;

// A session cookie in the exact shape @supabase/ssr writes and reads.
// supabase-js derives the cookie name from the URL's first hostname
// label (`sb-${hostname.split(".")[0]}-auth-token`), so for 127.0.0.1
// that is literally "127".
const PROJECT_REF = "127";
// Well-formed JWTs. supabase-js parses the access token locally to read
// its expiry before it will call the server with it, so an opaque string
// makes it drop the session and report "not logged in" without any
// network call at all. The signature is never checked here — getUser()
// always verifies against the auth server, which is the stand-in above.
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) =>
  `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 });
const session = {
  access_token: jwt({
    sub: USER.id,
    aud: "authenticated",
    role: "authenticated",
    email: USER.email,
    iat: nowSec,
    exp: nowSec + 3600,
  }),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec + 3600,
  refresh_token: "test-refresh-token",
  user: USER,
};
const AUTH_COOKIE = {
  name: `sb-${PROJECT_REF}-auth-token`,
  value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
};

// --- the production server --------------------------------------------
// Claim a free port by binding one and releasing it, rather than
// hardcoding: a leftover `next start` from an earlier run silently holds
// the port and serves its OWN, older build, which looks exactly like the
// app being broken.
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


// ── DEV SERVER, not a production build ────────────────────────────────
// A minified React error number is a dead end. `next dev` gives the full
// message AND the component stack, which is the only thing that names the
// component whose hook count changed.
// MODE=production builds and serves the way the error was actually seen.
//
// Dev did not reproduce it: 22 fresh loads, 32 client-side navigations and
// 87 route loads replaying routes-smoke's exact sequence, all clean. That
// is a real result, not a failed attempt — it says the fault is specific
// to the PRODUCTION build, which is where React's minified dispatcher and
// the vendor chunk the original stack pointed into actually live.
const MODE = process.env.MODE ?? "development";
let server;
if (MODE === "production") {
  env.NODE_ENV = "production";
  console.log("running `next build` ...");
  const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let buildLog = "";
  build.stdout.on("data", (d) => (buildLog += d));
  build.stderr.on("data", (d) => (buildLog += d));
  if ((await new Promise((r) => build.on("close", r))) !== 0) {
    console.log("build failed\n" + buildLog.slice(-2000));
    supa.close();
    process.exit(1);
  }
  console.log("build ok — starting `next start`");
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
} else {
  env.NODE_ENV = "development";
  console.log("starting `next dev` ...");
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
}
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitForServer() {
  for (let i = 0; i < 180; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/login`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
if (!(await waitForServer())) {
  console.log("dev server never came up:\n" + serverLog.slice(-2000));
  server.kill("SIGKILL"); supa.close(); process.exit(1);
}
console.log("dev server up");

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);

const RUNS = Number(process.env.RUNS ?? 3);
const allErrors = [];

// THE SEQUENCE THAT SAW IT, replayed.
//
// The error was observed by routes-smoke.prodtest.mjs, which visits every
// dashboard route in ONE browser context, in order, each at four
// viewport widths. Neither a fresh load of /dashboard/overview (22 tried)
// nor a client-side bounce between three routes (32 tried) reproduced it.
// What is different about that run is the sequence: thirty-one routes
// through one context, with a resize between each. So that is what this
// replays.
const SEQUENCE = [
  "/dashboard", "/dashboard/overview", "/dashboard/chat", "/dashboard/create",
  "/dashboard/website-builder", "/dashboard/mission", "/dashboard/documents",
  "/dashboard/favorites", "/dashboard/timeline", "/dashboard/memory",
  "/dashboard/marketplace", "/dashboard/settings", "/dashboard/team",
  "/dashboard/affiliate", "/dashboard/reflection", "/dashboard/agents",
  "/dashboard/published", "/dashboard/integrations", "/dashboard/files",
  "/dashboard/deep-research", "/dashboard/apps", "/dashboard/images",
  "/dashboard/videos", "/dashboard/coding", "/dashboard/campaigns",
  "/dashboard/data-analysis", "/dashboard/presentations", "/dashboard/websites",
  "/dashboard/overview",
];
const WIDTHS = [[375, 800], [768, 1024], [1024, 800], [1280, 900]];

for (let pass = 0; pass < RUNS; pass++) {
  const page = await ctx.newPage();
  // WHICH ROUTE. Without this the report says "6 reproduced" and not
  // where, and six identical minified stacks are indistinguishable — I
  // read one run's six as "deterministic on /dashboard/favorites" when
  // three runs of the same harness gave 6, then 1, then 4. A count with
  // no attribution cannot support a claim about a cause.
  let visiting = "(before the first route)";
  page.on("console", (m) => { if (m.type() === "error") allErrors.push(`[pass ${pass + 1} · ${visiting}] ${m.text()}`); });
  page.on("pageerror", (e) => allErrors.push(`[pass ${pass + 1} · ${visiting}] PAGEERROR ${e.message}\n${e.stack ?? ""}`));
  for (const route of SEQUENCE) {
    visiting = route;
    try {
      await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      for (const [w, h] of WIDTHS) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(300);
    } catch { /* a route that will not load is not what this is looking for */ }
  }
  console.log(`pass ${pass + 1}: ${SEQUENCE.length} routes x ${WIDTHS.length} widths — ${allErrors.length} error(s) so far`);
  await page.close();
}

// THE FILTER, narrowed. The first version matched "Hook" anywhere and
// counted a Next.js RSC prefetch failure as a hook error — a false
// positive in the instrument, in a run whose dev server I had already
// killed. Both fixed: this names the React error explicitly.
const HOOK = /Rendered more hooks|Rendered fewer hooks|order of Hooks|Minified React error #(3(0[0-9]|1[0-9]))|Invalid hook call/;
const found = allErrors.filter((e) => HOOK.test(e));

console.log(`\n${allErrors.length} console error(s) in total across ${RUNS} pass(es)`);
const noise = /ERR_CONNECTION_REFUSED|webpack-hmr|Failed to fetch RSC payload|Download the React DevTools/;
const real = allErrors.filter((e) => !noise.test(e));
console.log(`${real.length} after removing dev-server noise`);
for (const e of [...new Set(real)].slice(0, 12)) console.log("\n" + e.slice(0, 1200));

console.log("\n════════ HOOK-ORDER ERRORS ════════");
console.log(found.length === 0 ? `none in ${RUNS * SEQUENCE.length} route loads` : `${found.length} reproduced`);
// COUNTED PER ROUTE, because that is the question. An intermittent fault
// spread over twenty-nine routes and one concentrated on a single route
// are different bugs, and the totals are identical.
if (found.length > 0) {
  const byRoute = new Map();
  for (const f of found) {
    const route = f.match(/^\[pass \d+ · ([^\]]+)\]/)?.[1] ?? "(unattributed)";
    byRoute.set(route, (byRoute.get(route) ?? 0) + 1);
  }
  console.log(`  across ${byRoute.size} route(s) of ${SEQUENCE.length}, ${RUNS} passes:`);
  for (const [route, n] of [...byRoute].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}x  ${route}`);
  }
}
for (const f of [...new Set(found)]) console.log("\n" + f.slice(0, 4000));

await browser.close();
server.kill("SIGKILL");
supa.close();
process.exit(0);
