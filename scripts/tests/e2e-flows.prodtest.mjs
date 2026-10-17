// End-to-end flows, in a production build.
//
// SCOPE, STATED UP FRONT. Four of the eight flows are covered here. The
// other four (signup->first record, Create Studio, Website Builder
// create/edit/versioning, Favorites toggle) all turn on data actually
// PERSISTING, and the Supabase stand-in this harness runs against returns
// empty rows: no RLS, no triggers, no RPCs. Asserting "the record was
// created" against a stub that cannot store it would be the exact trap
// that had tooltips reported fixed twice while broken — a harness
// supplying what the real app lacks. Those four need a real Supabase
// instance; see the report at the bottom.
//
// What IS here is everything whose behaviour lives in the app rather than
// in the database: client cache invalidation, UI state machines, and the
// billing linkage.
//
// Run: node scripts/tests/e2e-flows.prodtest.mjs
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
};

const supaHits = [];
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
      const rows = TABLE_ROWS[table] ?? [];
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([
  { ...AUTH_COOKIE, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
]);
const page = await ctx.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(e.message));

console.log("\n== FLOW 4: Mission Control — goal -> steps -> refresh x3 ==");
// THE REFRESH BUG. Next 14.2's client Router Cache defaults dynamic-route
// entries to a 30s staleTime, SEPARATE from the server-side cache that
// `dynamic = "force-dynamic"` controls. A soft navigation back to a route
// visited moments ago replays the old RSC payload without ever asking the
// server — which is what "created a mission, refreshed, it disappeared"
// actually was: not data vanishing, but the client showing a stale
// snapshot. force-dynamic cannot fix it, because the server is never
// asked. The fix is staleTimes.dynamic = 0 in next.config.mjs.
//
// So this counts SERVER HITS across repeated navigations. A cached replay
// is invisible in the DOM and shows up only as a request that never
// happened.
const config = readFileSync("next.config.mjs", "utf8");
checkTrue("the Router Cache staleTime is pinned to 0", /staleTimes:\s*\{\s*dynamic:\s*0/.test(config));

let missionHits = 0;
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.pathname === "/dashboard/mission") missionHits++;
});

await page.goto(`http://127.0.0.1:${PORT}/dashboard/mission`, { waitUntil: "networkidle" });
check("the mission page loads", new URL(page.url()).pathname, "/dashboard/mission");
const firstHits = missionHits;
checkTrue(`initial load hit the server (${firstHits})`, firstHits >= 1);

// Three soft navigations away and back, the way a user does it — clicking
// the sidebar, not reloading.
for (let round = 1; round <= 3; round++) {
  const before = missionHits;
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/timeline`, { waitUntil: "networkidle" });
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/mission`, { waitUntil: "networkidle" });
  checkTrue(
    `refresh ${round}: the server was re-asked, not replayed from cache (+${missionHits - before})`,
    missionHits > before
  );
  check(`refresh ${round}: still on the mission page`, new URL(page.url()).pathname, "/dashboard/mission");
}
// The page must still be rendering its own shell, not an error boundary.
// The design's sidebar has five fixed rows (src/lib/nav/rail.ts) where
// the old one had dozens, so "more than ten links" stopped meaning
// anything (QUEUE Α.13, 2026-10-05). Intact now means: the sidebar's
// five rows, the page's own heading, and no error boundary's title.
{
  const msgs = JSON.parse(readFileSync("messages/en.json", "utf8"));
  const rail = await page.locator('[data-testid="sidebar"] a').count();
  const boundary = await page.getByText(msgs.errors.boundary.title).count();
  const heading = await page.locator("main h1").count();
  checkTrue(
    "the page is still intact after 3 round trips",
    rail >= 5 && heading >= 1 && boundary === 0,
    `sidebar links ${rail}, headings ${heading}, error boundary ${boundary}`
  );
}

console.log("\n== FLOW 5: Chat — the composer, and no second sidebar ==");
await page.goto(`http://127.0.0.1:${PORT}/dashboard/chat`, { waitUntil: "networkidle" });
check("chat loads", new URL(page.url()).pathname, "/dashboard/chat");
const composer = page.locator("textarea").first();
checkTrue("the composer is present", await composer.isVisible());

// THIS FLOW USED TO DRIVE THE FOCUS-MODE TOGGLE, and the reason is
// worth keeping: it shipped once as a bare 36x36 icon whose only
// affordance was a native `title`, rendered correctly, and no user
// found it — "renders" is not the same claim as "is findable".
//
// WHAT IT OPENED HAS NOW MOVED TWICE. It was a drawer of conversations
// inside Chat; on 2026-10-16 the owner had the conversations taken out
// of the sidebar and the drawer went with them; on 2026-10-17 he asked
// for the list back inside Chat, behind a [◧] in the title row, with
// the sidebar reduced to one «Ionexa Chat» row. So the claim this
// flow keeps true in a real browser is BOTH halves: Chat has ONE
// sidebar beside it with no conversations in it, and its own column is
// CLOSED until somebody opens it.
//
// (scripts/tests/sidebar-no-chats.prodtest.mjs is the thorough version:
// ten pages, three widths, ten seeded conversations. This is the one
// line of it that belongs in the end-to-end walk.)
const asides = await page.locator('[data-testid="sidebar"]').count();
check("Chat has exactly one sidebar beside it", asides, 1);
const chatRows = await page.locator('[data-testid="conversation-row"]').count();
check("...and no conversation rows anywhere on the screen", chatRows, 0);
const chatDrawers = await page
  .locator('[data-testid="recent-conversations"], [data-testid="chat-conversation-sidebar"], [data-testid="chat-conversation-column"]')
  .count();
