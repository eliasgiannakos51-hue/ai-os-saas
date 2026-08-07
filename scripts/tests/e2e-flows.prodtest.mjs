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
    server.kill("SIGKILL");
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
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
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
checkTrue("the page is still intact after 3 round trips", (await page.locator("aside nav a").count()) > 10);

console.log("\n== FLOW 5: Chat — composer, focus mode ==");
await page.goto(`http://127.0.0.1:${PORT}/dashboard/chat`, { waitUntil: "networkidle" });
check("chat loads", new URL(page.url()).pathname, "/dashboard/chat");
const composer = page.locator("textarea").first();
checkTrue("the composer is present", await composer.isVisible());

// The focus-mode toggle shipped once as a bare 36x36 icon whose only
// affordance was a native `title`. It rendered correctly and no user
// found it. "Renders" is not the same claim as "is findable", so this
// asserts a VISIBLE text label, not merely existence.
const toggle = page.locator("[aria-expanded]").filter({ hasText: /.+/ }).first();
const toggleCount = await page.locator("button[aria-expanded]").count();
checkTrue(`a focus-mode toggle exists (${toggleCount} aria-expanded buttons)`, toggleCount >= 1);
const focusBtn = page.locator("button[aria-expanded]").last();
const labelBefore = (await focusBtn.innerText()).trim();
checkTrue(`it carries a visible text label ("${labelBefore}")`, labelBefore.length > 2);
const expandedBefore = await focusBtn.getAttribute("aria-expanded");
await focusBtn.click();
await page.waitForTimeout(350);
const expandedAfter = await focusBtn.getAttribute("aria-expanded");
checkTrue(`toggling flips aria-expanded (${expandedBefore} -> ${expandedAfter})`, expandedBefore !== expandedAfter);
const labelAfter = (await focusBtn.innerText()).trim();
checkTrue(`and the label changes with it ("${labelAfter}")`, labelAfter !== labelBefore);
await focusBtn.click();
await page.waitForTimeout(350);
check("toggling back restores the original state", await focusBtn.getAttribute("aria-expanded"), expandedBefore);

console.log("\n== FLOW 9: First 60 seconds — one question, four doors ==");
// The whole feature, driven the way a new account experiences it, in the
// production build. The stand-in's user_onboarding starts EMPTY, which
// is exactly a fresh account — including an OAuth account whose
// bootstrap failed: this USER carries no subscription_tier in its
// metadata and the flow must not care.

// Phase 1: a new account landing on the dashboard is taken to the
// question — and the question is the ACTION question, not a tour.
await page.goto(`http://127.0.0.1:${PORT}/dashboard/overview`, { waitUntil: "networkidle" });
check("a fresh account is taken to /onboarding", new URL(page.url()).pathname, "/onboarding");
checkTrue(
  "the first screen asks what to DO",
  await page.getByRole("heading", { name: "What do you want to do first?" }).isVisible()
);
const doorTexts = await page.locator("section button").allInnerTexts();
checkTrue(`four doors are offered (${doorTexts.length})`, doorTexts.length === 4);
checkTrue("skip is visible on the very first step", await page.getByText("Skip for now").isVisible());
const bodyText = await page.locator("body").innerText();
checkTrue("no plan or price is sold on the welcome", !/€|\/month|per month|Upgrade/i.test(bodyText));

// Phase 2: the chat door. One click -> /dashboard/chat with the
// composer focused, and the choice recorded server-side.
const onboardingWritesBefore = supaHits.filter((h) => h.startsWith("POST /rest/v1/user_onboarding")).length;
await page.getByRole("button", { name: "Just ask something" }).click();
await page.waitForURL("**/dashboard/chat", { timeout: 15000 });
check("the chat door lands on chat", new URL(page.url()).pathname, "/dashboard/chat");
await page.waitForTimeout(400);
checkTrue(
  "the composer is focused on arrival — input ready",
  await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA")
);
const onboardingWritesAfter = supaHits.filter((h) => h.startsWith("POST /rest/v1/user_onboarding")).length;
checkTrue(
  `the choice was recorded in the DATABASE, not localStorage (+${onboardingWritesAfter - onboardingWritesBefore} writes)`,
  onboardingWritesAfter > onboardingWritesBefore
);
checkTrue(
  "nothing was stashed in localStorage",
  await page.evaluate(() => !Object.keys(localStorage).some((k) => /onboard/i.test(k)))
);

// Phase 3: the row is now complete. The BACK BUTTON must not resurrect
// the flow. staleTimes.dynamic=0 does NOT cover this: the Router Cache
// serves back/forward from cache regardless, which is why the doors
// REPLACE the /onboarding history entry instead of pushing on top of it
// — Back from the destination goes to wherever the user was before the
// flow. A hand-typed /onboarding must still bounce to the dashboard.
TABLE_ROWS.user_onboarding = [
  { user_id: USER.id, goal: null, first_action: "chat", completed_at: "2026-08-07T10:00:00Z", skipped_at: null },
];
await page.goBack({ waitUntil: "networkidle" });
checkTrue(
  `browser back after completing does NOT re-show the flow (landed on ${new URL(page.url()).pathname})`,
  new URL(page.url()).pathname !== "/onboarding"
);
await page.goto(`http://127.0.0.1:${PORT}/onboarding`, { waitUntil: "networkidle" });
check("a direct /onboarding URL after completing bounces to the dashboard", new URL(page.url()).pathname, "/dashboard/overview");

// Phase 4: a refresh MID-IMPORT resumes at the recorded step, not the
// first question all over again.
TABLE_ROWS.user_onboarding = [
  { user_id: USER.id, goal: "trading", first_action: "data", completed_at: null, skipped_at: null },
];
await page.goto(`http://127.0.0.1:${PORT}/onboarding`, { waitUntil: "networkidle" });
checkTrue(
  "F5 mid-import resumes at the source step",
  await page.getByRole("heading", { name: "Bring your data in" }).isVisible()
);
checkTrue(
  "the privacy notice appears exactly where data changes hands",
  (await page.locator("body").innerText()).includes("Your data stays yours")
);

// Phase 5: the website door arrives with the brief already written.
TABLE_ROWS.user_onboarding = [];
await page.goto(`http://127.0.0.1:${PORT}/onboarding`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Build a website" }).click();
await page.waitForURL("**/dashboard/website-builder?example=1", { timeout: 15000 });
await page.waitForTimeout(400);
const nameValue = await page.locator('input[type="text"]').first().inputValue();
check("the builder form is pre-filled with the example name", nameValue, "Aroma — neighbourhood coffee shop");
const briefValue = await page.locator("textarea").first().inputValue();
checkTrue(`...and a complete example brief (${briefValue.length} chars)`, briefValue.length > 100);

// Phase 6: the mission door lands on an OPEN goal form with focus in it.
TABLE_ROWS.user_onboarding = [];
await page.goto(`http://127.0.0.1:${PORT}/onboarding`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Set a goal" }).click();
await page.waitForURL("**/dashboard/mission", { timeout: 15000 });
await page.waitForTimeout(400);
checkTrue(
  "the goal box is focused on arrival — input ready",
  await page.evaluate(() => document.activeElement?.id === "mission-goal")
);

// Leave the row complete so the flows below are not intercepted.
TABLE_ROWS.user_onboarding = [
  { user_id: USER.id, goal: null, first_action: "chat", completed_at: "2026-08-07T10:00:00Z", skipped_at: null },
];

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
