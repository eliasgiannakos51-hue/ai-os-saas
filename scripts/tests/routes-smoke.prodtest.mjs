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

// /help is public on purpose: half the questions it answers ("what does it
// cost", "is my data safe", "what is this") are asked before anyone signs
// up, and an answer you need an account to read is not an answer.
const PUBLIC_ROUTES = ["/", "/pricing", "/help", "/terms", "/privacy", "/login", "/signup", "/roadmap"];
// /onboarding is authenticated but lives OUTSIDE /dashboard on purpose —
// it has no sidebar, because the one thing it is for is getting real
// data in and one true sentence back out. Listed here so the smoke test
// covers it like any other signed-in page.
const DASHBOARD_ROUTES = [
  "/dashboard",
  "/dashboard/overview",
  "/dashboard/chat",
  "/dashboard/create",
  "/dashboard/website-builder",
  "/dashboard/mission",
  "/dashboard/documents",
  "/dashboard/favorites",
  "/dashboard/timeline",
  "/dashboard/memory",
  "/dashboard/marketplace",
  "/dashboard/settings",
  "/dashboard/team",
  "/dashboard/reflection",
  "/dashboard/agents",
  "/dashboard/published",
  "/dashboard/integrations",
  "/dashboard/files",
  "/dashboard/deep-research",
  "/onboarding",
  "/dashboard/apps",
  "/dashboard/images",
  "/dashboard/videos",
  "/dashboard/coding",
  "/dashboard/campaigns",
  "/dashboard/data-analysis",
  "/dashboard/presentations",
  "/dashboard/websites",
  "/dashboard/product-workflow",
  "/dashboard/trading-workflow",
];

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// An unresolved next-intl key renders as its own dotted path. Matching
// VISIBLE TEXT rather than raw HTML avoids flagging class names and
// data attributes, which contain dots legitimately.
const KEY_RE = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){2,}$/;

async function inspect(context, route) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  let status = 0;
  try {
    const res = await page.goto(`http://127.0.0.1:${PORT}${route}`, {
      waitUntil: "networkidle",
      timeout: 25000,
    });
    status = res?.status() ?? 0;
  } catch (err) {
    await page.close();
    return { status: 0, errors: [`navigation failed: ${err.message}`], keys: [], overflow: null, overflowTablet: null, landedOn: route };
  }
  const landedOn = new URL(page.url()).pathname;

  const keys = await page.evaluate((pattern) => {
    const re = new RegExp(pattern);
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim() ?? "";
      if (text && re.test(text)) out.push(text);
    }
    return [...new Set(out)].slice(0, 5);
  }, KEY_RE.source);

  // MEASURED AT TWO WIDTHS, and the second one is why.
  //
  // This check used to run at 375px only, and 375px was fine — so every
  // route passed while the dashboard header overflowed the viewport by up
  // to 190px between 640px and 1023px. That is a tablet, or a desktop
  // window at half screen. The visible symptom was reported three times as
  // "the Publish bar is squeezed to the left"; the publish dialog was
  // rebuilt twice on that report and was never the cause. Sampling one
  // width and calling the layout checked is what let it survive.
  //
  // 768px is the width where the sidebar appears while the header still
  // carries its full-width controls — the worst case, not an arbitrary
  // second sample.
  const measure = async (width, height) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    return page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
  };
  const overflow = await measure(375, 800);
  const overflowTablet = await measure(768, 1024);

  // Noise that is not a defect in this environment: the stand-in Supabase
  // returns empty rows, and favicon/asset 404s are not route failures.
  // "Failed to fetch RSC payload ... Falling back to browser navigation"
  // is this harness's own noise, not a page defect: Next prefetches every
  // sidebar link, and closing the page between routes aborts whatever is
  // still in flight. Next then falls back to a normal navigation, which
  // is the graceful path — a user never sees it. Filtered by that exact
  // signature rather than by "fetch", so a genuine failed request on the
  // page still fails the route.
  const real = errors.filter(
    (e) =>
      !/favicon|Failed to load resource|net::ERR_/i.test(e) &&
      !/Failed to fetch RSC payload[\s\S]*Falling back to browser navigation/i.test(e)
  );
  await page.close();
  return { status, errors: real, keys, overflow, overflowTablet, landedOn };
}