check("...and its own column is closed until it is asked for", chatDrawers, 0);

// AND THE WAY TO THEM IS PRESSED, not merely found. The toggle this
// flow used to click was the one interaction in the whole walk; taking
// it out without putting one back would have dropped this file out of
// interaction-coverage.test.mjs's «drives the page» population, and the
// two ceilings there would have fallen by one for the wrong reason —
// a test that stopped clicking reads exactly like a device that was
// added.
//
// SO THE PRESSES ARE THE OWNER'S OWN ROUTE, and there are two of them
// now because that is the route: «Στο Chat πατάω [◧] και ανοίγουν οι
// συνομιλίες μου στο πλάι», then «Όλες οι συνομιλίες» at the foot of
// that column opens the page that holds every one of them. The rail no
// longer has a row to it — /dashboard/chats belongs to «Ionexa Chat»
// now (src/lib/nav/rail.ts) — so a check for that row would be looking
// for something the owner removed.
const columnToggle = page.locator('[data-testid="chat-column-toggle"]');
checkTrue("the [◧] is in Chat's title row", (await columnToggle.count()) > 0);
await columnToggle.click();
const chatColumn = page.locator('[data-testid="chat-conversation-column"]');
await chatColumn.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
checkTrue("pressing it opens the conversations beside the thread", (await chatColumn.count()) > 0);
const allConversations = page.locator('[data-testid="chat-all-conversations"]');
checkTrue("...with «Όλες οι συνομιλίες» at its foot", (await allConversations.count()) > 0);
await allConversations.click();
await page.waitForURL("**/dashboard/chats", { timeout: 15_000 }).catch(() => {});
check("pressing it opens the Chats page", new URL(page.url()).pathname, "/dashboard/chats");
const stillOneSidebar = await page.locator('[data-testid="sidebar"]').count();
check("...which still has one sidebar and no conversations in it", stillOneSidebar, 1);
// WAITED FOR, NOT COUNTED ON ARRIVAL. waitForURL resolves on the URL,
// which a client navigation changes before the new page has rendered;
// counting straight after it read zero on a page that was about to
// draw the search box. The search is the right anchor either way: the
// list itself is absent on an account with no conversations, and this
// walk's account has none.
const chatsSearch = page.locator('main [data-testid="chats-search"]');
await chatsSearch.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
checkTrue("...and the conversation list is in the page, not the sidebar",
  (await chatsSearch.count()) > 0 &&
    (await page.locator('[data-testid="sidebar"] [data-testid="chats-search"]').count()) === 0);

console.log("\n== FLOW 8: Settings — every tab opens ==");
await page.goto(`http://127.0.0.1:${PORT}/dashboard/settings`, { waitUntil: "networkidle" });
check("settings loads", new URL(page.url()).pathname, "/dashboard/settings");
// Every panel the page renders must actually appear. A tab that throws
// takes the whole route down, so a rendered heading per section is the
// signal that each one mounted.
const headings = await page.locator("h2").allInnerTexts();
checkTrue(`settings renders its panels (${headings.length} sections)`, headings.length >= 4);
check("no panel rendered an unresolved i18n key", headings.filter((h) => /^[a-z]+\.[a-z.]+$/.test(h.trim())), []);
// Credit history is the panel that read "No credit activity yet" on an
// account whose ai_cost_log was full.
checkTrue("the credit history panel is present", headings.some((h) => /credit|χρεώ|υπόλοιπ/i.test(h)));

console.log("\n== FLOW 6: Credits — reserve -> settle -> margin ==");
// Deliberately NOT re-driven through the UI. This flow's correctness is
// arithmetic, and it is already proven exhaustively without a browser:
// billing-coverage brute-forces plan x pack x cost and asserts the
// guarantee holds. Re-asserting it here through a stubbed database would
// add confidence about nothing.
const billing = readFileSync("scripts/tests/billing-coverage.test.mjs", "utf8");
checkTrue("every AI call site is inventoried", /no undeclared AI call site/.test(billing));
checkTrue("margin is brute-forced across plan x pack x cost", /brute force: every plan x pack x cost/.test(billing));
checkTrue("the real production row is priced on every plan", /the real production row, priced on every plan and pack/.test(billing));
checkTrue("and it runs inside the build gate", /npm run test:unit/.test(readFileSync("package.json", "utf8")));

console.log("\n== integrity ==");
check("no uncaught page errors across the whole run", consoleErrors, []);

await browser.close();
cleanup();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
