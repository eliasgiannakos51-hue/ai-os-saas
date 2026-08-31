// HOW MANY ORANGE THINGS ARE ON SCREEN AT ONE MOMENT.
//
// scripts/tests/one-primary-action.test.mjs counts filled accent controls
// by reading source, and says what a page CAN show. This says what a
// person MEETS: computed styles, in a real Chromium, against a real
// production build, on the real routes.
//
// The two disagree on purpose and both are needed. The static count is an
// upper bound — several controls on a page are mutually exclusive at
// runtime (an upgrade wall renders INSTEAD of a list) — so it reads high:
// eight for Settings against five actually painted. And it reads BLIND in
// the other direction, because it only looks at <button>, <a> and <Link>:
// ten drifting <span> dots from components/ui/ambient-dots.tsx are orange
// on every dashboard page and no source-level button scan will ever see
// them.
//
// So: the source gate holds the button rule, and this holds the total.
//
// Run: node scripts/tests/accent-census.prodtest.mjs
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




// --- the census -------------------------------------------------------
// An orange/amber surface: strong red, mid green, low blue, and at least
// half opaque. Computed, not classed — a colour is what it renders as.
const CENSUS = () =>
  page.evaluate(() => {
    const isAccent = (c) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return false;
      const [r, g, b] = [+m[1], +m[2], +m[3]];
      const a = m[4] === undefined ? 1 : +m[4];
      return a >= 0.5 && r > 190 && g > 90 && g < 200 && b < 90;
    };
    const filled = [];
    let glows = 0;
    let borders = 0;
    let texts = 0;
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const onScreen =
        rect.width > 0 && rect.height > 0 && rect.bottom > 0 &&
        rect.top < window.innerHeight && cs.visibility !== "hidden" && +cs.opacity > 0.1;
      if (!onScreen) continue;
      if (/rgba?\(2[0-9]{2},\s*1[0-9]{2}/.test(cs.boxShadow)) glows++;
      if (isAccent(cs.borderTopColor) && parseFloat(cs.borderTopWidth) > 0) borders++;
      if (isAccent(cs.color)) texts++;
      if (!isAccent(cs.backgroundColor)) continue;
      const tag = el.tagName.toLowerCase();
      filled.push({
        tag,
        pressable: tag === "button" || tag === "a" || el.getAttribute("role") === "button",
        text: (el.textContent || "").trim().slice(0, 32),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    }
    return { filled, glows, borders, texts, url: location.pathname };
  });

async function visit(url) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: "networkidle" });
  await page.waitForSelector("aside nav a", { timeout: 15000 });
  // The cookie banner is a real filled accent button and a real part of a
  // first visit — measured with it up would count it on every page, which
  // is a fact about the banner rather than about the page. Dismissed, so
  // what is left is the steady state.
  const accept = await page.$("button:has-text('Accept')");
  if (accept) {
    await accept.click();
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(400);
  return CENSUS();
}

const PAGES = ["/dashboard/overview", "/dashboard/records", "/dashboard/settings", "/dashboard/timeline"];
const seen = {};
console.log("\n== what is orange, on screen, at 1920x1080 ==");
for (const url of PAGES) {
  const r = await visit(url);
  seen[url] = r;
  const pressable = r.filled.filter((f) => f.pressable);
  const decorative = r.filled.filter((f) => !f.pressable);
  console.log(
    `\n  ${url}\n    filled: ${r.filled.length} (${pressable.length} pressable, ${decorative.length} decorative)` +
      ` · glows: ${r.glows} · borders: ${r.borders} · text runs: ${r.texts}`
  );
  for (const f of pressable) console.log(`      PRESSABLE ${f.w}x${f.h}  ${JSON.stringify(f.text)}`);
}

console.log("\n== 1. every census measured the page it names ==");
// The trap this file fell into: /dashboard/overview redirects to
// /onboarding for an account with no onboarding row, so the first run
// measured the onboarding page and printed "Home" over it.
for (const url of PAGES) {
  checkTrue(`${url} did not redirect (landed on ${seen[url].url})`, seen[url].url === url, seen[url].url);
}

console.log("\n== 2. ONE filled accent button per screen ==");
// The rule, measured the only way it can honestly be measured: what is
// painted. Not what the source could paint.
//
// ONE PAGE IS OVER IT AND IS NAMED HERE RATHER THAN ROUNDED AWAY.
// /dashboard/settings paints two: the top bar's "Make anything", which
// every page carries, and Integrations' "Connect". Two filled buttons on
// a settings page is the rule broken — a settings page has no single
// action, which is exactly why the loud one should not be there — and the
// fix is one class on one button. It is recorded rather than made because
// which button loses its fill is a design decision, not a test's.
//
// The allowance only ever goes DOWN. Lower it in the same commit that
// changes the button.
const ALLOWED = { "/dashboard/settings": 2 };
for (const url of PAGES) {
  const pressable = seen[url].filled.filter((f) => f.pressable);
  const allowed = ALLOWED[url] ?? 1;
  checkTrue(
    `${url}: ${pressable.length} filled accent button(s), allowed ${allowed}`,
    pressable.length <= allowed,
    pressable.map((f) => `${f.w}x${f.h} ${JSON.stringify(f.text)}`).join(" | ")
  );
}
// AND NO ALLOWANCE OUTLIVES THE BUTTON IT WAS WRITTEN FOR. An exception
// left behind after the page is fixed is a licence to add a different
// second button, silently.
for (const [url, allowed] of Object.entries(ALLOWED)) {
  const actual = seen[url]?.filled.filter((f) => f.pressable).length;
  checkTrue(
    `the ${url} allowance of ${allowed} is still needed (${actual})`,
    actual === allowed,
    `${actual} painted — lower the allowance to ${actual}`
  );
}

console.log("\n== 3. the decorative accent, counted rather than argued about ==");
// TEN DRIFTING DOTS, on every dashboard page, from ambient-dots.tsx
// (DOT_COUNT = 10, mounted once in dashboard/layout.tsx). They are
// aria-hidden, 3-6px and pointer-events-none, so they are not competing
// for a click — but they ARE ten orange marks beside the one control that
// is supposed to be the loudest thing on the screen, and no source-level
// button scan can see them. Pinned at ten: an eleventh is a decision.
for (const url of PAGES) {
  const decorative = seen[url].filled.filter((f) => !f.pressable);
  checkTrue(
    `${url}: ${decorative.length} decorative accent surfaces`,
    decorative.length === 10,
    decorative.map((f) => `${f.tag} ${f.w}x${f.h}`).join(", ")
  );
}

console.log("\n== 4. the glow is not around the cards ==");
// THE BRIEF'S PREMISE WAS THAT GLOWS BLUR THE TEXT AROUND CARDS. Measured:
// 48 accent box-shadows exist in the source, but 37 of them are behind
// `hover:` or `focus:` and 14 of the rest live on modals, the auth pages
// and pricing. At rest, on a dashboard page, almost nothing glows — and
// what does is the sidebar's active icon (a drop-shadow on the icon, not
// a halo around a card).
for (const url of PAGES) {
  checkTrue(`${url}: ${seen[url].glows} accent glow(s) at rest`, seen[url].glows <= 2, String(seen[url].glows));
}

await browser.close();
cleanup();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
