// LOADING THE SAMPLE, SEEING IT, AND GETTING RID OF IT — the whole loop.
//
// V4.6 #6. Every other prodtest in this directory runs against a stand-in
// that answers every table with an empty list, which is all a dashboard
// shell needs to render. This one WRITES: it presses the button, so the
// server has to remember thirty-six rows across four tables and hand them
// back, or the test proves only that a button exists.
//
// So the stand-in below is a small in-memory PostgREST — insert, select
// with eq filters, delete, patch. Everything else answers empty exactly
// as before, which means an unhandled shape shows up as a failure rather
// than as a quietly wrong pass.
//
// Run: node scripts/tests/sample-data.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

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
  user_metadata: {},
  identities: [],
};

// --- a local stand-in for the Supabase project ------------------------
// GoTrue's /auth/v1/user plus PostgREST table reads. Every table answers
// with an empty result unless named, which is all the dashboard layout
// needs to render its shell.
const TABLE_ROWS = {
  user_credits: [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }],
  // WITHOUT THIS ROW /dashboard/overview REDIRECTS TO /onboarding, and a
  // census run against it measures the onboarding page while printing the
  // word "Home". The first run of this file did exactly that and reported
  // one accent surface on a page it never opened. Asserting
  // location.pathname after the goto is what caught it, and section 1
  // keeps asserting it.
  user_onboarding: [{ user_id: USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null }],
};

const supaHits = [];

// AN IN-MEMORY POSTGREST, because this test writes.
//
// The stand-in every other prodtest uses answers every table with an
// empty list, which is all the dashboard shell needs to render. This one
// has to survive a round trip: POST /api/sample-data inserts thirty-six
// rows across four tables and then the page has to READ them back, so a
// server that forgets everything proves nothing about the loop.
//
// Deliberately a small subset of PostgREST — insert, select with eq
// filters, delete with eq filters, and the `vnd.pgrst.object` single-row
// accept header. Enough for the paths under test; anything else answers
// empty exactly as before, so an unhandled shape shows up as a test
// failure rather than as a silently wrong pass.
const store = new Map([
  ["user_credits", [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }]],
  ["user_onboarding", [{ user_id: USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null }]],
]);
const rowsOf = (table) => {
  if (!store.has(table)) store.set(table, []);
  return store.get(table);
};
// `?user_id=eq.<uuid>&source=eq.sample` -> [["user_id","<uuid>"], ...]
function eqFilters(url) {
  const out = [];
  for (const [k, v] of url.searchParams) {
    if (k === "select" || k === "order" || k === "limit" || k === "offset") continue;
    if (typeof v === "string" && v.startsWith("eq.")) out.push([k, v.slice(3)]);
  }
  return out;
}
const matches = (row, filters) => filters.every(([k, v]) => String(row[k]) === v);

const supa = http.createServer((req, res) => {
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
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const filters = eqFilters(url);

      if (req.method === "POST") {
        let incoming = [];
        try {
          incoming = JSON.parse(body || "[]");
        } catch {
          return json(400, { message: "bad json" });
        }
        if (!Array.isArray(incoming)) incoming = [incoming];
        const stamped = incoming.map((r, i) => ({
          id: r.id ?? `${table}-${rowsOf(table).length + i}-${Math.random().toString(36).slice(2, 10)}`,
          created_at: r.created_at ?? new Date().toISOString(),
          ...r,
        }));
        rowsOf(table).push(...stamped);
        res.writeHead(201, { "Content-Type": "application/json", "Content-Range": `*/${stamped.length}` });
        return res.end(JSON.stringify(single ? stamped[0] : stamped));
      }

      if (req.method === "DELETE") {
        const before = rowsOf(table).length;
        store.set(table, rowsOf(table).filter((r) => !matches(r, filters)));
        const removed = before - rowsOf(table).length;
        res.writeHead(200, { "Content-Type": "application/json", "Content-Range": `*/${removed}` });
        return res.end("[]");
      }

      if (req.method === "PATCH") {
        let patch = {};
        try {
          patch = JSON.parse(body || "{}");
        } catch {
          patch = {};
        }
        for (const r of rowsOf(table)) if (matches(r, filters)) Object.assign(r, patch);
        return json(200, []);
      }

      const found = rowsOf(table).filter((r) => matches(r, filters));
      if (single) return found[0] ? json(200, found[0]) : json(406, { message: "no rows" });
      res.writeHead(200, { "Content-Type": "application/json", "Content-Range": `*/${found.length}` });
      return res.end(JSON.stringify(found));
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

// A real `next build`, into its own output directory.
//
// This has to build rather than reuse the existing .next, because Next
// INLINES every NEXT_PUBLIC_* value into the server and middleware
// bundles at build time — they are not read when the server starts. A
// build made against .env.local would send middleware's getUser() to the
// real Supabase project no matter what is set here, which is exactly why
// the first run of this test redirected to /login without the stand-in
// server ever being contacted.
// Values already present in process.env win over .env.local (@next/env
// never overrides an inherited variable), so the stand-in URL and keys
// above are what get inlined.
console.log("running `next build` (production build, not a dev server) ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
const buildCode = await new Promise((r) => build.on("close", r));
if (buildCode !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  supa.close();
  process.exit(1);
}
console.log("build ok — starting `next start`");

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
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

const up = await waitForServer();
if (!up || /EADDRINUSE|Failed to start server/.test(serverLog)) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT} (next start, NODE_ENV=production)`);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addCookies([
  { ...AUTH_COOKIE, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
]);
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));






// --- the loop ---------------------------------------------------------
await page.setViewportSize({ width: 1440, height: 1000 });

async function goHome() {
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/overview`, { waitUntil: "networkidle" });
  const accept = await page.$("button:has-text('Accept')");
  if (accept) {
    await accept.click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200);
}

