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

// -------------------------------------------------------------------
console.log("\n== 4. every AI box says what it accepts, and what it will not do ==");
// -------------------------------------------------------------------
// The reported failure was not a broken control: a tester came away
// believing this product was "several LLMs in one, cheaper", and others
// asked where to paste their API key. That is what an empty box which
// accepts anything teaches. So each AI surface is opened in the
// production build and checked for the two things that answer it — three
// pressable examples, and one line saying what it will not do.
//
// At 375px, because a chip row that wraps into a wall of text on a phone
// is not the same feature as one that reads as three options.
{
  // Growth, so every surface below is actually reachable. Restored at the
  // end of the block so nothing after it inherits a paid account.
  setPlan("growth");
  const SURFACES = [
    { name: "createStudio", url: "/dashboard/create", input: "#studio-input" },
    { name: "mission", url: "/dashboard/mission", input: "#mission-goal", open: "New Mission" },
    { name: "research", url: "/dashboard/deep-research", input: "#research-topic" },
    { name: "chat", url: "/dashboard/chat", input: "textarea" },
  ];
  for (const surface of SURFACES) {
    const page = await authed.newPage();
    await page.setViewportSize({ width: 375, height: 812 });
    try {
      await page.goto(`http://127.0.0.1:${PORT}${surface.url}`, { waitUntil: "networkidle", timeout: 45000 });
      if (surface.open) {
        const opener = page.getByRole("button", { name: surface.open });
        if ((await opener.count()) > 0) {
          await opener.first().click();
          await page.waitForTimeout(400);
        }
      }
      const chips = page.locator(`[data-testid="examples-${surface.name}"] [data-testid="ai-example"]`);
      const count = await chips.count();
      if (count === 0) {
        // WHAT THE PAGE ACTUALLY SHOWED. "0 examples" has three very
        // different causes — the surface is behind a toggle, the account
        // cannot reach the feature at all, or the chips genuinely are not
        // rendered — and only the page can say which.
        console.log(`        page said: ${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300)}`);
      }
      checkTrue(`${surface.name}: 3-4 examples are on the page (${count})`, count >= 3 && count <= 4);

      const limits = page.locator(`[data-testid="examples-${surface.name}"] [data-testid="ai-limits"]`);
      const limitsText = ((await limits.count()) > 0 ? await limits.first().innerText() : "").trim();
      checkTrue(`${surface.name}: the limits line is readable ("${limitsText.slice(0, 46)}")`, limitsText.includes("·"));

      // The whole point: pressing one fills the box the user then sends.
      if (count > 0) {
        const wanted = (await chips.first().innerText()).trim();
        const box = page.locator(surface.input).first();
        await box.fill("");
        await chips.first().click();
        await page.waitForTimeout(200);
        const filled = (await box.inputValue()).trim();
        checkTrue(`${surface.name}: clicking an example fills the input ("${filled.slice(0, 36)}")`, filled === wanted);
      }

      // A chip row must not push the page sideways on a phone.
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      checkTrue(
        `${surface.name}: no horizontal overflow at 375px (${overflow.scrollWidth}/${overflow.clientWidth})`,
        overflow.scrollWidth <= overflow.clientWidth + 1
      );
    } finally {
      await page.close();
    }
  }
  setPlan(null);
}

// -------------------------------------------------------------------
console.log("\n== 5. the sidebar reads as Greek to a Greek user ==");
// -------------------------------------------------------------------
// SHOT IN GREEK ON PURPOSE. The fault this locks down is invisible in an
// English render: sidebar-label-keys.ts mapped four group headings and
// five item labels that sidebar-nav.ts does not use, so Workspace,
// Build, Business, Strategy, Files, Deep Research, Published Sites,
// Websites and Integrations printed raw English in all ten locales —
// with correct translations sitting unreachable beside them.
//
// It also checks the other half of the same problem: a page filed under
// "Build" that builds nothing now says so where the user can read it.
{
  const greek = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    locale: "el-GR",
  });
  await greek.addCookies([
    { ...AUTH_COOKIE, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
    { name: "NEXT_LOCALE", value: "el", domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
  ]);
  const page = await greek.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/coding`, { waitUntil: "networkidle", timeout: 45000 });

  // Open every collapsed group so the whole nav is measurable at once.
  for (const button of await page.locator("aside button[aria-expanded]").all()) {
    if ((await button.getAttribute("aria-expanded")) === "false") {
      await button.click();
      await page.waitForTimeout(80);
    }
  }
  await page.waitForTimeout(300);

  const aside = page.locator("aside").first();
  // innerText returns the CSS-TRANSFORMED text, and the group headings
  // carry `uppercase`. Greek uppercasing also drops the tonos by
  // typographic rule, so "Χώρος εργασίας" comes back as
  // "ΧΩΡΟΣ ΕΡΓΑΣΙΑΣ" — comparing the raw strings fails on a page that is
  // perfectly correct. Both sides are folded the same way instead.
  const fold = (text) =>
    text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const navText = await aside.innerText();
  const foldedNav = fold(navText);
  await aside.screenshot({ path: "/tmp/ionexa-sidebar-el.png" });

  // Every heading, by the Greek it must now be showing.
  for (const [english, greekWord] of [
    ["Workspace", "Χώρος εργασίας"],
    ["Build", "Δημιουργία"],
    ["Tracking", "Παρακολούθηση"],
    ["Business", "Επιχείρηση"],
    ["Strategy", "Στρατηγική"],
  ]) {
    checkTrue(`heading "${english}" renders as "${greekWord}"`, foldedNav.includes(fold(greekWord)), navText.slice(0, 300));
    checkTrue(`...and the English word is gone`, !new RegExp(`\\b${english}\\b`).test(navText));
  }
  // The five item labels that had no key at all.
  for (const [english, greekWord] of [
    ["Files", "Αρχεία"],
    ["Deep Research", "Βαθιά Έρευνα"],
    ["Integrations", "Συνδέσεις"],
    ["Published Sites", "Ζωντανά site"],
  ]) {
    checkTrue(`item "${english}" renders as "${greekWord}"`, foldedNav.includes(fold(greekWord)), navText.slice(-400));
  }
  // The approved renames, as the user sees them.
  for (const [was, now] of [
    ["AI Memory", "Αναζήτηση"],
    ["Mission Control", "Στόχοι & Σχέδια"],
    ["Timeline", "Ιστορικό"],
    ["Create Studio", "Φτιάξε κάτι"],
  ]) {
    checkTrue(`"${was}" now reads "${now}"`, foldedNav.includes(fold(now)), navText.slice(0, 400));
  }

  // THE HEADING AND THE SIDEBAR AGREE. This is the assertion that would
  // have caught renaming one and not the other.
  const heading = (await page.locator("main h1").first().innerText()).trim();
  checkTrue(`the page heading is Greek too ("${heading}")`, /Αιτήματα κώδικα/.test(heading), heading);
  checkTrue("...and matches what the sidebar calls it", foldedNav.includes(fold(heading)), `${heading} not in nav`);

  // A tracking page states, on screen, that it produces nothing.
  await page.screenshot({ path: "/tmp/ionexa-coding-el.png" });
  const main = await page.locator("main").innerText();
  checkTrue(
    "the AI Coding page says it does not write code",
    /δεν γράφει κώδικα/.test(main),
    main.replace(/\s+/g, " ").slice(0, 300)
  );
  checkTrue("no raw i18n key leaks into it", !/module\.empty/.test(main));

  await page.close();
  await greek.close();
}

await authed.close();

await browser.close();
cleanup();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
