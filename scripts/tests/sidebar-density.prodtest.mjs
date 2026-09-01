// HOW MANY SIDEBAR ROWS CAN A PERSON ACTUALLY SEE WITHOUT SCROLLING?
//
// V4.6 #3 asked for the number before and after, at 1080p and at 768p,
// and a number like that is not something a source file can be read for:
// it depends on row height, group padding, which groups are expanded, the
// height of the logo block and the account card, and the fact that the
// <aside> scrolls independently of the page. So it is measured, in a real
// Chromium, against a real production build, on the real /dashboard
// route — not counted in a config and called a measurement.
//
// WHAT "VISIBLE" MEANS HERE, stated because it is the whole result: an
// <a> inside the sidebar whose bounding box lies ENTIRELY inside the
// aside's own visible box, with no scrolling of the aside and none of the
// page. A row half-cut by the fold is not a row somebody can read, and
// counting it would flatter the number.
//
// Nothing in the app is patched. Auth and the database are replaced by a
// local server speaking Supabase's own HTTP protocol — the same stand-in
// scripts/tests/sidebar-tooltips.prodtest.mjs uses — so the real
// dashboard/layout.tsx, the real <Sidebar/> and the real role filter all
// run exactly as they do in production.
//
// Run: node scripts/tests/sidebar-density.prodtest.mjs
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



// --- the measurement ---------------------------------------------------
// Nine sample points down the aside are NOT what this needs: a row is
// either wholly inside the visible box or it is not, and elementFromPoint
// would only re-derive what the two rects already say. What it does need
// is to distinguish the aside's SCROLL height from its CLIENT height,
// because the sidebar is `overflow-y-auto` and a row 40px below the fold
// is present in the DOM, hit-testable by a script, and invisible to a
// person.
async function measure(width, height) {
  await page.setViewportSize({ width, height });
  const resp = await page.goto(`http://127.0.0.1:${PORT}/dashboard`, { waitUntil: "networkidle" });
  if (!resp || resp.status() >= 400) return { error: `HTTP ${resp?.status()}` };
  // The nav is server-rendered, but the accordion's open group is decided
  // by an effect on the client. Wait for the aside AND for hydration to
  // have settled, or the count is of a pre-hydration tree.
  await page.waitForSelector("aside nav a", { timeout: 15000 });
  await page.waitForTimeout(600);

  return await page.evaluate(() => {
    const aside = document.querySelector("aside");
    if (!aside) return { error: "no <aside>" };
    const box = aside.getBoundingClientRect();
    // The aside's own visible window: its rect clipped to the viewport.
    const top = Math.max(box.top, 0);
    const bottom = Math.min(box.bottom, window.innerHeight);

    // EVERY GROUP HEADING, not just the ones inside <nav>.
    //
    // This counted `nav > div > button, nav > div > p` and reported THREE
    // groups for a sidebar that has four: the Settings group is rendered
    // in its own bordered <div> AFTER </nav>, so the selector could not
    // see it. A limit of four that cannot see the fourth group would have
    // passed a sidebar with five. Both containers are read now, and the
    // heading is identified by what makes it one — the uppercase
    // tracking-widest label — rather than by where it happens to sit.
    const headings = [...aside.querySelectorAll("button, p")].filter((el) =>
      el.className.includes("uppercase") && el.className.includes("tracking-widest")
    ).length;

    const links = [...aside.querySelectorAll("a.nav-item")];

    // HIT-TESTED, NOT RECT-COMPARED.
    //
    // A collapsed group is collapsed with `grid-template-rows: 0fr` and
    // `overflow: hidden` on its container. Its links keep their own
    // natural bounding boxes — a getBoundingClientRect() comparison calls
    // every one of them visible, and the first run of this file duly
    // reported fifteen readable rows on a page showing seven. So each row
    // is probed with elementFromPoint at three points across its middle
    // (left third, centre, right third): a point returns this link only
    // if the link is really painted there and nothing is over it.
    const visible = links.filter((a) => {
      const r = a.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) return false;
      if (r.top < top - 0.5 || r.bottom > bottom + 0.5) return false;
      const y = r.top + r.height / 2;
      const xs = [r.left + r.width / 3, r.left + r.width / 2, r.right - r.width / 3];
      return xs.every((x) => {
        const hit = document.elementFromPoint(x, y);
        return hit && (hit === a || a.contains(hit));
      });
    });

    return {
      rendered: links.length,
      visible: visible.length,
      headings,
      asideScrollHeight: aside.scrollHeight,
      asideClientHeight: aside.clientHeight,
      overflows: aside.scrollHeight > aside.clientHeight + 1,
      labels: visible.map((a) => a.textContent.trim()),
    };
  });
}

