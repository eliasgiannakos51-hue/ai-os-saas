// WHAT AN ACCOUNT WITH NO DATA IS TOLD ABOUT ITSELF.
//
// V4.6 #5. The complaint was a Business Health Score on a five-minute-old
// account, and the measured version of it was worse than the report: not
// "2", but "Business Health Score: 0 / 100", under the words "Just
// getting started", on a real production build with a real empty account.
//
// Zero out of a hundred is a VERDICT. The account had not done anything
// to be judged for, and `recency` for an account with no entries is not
// "0% healthy" — it is unknown. That is the NULL-versus-0 rule, applied
// to a number the product computes rather than to a column it stores.
//
// NOT EVERY ZERO IS THAT MISTAKE, and this file draws the line rather
// than counting characters. "Total entries: 0" on a new account is TRUE:
// it was measured and it is zero. So is "0 of 3 files", "0 things
// remembered" and "Achievements 0/23" — each is a real count of a real
// set. What is forbidden is a DERIVED VERDICT with nothing under it: a
// score, a rate, a percentage, an average computed from no observations.
//
// The stand-in account below creates no rows at all, so every table the
// dashboard reads answers empty. That is the state this file is about.
//
// Run: node scripts/tests/no-score-without-data.prodtest.mjs
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





// --- what the page says to an empty account ---------------------------
const PAGES = [
  "/dashboard/overview",
  "/dashboard",
  "/dashboard/timeline",
  "/dashboard/records",
  "/dashboard/analytics",
  "/dashboard/settings",
];

const READ = () =>
  page.evaluate(() => {
    const zeros = [];
    const dashes = [];
    for (const el of document.querySelectorAll("main *")) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || "").trim();
      if (!t) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const ctx = (el.parentElement?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 64);
      if (/^0([.,]0+)?$/.test(t) || /^0\s*(%|€|\/)/.test(t) || /^(0|0[.,]0+)\s+\S/.test(t)) {
        zeros.push({ t, ctx });
      }
      if (t === "—") dashes.push({ ctx });
    }
    return {
      zeros,
      dashes,
      url: location.pathname,
      // The health ring writes the number into its own aria-label, which
      // is the only place it is readable as a value rather than as a
      // painted arc.
      scoreLabel: document.querySelector('svg[aria-label*="/ 100"]')?.getAttribute("aria-label") ?? null,
      setupLabel:
        [...document.querySelectorAll("svg[aria-label]")]
          .map((s) => s.getAttribute("aria-label"))
          .find((l) => /\d+ \/ \d+$/.test(l ?? "") && !/\/ 100$/.test(l ?? "")) ?? null,
      bodyText: (document.querySelector("main")?.textContent ?? "").replace(/\s+/g, " "),
    };
  });

await page.setViewportSize({ width: 1440, height: 1000 });
const seen = {};
let firstVisit = true;
for (const url of PAGES) {
  await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: "networkidle" });
  if (firstVisit) {
    const accept = await page.$("button:has-text('Accept')");
    if (accept) {
      await accept.click();
      await page.waitForTimeout(400);
    }
    firstVisit = false;
  }
  // The stat numbers count up on mount; reading before that settles
  // measures the animation rather than the value.
  await page.waitForTimeout(1500);
  seen[url] = await READ();
}

console.log("\n== 1. every page measured the page it names ==");
// /dashboard/overview redirects to /onboarding without an onboarding
// row, and a run that does not check lands on the wrong screen and
// reports its zeros as the dashboard's.
for (const url of PAGES) {
  checkTrue(`${url} did not redirect (landed on ${seen[url].url})`, seen[url].url === url, seen[url].url);
}

console.log("\n== 2. NO SCORE BEFORE THERE IS EVIDENCE ==");
const home = seen["/dashboard/overview"];
checkTrue(
  `the health ring is absent on an empty account (${JSON.stringify(home.scoreLabel)})`,
  home.scoreLabel === null,
  `a score was painted: ${home.scoreLabel}`
);
// AND SOMETHING STANDS IN ITS PLACE. Removing the card and leaving a gap
// would pass the check above while making the page emptier, which is the
// opposite of the point.
checkTrue(
  `setup progress is shown instead (${JSON.stringify(home.setupLabel)})`,
  home.setupLabel !== null && / 0 \/ /.test(` ${home.setupLabel} `) === false,
  `no setup ring found, or it reads 0 of n — ${home.setupLabel}`
);
checkTrue(
  "and it counts real steps, not a placeholder",
  /(\d+) \/ (\d+)$/.test(home.setupLabel ?? "") &&
    Number(home.setupLabel.match(/(\d+) \/ (\d+)$/)[2]) >= 3,
  String(home.setupLabel)
);

console.log("\n== 3. no empty chart, and no missing one either ==");
// An all-zero series used to render NOTHING, so the card silently changed
// height between an account with data and one without and a new user was
// never told the space would fill.
checkTrue(
  "the stat cards say what fills the sparkline",
  /Fills in after \d+ entries/.test(home.bodyText),
  home.bodyText.slice(0, 200)
);

console.log("\n== 4. the zeros that remain are counted ones ==");
// A RATCHET WITH A REASON PER PAGE, not a total. Each of these is a real
// count of a real set on an account that genuinely has none of it, which
// is what "0" is allowed to mean. The numbers only ever go down.
//
//   overview  5  total entries, this week, and the three progress counts
//   analytics 1  "0 of 0" on the list-capped notice
//   settings  4  credits used, total entries, things remembered, 0/23
const ALLOWED_ZEROS = {
  "/dashboard/overview": 5,
  "/dashboard": 0,
  "/dashboard/timeline": 0,
  "/dashboard/records": 0,
  "/dashboard/analytics": 1,
  "/dashboard/settings": 4,
};
for (const url of PAGES) {
  const n = seen[url].zeros.length;
  const allowed = ALLOWED_ZEROS[url];
  checkTrue(
    `${url}: ${n} zero(s) shown, allowed ${allowed}`,
    n <= allowed,
    seen[url].zeros.map((z) => `"${z.t}" <- ${JSON.stringify(z.ctx)}`).join("\n        ")
  );
}
// And no allowance outlives the zero it was written for.
for (const url of PAGES) {
  const n = seen[url].zeros.length;
  checkTrue(
    `${url}: the allowance of ${ALLOWED_ZEROS[url]} is still needed (${n})`,
    n === ALLOWED_ZEROS[url],
    `${n} shown — lower the allowance to ${n}`
  );
}

console.log("\n== 5. and the one place already doing it right still is ==");
// "Most Active" has no answer on an empty account and prints an em dash
// rather than the name of a module with zero rows. It is the pattern the
// rest of this section is measured against, so it is asserted rather than
// admired.
checkTrue(
  `the overview still prints an em dash where it does not know (${home.dashes.length})`,
  home.dashes.length >= 1,
  "the em dash is gone — something started answering a question it cannot"
);

await browser.close();
cleanup();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