const state = () =>
  page.evaluate(() => ({
    url: location.pathname,
    hasLoadButton: Boolean(
      [...document.querySelectorAll("button")].find((b) => /sample data/i.test(b.textContent || ""))
    ),
    hasBanner: Boolean(
      [...document.querySelectorAll("[role='status']")].find((n) => /Sample data/i.test(n.textContent || ""))
    ),
    hasClearButton: Boolean(
      [...document.querySelectorAll("button")].find((b) => /Remove the sample/i.test(b.textContent || ""))
    ),
    bodyText: (document.querySelector("main")?.textContent ?? "").replace(/\s+/g, " "),
    scoreLabel: document.querySelector('svg[aria-label*="/ 100"]')?.getAttribute("aria-label") ?? null,
  }));

console.log("\n== 1. an empty account is offered the sample ==");
await goHome();
let s = await state();
checkTrue(`landed on the dashboard (${s.url})`, s.url === "/dashboard/overview", s.url);
checkTrue("the load button is offered", s.hasLoadButton);
checkTrue("no banner yet", !s.hasBanner);
checkTrue("and no score yet", s.scoreLabel === null, String(s.scoreLabel));

console.log("\n== 2. pressing it loads the sample ==");
const loadRes = await page.evaluate(async () => {
  const r = await fetch("/api/sample-data", { method: "POST" });
  return { status: r.status, body: await r.json() };
});
console.log(`        POST /api/sample-data -> ${loadRes.status} ${JSON.stringify(loadRes.body)}`);
checkTrue(`the load succeeded (HTTP ${loadRes.status})`, loadRes.status === 200, JSON.stringify(loadRes.body));
checkTrue(
  `all ${loadRes.body.expected} rows were written (${loadRes.body.inserted})`,
  loadRes.body.inserted === loadRes.body.expected,
  `${loadRes.body.inserted} of ${loadRes.body.expected} — a partial sample is worse than none`
);

console.log("\n== 3. a second press does not double it ==");
const again = await page.evaluate(async () => {
  const r = await fetch("/api/sample-data", { method: "POST" });
  return { status: r.status, body: await r.json() };
});
checkTrue(`the second load is refused (HTTP ${again.status})`, again.status === 409, JSON.stringify(again.body));

console.log("\n== 4. the marker appears, and so does the way out ==");
await goHome();
s = await state();
checkTrue("the banner is up", s.hasBanner, s.bodyText.slice(0, 120));
checkTrue("with the remove button on it", s.hasClearButton);
checkTrue("and the load button is gone", !s.hasLoadButton);
// AND IT IS ON EVERY PAGE, not just the one that loaded it.
for (const url of ["/dashboard/records", "/dashboard/timeline"]) {
  await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const elsewhere = await state();
  checkTrue(`${url}: the banner is there too`, elsewhere.hasBanner);
}

console.log("\n== 5. the account now has something to say ==");
await goHome();
s = await state();
// THE SCORE IS BACK, because there are more than five entries now — the
// other half of V4.6 #5's rule, exercised from the other side.
checkTrue(`the score returns with real data (${s.scoreLabel})`, s.scoreLabel !== null, "still withheld with 36 entries");
checkTrue(
  "and a real customer's name is on the page",
  /Νεφέλη|Παπαδόπουλος|Ελαιώνες|Δρόσος/.test(s.bodyText),
  s.bodyText.slice(0, 200)
);

console.log("\n== 6. removing it leaves nothing behind ==");
const clearRes = await page.evaluate(async () => {
  const r = await fetch("/api/sample-data", { method: "DELETE" });
  return { status: r.status, body: await r.json() };
});
console.log(`        DELETE /api/sample-data -> ${clearRes.status} ${JSON.stringify(clearRes.body)}`);
checkTrue(`the clear succeeded (HTTP ${clearRes.status})`, clearRes.status === 200);
checkTrue(
  `all ${loadRes.body.inserted} rows were removed (${clearRes.body.deleted})`,
  clearRes.body.deleted === loadRes.body.inserted,
  `${clearRes.body.deleted} of ${loadRes.body.inserted} — rows left behind carry import_id = NULL and become indistinguishable from the user's own`
);
await goHome();
s = await state();
checkTrue("the banner is gone", !s.hasBanner);
checkTrue("the load button is offered again", s.hasLoadButton);
checkTrue("and the score is withheld again", s.scoreLabel === null, String(s.scoreLabel));
// THE ACCOUNT IS BACK WHERE IT STARTED. Not "mostly": a customer name
// still on the page after a clear is a row that survived.
checkTrue(
  "no sample name survives anywhere on the page",
  !/Νεφέλη|Παπαδόπουλος|Ελαιώνες|Δρόσος/.test(s.bodyText),
  s.bodyText.slice(0, 200)
);

await browser.close();
cleanup();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