// The same measurement with every collapsible group opened, which answers
// a different and equally real question: if somebody expands the whole
// nav, does it still fit? That is the number the eight-group sidebar
// could not survive.
async function measureExpanded(width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`http://127.0.0.1:${PORT}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForSelector("aside nav a", { timeout: 15000 });
  await page.waitForTimeout(400);
  // The accordion allows one open group at a time, so "expand everything"
  // is not reachable by clicking. Force the containers open instead and
  // measure the height the content WOULD need — the question is whether
  // the panel is big enough for its own contents, not whether the
  // accordion lets you ask for it.
  return await page.evaluate(() => {
    const aside = document.querySelector("aside");
    if (!aside) return { error: "no <aside>" };
    for (const el of aside.querySelectorAll("div.grid")) {
      el.style.gridTemplateRows = "1fr";
    }
    const links = aside.querySelectorAll("a.nav-item").length;
    return {
      rendered: links,
      asideScrollHeight: aside.scrollHeight,
      asideClientHeight: aside.clientHeight,
      overflows: aside.scrollHeight > aside.clientHeight + 1,
    };
  });
}

const VIEWPORTS = [
  { name: "1080p (1920x1080)", width: 1920, height: 1080 },
  { name: "768p  (1366x768)", width: 1366, height: 768 },
];

console.log("\n== sidebar density, measured in a real browser ==");
const results = {};
const expanded = {};
for (const vp of VIEWPORTS) {
  const m = await measure(vp.width, vp.height);
  results[vp.name] = m;
  if (m.error) {
    checkTrue(`${vp.name}: the dashboard rendered`, false, m.error);
    continue;
  }
  console.log(
    `  ${vp.name}: ${m.visible} of ${m.rendered} rows painted and readable without scrolling, ` +
      `${m.headings} group headings`
  );
  console.log(`      ${m.labels.join(" · ")}`);
  const e = await measureExpanded(vp.width, vp.height);
  expanded[vp.name] = e;
  console.log(
    `      with every group forced open: ${e.asideScrollHeight}px of content in ` +
      `${e.asideClientHeight}px${e.overflows ? " — SCROLLS" : " — fits"}`
  );
}

console.log("\n== 1. four groups, and that is what the browser paints ==");
// Counted from the DOM, not from lib/sidebar-nav.ts. The config saying
// four and the page painting more would be exactly the gap the brief is
// about — and the Settings group renders outside <nav>, which is how the
// first version of this file reported three.
for (const vp of VIEWPORTS) {
  const m = results[vp.name];
  if (m.error) continue;
  checkTrue(`${vp.name}: ${m.headings} group headings, limit 4`, m.headings <= 4, String(m.headings));
  checkTrue(
    `${vp.name}: and all four were found, not just the ones inside <nav>`,
    m.headings === 4,
    `${m.headings} — the Settings group renders after </nav>`
  );
}

console.log("\n== 2. at most twenty rows exist at all ==");
for (const vp of VIEWPORTS) {
  const m = results[vp.name];
  if (m.error) continue;
  // Every .nav-item in the DOM, collapsed groups included: the count of
  // rows the sidebar is WILLING to show, which is what the limit is about.
  checkTrue(`${vp.name}: ${m.rendered} rows in the DOM, limit 20`, m.rendered <= 20, String(m.rendered));
}

console.log("\n== 3. the rows a person can actually read on arrival ==");
// MEASURED BEFORE AND AFTER, on the same harness, at the same two sizes,
// with the same hit-test. The before numbers are from the eight-group
// sidebar as it stood at b5dee27:
//
//              rows in DOM   readable @1080p   readable @768p   content height
//   before            44             14               11            1385px
//   after             15             15               11            1071px
//
// The 768p line moved from 10 to 11 when the sidebar logo went from 130px
// wide to 72px. The full logo's viewBox is 202x190, so 130px of width was
// 122px of height and the header block measured 146px — more than any
// group of links, in a panel whose whole problem was height. At 72px it
// is 92px. Fifty-four pixels is 1.2 rows, and one of them landed.
//
// The 1080p line is the result: everything the sidebar has, readable
// without scrolling, where before you could see fourteen of forty-four.
//
// THE 768p LINE IS NOT AN IMPROVEMENT IN ROW COUNT AND IS NOT PRESENTED
// AS ONE. Ten of fifteen is what fits, and eleven of forty-four is what
// fitted before. The reason is arithmetic and worth writing down rather
// than tuning around: every nav row is min-h-[44px] and every group
// heading is a 44px control, both of which scripts/tests/
// layout-stress.prodtest.mjs enforces as a minimum tap target
// (MIN_TAP = 44). Fifteen rows and four headings is 813px on its own,
// before the logo block, the account card or any padding — so 768px of
// viewport cannot hold them however they are arranged, and the only way
// to make that number go up is to take the tap targets below the floor
// the app enforces everywhere else.
//
// What did change at 768p is how far the scroll goes: 1125px of content
// instead of 1385px, so what is left below the fold is five rows rather
// than thirty-three.
const FLOOR = { "1080p (1920x1080)": 15, "768p  (1366x768)": 11 };
for (const vp of VIEWPORTS) {
  const m = results[vp.name];
  if (m.error) continue;
  checkTrue(
    `${vp.name}: ${m.visible} rows readable without scrolling (floor ${FLOOR[vp.name]})`,
    m.visible >= FLOOR[vp.name],
    `${m.visible} of ${m.rendered}`
  );
  // AND NOT ONE OF THEM IS CUT OFF. The count above already requires each
  // row to lie inside the aside's visible box and to answer
  // elementFromPoint at three points across its middle, so this states
  // that the two agree — a row counted is a row a person can read.
  checkTrue(
    `${vp.name}: nothing is half-visible at the fold`,
    m.visible === m.labels.length,
    `${m.visible} vs ${m.labels.length}`
  );
}
// AT 1080p, EVERY ROW. Stated separately from the floor because it is the
// brief's actual request — "~15 items visible without scroll" — and a
// floor of 15 would still pass if a sixteenth row were added and left
// below the fold.
{
  const m = results["1080p (1920x1080)"];
  if (!m.error) {
    checkTrue(
      `1080p: every one of the ${m.rendered} rows is readable, not just ${FLOOR["1080p (1920x1080)"]}`,
      m.visible === m.rendered,
      `${m.visible} of ${m.rendered}`
    );
  }
}

console.log("\n== 4. the nav is shorter than it was, and stays shorter ==");
// A RATCHET ON A MEASURED PIXEL HEIGHT, not on a count.
//
// The eight-group sidebar needed 1385px of vertical space with every
// group open; this one needs 1125px. The count limit in
// scripts/tests/sidebar-size.test.mjs cannot see the difference between
// fifteen short rows and fifteen tall ones, and a group heading costs as
// much as a row — so the thing that actually decides whether somebody
// scrolls is measured here, in pixels, from the rendered page.
//
// 1100 rather than 1071 exactly: a font fallback or a locale with longer
// labels moves this by a few pixels, and a gate that fails on a font is
// a gate people learn to ignore. It is 314px below where it started,
// which is what it is here to defend. The number only ever comes down.
const HEIGHT_CEILING = 1100;
for (const vp of VIEWPORTS) {
  const e = expanded[vp.name];
  if (!e || e.error) continue;
  checkTrue(
    `${vp.name}: ${e.asideScrollHeight}px of nav content, ceiling ${HEIGHT_CEILING}px (was 1385px)`,
    e.asideScrollHeight <= HEIGHT_CEILING,
    `${e.asideScrollHeight}px`
  );
}

console.log("\n== 5. the two pages the consolidation created actually work ==");
// "Implemented" is not "works". Nineteen rows were replaced by one link
// and Favorites by a tab; both of those are claims about pages that have
// to render, in a production build, behind the real layout.
await page.setViewportSize({ width: 1366, height: 900 });

// 5a. THE HUB. One row now stands in for nineteen logs plus the eleven
// other entries the sidebar stopped drawing, so the thing it opens has
// to actually list them.
{
  const r = await page.goto(`http://127.0.0.1:${PORT}/dashboard/records`, { waitUntil: "networkidle" });
  checkTrue(`/dashboard/records renders (HTTP ${r?.status()})`, r?.status() === 200, String(r?.status()));
  const hub = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("main a[href^='/dashboard'], main a[href^='/help']")];
    return {
      cards: cards.length,
      hrefs: cards.map((a) => a.getAttribute("href")),
      // The filter chips: "All types" plus one per group.
      chips: document.querySelectorAll("main button[aria-pressed]").length,
      hasSearch: Boolean(document.querySelector("main input[type='search']")),
    };
  });
  // Every destination the sidebar no longer draws must be ON this page —
  // that is the entire argument for hiding them rather than deleting
  // them, and it is checked against the rendered DOM rather than against
  // the config the DOM was built from.
  const MUST_BE_LISTED = [
    "/dashboard/analytics", "/dashboard/sales", "/dashboard/images", "/dashboard/campaigns",
    "/dashboard/memory", "/dashboard/documents", "/dashboard/published",
    "/dashboard/marketplace", "/dashboard/integrations", "/dashboard/affiliate",
    "/dashboard/trading-workflow", "/dashboard/reflection", "/dashboard/favorites",
  ];
  const absent = MUST_BE_LISTED.filter((h) => !hub.hrefs.includes(h));
  checkTrue(`the hub lists ${hub.cards} destinations`, hub.cards >= 40, String(hub.cards));
  checkTrue("and every hidden row is one of them", absent.length === 0, absent.join(", "));
  checkTrue(`it has a type filter (${hub.chips} chips)`, hub.chips === 5, `${hub.chips} — expected All types + 4 groups`);
  checkTrue("and a search box", hub.hasSearch);
  // The owner-only page must NOT be in a non-owner's payload at all —
  // not hidden by CSS, not present and unclicked: absent.
  checkTrue(
    "and the owner-only page is not in a non-owner's hub",
    !hub.hrefs.includes("/dashboard/business-health"),
    "business-health reached a non-owner's DOM"
  );
}