console.log("\n== 1. public routes (logged out) ==");
const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
for (const route of PUBLIC_ROUTES) {
  const r = await inspect(anon, route);
  check(`${route}: 200`, r.status, 200);
  check(`${route}: no console errors`, r.errors, []);
  check(`${route}: no unresolved i18n keys`, r.keys, []);
  checkTrue(
    `${route}: no horizontal overflow @375px (${r.overflow?.scrollWidth}/${r.overflow?.clientWidth})`,
    r.overflow && r.overflow.scrollWidth <= r.overflow.clientWidth + 1,
    JSON.stringify(r.overflow)
  );
  checkTrue(
    `${route}: no horizontal overflow @768px (${r.overflowTablet?.scrollWidth}/${r.overflowTablet?.clientWidth})`,
    r.overflowTablet && r.overflowTablet.scrollWidth <= r.overflowTablet.clientWidth + 1,
    JSON.stringify(r.overflowTablet)
  );
}
await anon.close();

console.log("\n== 2. dashboard routes (logged in) ==");
const authed = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await authed.addCookies([
  { ...AUTH_COOKIE, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
]);
for (const route of DASHBOARD_ROUTES) {
  const r = await inspect(authed, route);
  check(`${route}: 200`, r.status, 200);
  // A silent redirect to /login is the failure mode that makes every
  // other assertion on this route pass while proving nothing.
  checkTrue(`${route}: did not bounce to /login`, r.landedOn !== "/login", `landed on ${r.landedOn}`);
  check(`${route}: no console errors`, r.errors, []);
  check(`${route}: no unresolved i18n keys`, r.keys, []);
  checkTrue(
    `${route}: no horizontal overflow @375px (${r.overflow?.scrollWidth}/${r.overflow?.clientWidth})`,
    r.overflow && r.overflow.scrollWidth <= r.overflow.clientWidth + 1,
    JSON.stringify(r.overflow)
  );
  checkTrue(
    `${route}: no horizontal overflow @768px (${r.overflowTablet?.scrollWidth}/${r.overflowTablet?.clientWidth})`,
    r.overflowTablet && r.overflowTablet.scrollWidth <= r.overflowTablet.clientWidth + 1,
    JSON.stringify(r.overflowTablet)
  );
}
// A route returning 200 says the page rendered. It does not say the
// controls on it are FINDABLE, which is the thing that was actually
// reported: "the image upload exists but nobody sees it", "there is no
// AI indication anywhere". Both of those would pass every assertion
// above. So the two screens carrying new, must-be-noticed controls are
// checked for what a user would look at, in the production build, at
// phone width.
console.log("\n== 3. new controls are actually visible (production build, 375px) ==");
{
  const page = await authed.newPage();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/website-builder`, {
    waitUntil: "networkidle",
    timeout: 45000,
  });

  // The generation form opens by default when the account has no sites,
  // which is the state this stand-in serves.
  const visible = async (selector) => {
    const el = page.locator(selector).first();
    return (await el.count()) > 0 && (await el.isVisible());
  };

  checkTrue("design section heading is on screen", await visible('h3:has-text("Design")'));
  checkTrue("a primary colour picker is on screen", await visible('input[type="color"]'));
  const colourInputs = await page.locator('input[type="color"]').count();
  check("both primary and secondary colour pickers exist", colourInputs, 2);
  checkTrue("background options are on screen", await visible('button:has-text("Animated gradient")'));
  checkTrue('"You choose" is the default background', await visible('button[aria-pressed="true"]:has-text("You choose")'));
  checkTrue(
    '"My own photo" is offered but disabled with nothing uploaded',
    await page.locator('button:has-text("My own photo")[disabled]').count() > 0
  );
  checkTrue(
    "the upload control explains what it is for",
    await visible('text=/logo, product shots/i')
  );

  // The controls must actually DO something — one that renders and is
  // inert is exactly the failure this section exists to catch.
  //
  // `fill()`, not a hand-dispatched Event. Setting .value from script and
  // dispatching an event does not reach a React onChange: React's value
  // tracker sees no change and swallows it. That is a property of the
  // test technique, not of the app, and using it would have produced a
  // failure that says nothing about whether a real click works.
  await page.locator('input[type="color"]').first().fill("#1d4ed8");
  check(
    "picking a colour fills the paired hex field",
    await page.locator('input[aria-label="Primary colour (hex)"]').inputValue(),
    "#1d4ed8"
  );

  // ...and the other direction: typing a hex drives the swatch.
  await page.locator('input[aria-label="Secondary colour (hex)"]').fill("#f59e0b");
  check(
    "typing a hex drives the colour swatch",
    await page.locator('input[type="color"]').nth(1).inputValue(),
    "#f59e0b"
  );

  // A background chip really selects.
  await page.locator('button:has-text("Animated gradient")').first().click();
  checkTrue(
    "choosing a background marks it selected",
    (await page
      .locator('button[aria-pressed="true"]:has-text("Animated gradient")')
      .count()) > 0
  );

  await page.close();
}

{
  const page = await authed.newPage();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/deep-research`, {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  // EU AI Act art. 50 — the notice has to be READABLE, not present.
  // Deep Research renders it above a finished report; with no report on
  // this stand-in account, what is assertable here is that the page
  // carries the translated string rather than a raw key.
  const body = await page.locator("body").innerText();
  checkTrue("no raw i18n key leaks into Deep Research", !/common\.aiGenerated/.test(body));
  await page.close();
}

await authed.close();

// ---------------------------------------------------------------------
// /pricing — the quantitative limits, in a real browser, in Greek.
//
// The build gate (scripts/tests/combined-ceiling.test.mjs) proves each
// number is READ FROM the module that enforces it and that every label
// exists in ten locales. It cannot prove the page renders them, and the
// difference is not academic: the first browser run of this check found
// two English sentences and one English word ("/seat") that every
// source-side i18n gate in the repo structurally could not see.
//
// Public page, so no auth — a fresh context with the locale cookie the
// app actually reads (src/i18n/request.ts is cookie-based, not
// header-based; setting accept-language alone renders English).
{
  const ctx = await browser.newContext({ locale: "el" });
  await ctx.addCookies([
    { name: "NEXT_LOCALE", value: "el", url: `http://127.0.0.1:${PORT}` },
  ]);
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/pricing`, {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  const main = await page.locator("main").innerText();

  // Every enforced per-plan number, as the server would refuse it.
  for (const [what, values] of Object.entries({
    "free chat": ["15", "43", "107", "215", "430"],
    "deep research": ["2", "10", "50", "200"],
    files: ["20", "100", "500"],
    storage: ["500 MB", "2 GB", "10 GB", "50 GB"],
    "published sites": ["1", "3", "10", "30"],
  })) {
    const missing = values.filter((v) => !main.includes(v));
    checkTrue(`/pricing shows every ${what} limit (${values.join(", ")})`, missing.length === 0);
    if (missing.length) console.log(`        missing: ${missing.join(", ")}`);
  }

  // Greek page, Greek copy. Three or more consecutive English words is a
  // literal somebody forgot; brand names are shorter than that.
  const english = [...main.matchAll(/(?:^|[^\p{L}])([A-Za-z]{3,}(?: [a-z]{3,}){2,})/gu)].map((m) => m[1]);
  checkTrue("no English sentence survives in the Greek pricing page", english.length === 0);
  if (english.length) console.log(`        ${english.join(" | ")}`);
  checkTrue("…and the row labels really are translated", /Αποθηκευτικός χώρος/.test(main));
  checkTrue("…including the per-seat price", /θέση/.test(main) && !/\/seat/.test(main));

  // THE COOKIE BANNER, which renders on every public page in every locale
  // and was hardcoded English in all ten. Checked here rather than in its
  // own file because it is already on screen: the banner is what the
  // /pricing scan above kept tripping over.
  {
    const banner = page.locator("div.fixed.inset-x-0.bottom-0").first();
    checkTrue("the cookie banner is visible on a public page", await banner.isVisible());
    const collapsed = await banner.innerText();
    checkTrue("the banner summary is Greek", /Χρησιμοποιούμε cookies/.test(collapsed));
    checkTrue("the banner's Accept button is Greek", collapsed.includes("Αποδοχή"));
    // Expanded is where the bulk of the English lived — three paragraphs
    // of cookie detail that no source-side i18n gate could see.
    await banner.locator("button").first().click();
    await page.waitForTimeout(350);
    const expanded = await banner.innerText();
    checkTrue("the banner detail is Greek", /Απαραίτητο cookie συνεδρίας/.test(expanded));
    const bannerEnglish = expanded.match(/[A-Za-z]{3,}(?: [a-z]{3,}){2,}/);
    checkTrue("no English sentence survives in the banner", bannerEnglish === null);
    if (bannerEnglish) console.log(`        ${bannerEnglish[0]}`);
    // The two policy links are rich-text tags inside one message, so they
    // must still come out as real anchors rather than as literal markup.
    const hrefs = await banner
      .locator("a")
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    checkTrue(
      "both policy links survive rich-text rendering",
      hrefs.includes("/cookies") && hrefs.includes("/privacy")
    );
  }

  // 375 is where the seven-column table would break the page if it were
  // not scrolling inside its own container. 768 is where a publish bug
  // once hid between the two widths everyone tests.
  for (const width of [375, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(120);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    checkTrue(`/pricing does not scroll horizontally at ${width}px (overflow ${overflow}px)`, overflow <= 1);
  }
  await page.close();
  await ctx.close();
}

await browser.close();
cleanup();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