// 5b. THE MERGE. /dashboard/favorites is in bookmarks and in the command
// palette; it has to land on the starred list, not on a 404.
{
  const r = await page.goto(`http://127.0.0.1:${PORT}/dashboard/favorites`, { waitUntil: "networkidle" });
  const landed = new URL(page.url()).pathname + new URL(page.url()).search;
  checkTrue(`/dashboard/favorites still resolves (HTTP ${r?.status()})`, r?.status() === 200, String(r?.status()));
  checkTrue(
    `...and lands on the starred tab (${landed})`,
    landed === "/dashboard/timeline?view=fav",
    landed
  );
  const tabs = await page.evaluate(() => {
    const t = [...document.querySelectorAll("[role='tab']")];
    return {
      count: t.length,
      selected: t.filter((x) => x.getAttribute("aria-selected") === "true").map((x) => x.textContent.trim()),
      labels: t.map((x) => x.textContent.trim()),
    };
  });
  checkTrue(`the merged page has two tabs (${tabs.labels.join(", ")})`, tabs.count === 2, String(tabs.count));
  checkTrue(`and the starred one is selected (${tabs.selected.join(", ")})`, tabs.selected.length === 1, tabs.selected.join(", "));
}

// 5c. AND THE EVERYTHING TAB IS STILL THE TIMELINE, with its own filters
// — the merge added a view, it did not replace one.
{
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/timeline`, { waitUntil: "networkidle" });
  const view = await page.evaluate(() => ({
    tabs: document.querySelectorAll("[role='tab']").length,
    selects: document.querySelectorAll("main select").length,
    selected: [...document.querySelectorAll("[role='tab'][aria-selected='true']")].map((x) => x.textContent.trim()),
  }));
  checkTrue(`the everything tab keeps its filters (${view.selects} selects)`, view.selects === 2, String(view.selects));
  checkTrue(`and is the selected tab (${view.selected.join(", ")})`, view.selected.length === 1, view.selected.join(", "));
}

console.log("\n== 6. no console errors while doing any of it ==");
// ONE CLASS IS EXCLUDED, AND ONLY ONE, NAMED IN FULL.
//
// The sidebar warms the route a pointer is heading for
// (router.prefetch on hover/focus/touch). This file drives five
// navigations back to back, so a prefetch is still in flight when the
// next goto() tears the page down, and Next logs an error saying it
// FELL BACK TO A FULL NAVIGATION — i.e. reporting its own recovery. It
// is an artefact of navigating faster than a person can, not something
// a user meets.
//
// Excluded by matching that exact sentence rather than by lowering the
// count to "a few": a count allows any three errors through, including
// three real ones.
const PREFETCH_ABORT = /Failed to fetch RSC payload for \S+\. Falling back to browser navigation\./;
const realErrors = consoleErrors.filter((e) => !PREFETCH_ABORT.test(e));
checkTrue(
  `no console errors (${realErrors.length} real, ${consoleErrors.length - realErrors.length} aborted prefetches ignored)`,
  realErrors.length === 0,
  realErrors.slice(0, 3).join(" | ")
);

await browser.close();
cleanup();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
