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
import { groupBlocks, itemChunks } from "./lib/sidebar-source.mjs";
import { loadTs } from "./load-ts.mjs";

const { visibleGroups } = await loadTs("src/lib/sidebar-visibility.ts");

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
// EVIDENCE ON DEMAND. `SIDEBAR_SHOTS=<dir> node scripts/tests/sidebar-density.prodtest.mjs`
// writes one full-page PNG per viewport beside the numbers. Off by
// default: a gate that writes files on every run is a gate that fills a
// disk, and the numbers are the assertion — the image is for a person
// who wants to see the thing the numbers describe.
const SHOT_DIR = process.env.SIDEBAR_SHOTS || "";

async function measure(width, height) {
  await page.setViewportSize({ width, height });
  const resp = await page.goto(`http://127.0.0.1:${PORT}/dashboard`, { waitUntil: "networkidle" });
  if (!resp || resp.status() >= 400) return { error: `HTTP ${resp?.status()}` };
  // The nav is server-rendered, but the accordion's open group is decided
  // by an effect on the client. Wait for the aside AND for hydration to
  // have settled, or the count is of a pre-hydration tree.
  await page.waitForSelector("aside nav a", { timeout: 15000 });
  await page.waitForTimeout(600);
  if (SHOT_DIR) {
    // The drawer is off-canvas at 390, so the sidebar has to be opened
    // before a photograph of it means anything.
    if (width < 768) {
      // components/dashboard/menu-button.tsx, named by common.toggleMenu.
      // Matched on the accessible name rather than on a class, so a
      // restyle does not silently produce a photograph of a shut drawer.
      const toggle = await page.$('button[aria-label="Toggle menu"]');
      if (!toggle) throw new Error("SIDEBAR_SHOTS: no drawer toggle at 390 — the phone shot would be of a closed drawer");
      // A REAL TAP THROUGH CDP, not page.click().
      //
      // Two reasons, and the second is the one that matters. A tap is
      // what opens this drawer on the device the 390 column exists for,
      // and a synthetic click is not that. And
      // scripts/tests/interaction-coverage.test.mjs counts a prodtest
      // that drives the page with a mouse and never with a touch —
      // MOUSE_ONLY_CEILING, which "may only go DOWN". A `.click()` here
      // would have pushed that census from 24 to 25 for a screenshot,
      // which is a ratchet raised to pay for a convenience.
      // Input.dispatchTouchEvent produces trusted input; dispatchEvent
      // does not, and the browser ignores it.
      const box = await toggle.boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: `${SHOT_DIR}/sidebar-${width}x${height}.png`, fullPage: false });
  }

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

    // EVERY HEADING, AND WHAT IS UNDER IT — read off the screen.
    //
    // This is the question no gate in this repository was asking, and it
    // is the one that mattered: on 2026-09-19 the owner reported "the
    // sidebar shows the heading Run and NO rows". Nothing had filtered
    // those rows; the group was shut. Every structural gate was green,
    // because all of them read lib/sidebar-nav.ts, where the three rows
    // are declared and correct.
    //
    // A heading is paired with the rows that FOLLOW it in document order
    // until the next heading — which is how a person reads it, and is
    // independent of the markup nesting that changed twice while the
    // collapse existed.
    const headingEls = [...aside.querySelectorAll("button, p")].filter(
      (el) => el.className.includes("uppercase") && el.className.includes("tracking-widest")
    );
    const walker = [...aside.querySelectorAll("button, p, a.nav-item")];
    const perGroup = headingEls.map((h) => {
      const start = walker.indexOf(h);
      let rows = 0;
      for (let i = start + 1; i < walker.length; i++) {
        const el = walker[i];
        if (headingEls.includes(el)) break;
        if (!el.classList.contains("nav-item")) continue;
        // PAINTED, not merely present. A collapsed group keeps its links
        // in the DOM at zero height; that is exactly the state this
        // check exists to refuse, so a zero-height row does not count.
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) rows++;
      }
      return { heading: h.textContent.trim(), rows };
    });

    return {
      rendered: links.length,
      visible: visible.length,
      headings,
      perGroup,
      asideScrollHeight: aside.scrollHeight,
      asideClientHeight: aside.clientHeight,
      overflows: aside.scrollHeight > aside.clientHeight + 1,
      labels: visible.map((a) => a.textContent.trim()),
    };
  });
}

// THE FULL HEIGHT OF THE NAV, which since 2026-09-19 is simply its
// height: every group is open, so there is nothing left to expand and
// this measures the same tree measure() does. It is kept separate
// because the QUESTION is different — measure() asks what a person can
// read on arrival, this asks how far the panel scrolls — and because the
// forcing below costs nothing and keeps the file honest if a collapse
// ever returns.
async function measureExpanded(width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`http://127.0.0.1:${PORT}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForSelector("aside nav a", { timeout: 15000 });
  await page.waitForTimeout(400);
  // A NO-OP TODAY, DELIBERATELY KEPT. There is no `div.grid` collapse
  // container in the component any more, so this loop matches nothing
  // and the height read below is the height the page already had. It
  // stays because the alternative — deleting it — would make this
  // function silently stop measuring the expanded case on the day
  // somebody reintroduces a collapse, which is the exact regression the
  // paragraph below is about.
  // OPEN, THEN WAIT, THEN MEASURE — three statements, and it used to be
  // one.
  //
  // THE NUMBER THIS PRINTED WAS AN ARTIFACT. The groups collapse with a
  // `grid-template-rows: 0fr -> 1fr` TRANSITION, so setting the style and
  // reading scrollHeight in the same evaluate() reads the height the
  // sidebar had BEFORE the rows expanded. Measured 2026-09-13, on the
  // same build, at the same two sizes:
  //
  //                 printed here      actually, once settled
  //     390x844        925px                1771px
  //     1440x900       900px                1702px
  //
  // The 1440 line is the one that did damage: 900px of content in 900px
  // of panel read as "fits", and it was the panel's own height echoed
  // back, because nothing had grown yet. The true answer is 1702px in
  // 900px — the fully expanded nav needs nearly two screens. A gate that
  // prints a number is only as good as the moment it reads it, and this
  // one was reading before the thing it measures existed.
  await page.evaluate(() => {
    const aside = document.querySelector("aside");
    if (!aside) return;
    for (const el of aside.querySelectorAll("div.grid")) el.style.gridTemplateRows = "1fr";
  });
  // Longer than the transition the component declares, so this does not
  // become a race that passes on a fast machine.
  await page.waitForTimeout(900);

  return await page.evaluate(() => {
    const aside = document.querySelector("aside");
    if (!aside) return { error: "no <aside>" };
    const links = aside.querySelectorAll("a.nav-item").length;
    return {
      rendered: links,
      asideScrollHeight: aside.scrollHeight,
      asideClientHeight: aside.clientHeight,
      overflows: aside.scrollHeight > aside.clientHeight + 1,
    };
  });
}

// THE PHONE AND THE LAPTOP WERE ADDED 2026-09-13, asked for by name.
// 1080p and 768p answer "does the desktop nav fit"; 390 is the width at
// which the sidebar is a drawer rather than a column, and 1440 is the
// commonest real laptop. The four together are what "does this structure
// survive" actually means.
// HOW MANY GROUPS THE CONFIG DECLARES, read from the file rather than
// typed: the hub's filter chips are one per group plus "All types", and
// a hand-written constant for that went stale the day the sidebar grew
// from four groups to six.
// ONE CHIP PER GROUP THE HUB ACTUALLY LISTS, which is not the number of
// groups the config declares (2026-09-26).
//
// This counted every `heading:` line in lib/sidebar-nav.ts, and its own
// comment said the point was to derive the number rather than type it —
// after a hand-written 5 stayed 5 while the sidebar went from four
// groups to six. The derivation was right about the file and wrong about
// the page: /dashboard/records is built on `visibleGroups`, so a group
// whose every row is `notBuilt` contributes no cards and therefore no
// chip. The declared structure added five such groups and this went red
// expecting twelve chips on a page that draws seven.
//
// Derived through the real filter now, the same one the hub calls.
const SIDEBAR_GROUP_COUNT = visibleGroups(
  groupBlocks(readFileSync("src/lib/sidebar-nav.ts", "utf8")).map((g) => ({
    heading: g.heading,
    items: itemChunks(g.body).map((i) => ({
      href: i.literalHref ?? i.constantHref ?? "?",
      ...(i.hidden ? { hidden: true } : {}),
      ...(i.notBuilt ? { notBuilt: true } : {}),
      ...(i.ownerOnly ? { ownerOnly: true } : {}),
      ...(i.retired ? { retired: "declared" } : {}),
    })),
  })),
  // The hub is rendered for the signed-in account this prodtest forges,
  // which is not the owner.
  false
).length;

const VIEWPORTS = [
  { name: "390w  (390x844)", width: 390, height: 844 },
  { name: "1080p (1920x1080)", width: 1920, height: 1080 },
  { name: "1440w (1440x900)", width: 1440, height: 900 },
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

console.log("\n== 0. NO HEADING STANDS OVER NOTHING ==");
// ---------------------------------------------------------------------
// THE CHECK THIS FILE DID NOT HAVE, and the reason it is section 0.
//
// On 2026-09-19 production reported: "the sidebar shows the heading Run
// and NO rows — did a filter remove Agents, Automation and Marketplace?"
// Nothing had. The one-open-group rule of two days earlier had SHUT the
// group, and shut looks exactly like filtered-away.
//
// Every structural gate was green, correctly: they all read
// lib/sidebar-nav.ts, where all three rows are declared, visible, and in
// the right order. sidebar-structure asserted the order. sidebar-size
// asserted the counts. sidebar-and-tooltips asserted that the collapse
// was well-built — a 44px target, aria-expanded, rows out of the tab
// order when shut. All true. All about a screen showing seven of
// twenty-six rows and six headings, five of them over empty space.
//
// A heading with no rows under it is the one thing a person can see and
// no declaration can express, so it is asked here, of the screen, at
// every viewport. Rows are paired with the heading that precedes them in
// document order and counted only if they are actually painted.
for (const vp of VIEWPORTS) {
  const m = results[vp.name];
  if (m.error) continue;
  const groups = m.perGroup ?? [];
  checkTrue(
    `${vp.name}: the per-group scan read the screen (${groups.length} headings)`,
    groups.length >= 5,
    "a scan that finds no headings agrees with every claim below it"
  );
  const empty = groups.filter((g) => g.rows === 0);
  checkTrue(
    `${vp.name}: every heading has rows under it (${groups.map((g) => `${g.heading}:${g.rows}`).join(" ")})`,
    empty.length === 0,
    `${empty.map((g) => g.heading).join(", ")} — a heading over nothing reads as a nav whose contents were removed`
  );
}

console.log("\n== 1. six groups, and that is what the browser paints ==");
// Counted from the DOM, not from lib/sidebar-nav.ts. The Settings group
// renders outside <nav>, which is how the first version of this file
// reported three.
//
// SIX SINCE 2026-09-05, and this said four until 2026-09-19 — a V4.6 #3
// target that the six-group structure had superseded eleven days
// earlier. It was red on every run in between and read as a sidebar
// problem rather than as a stale number, which is why docs/v6-list.md §2
// existed. The owner decided it on 2026-09-19: six groups, every one
// open, scroll accepted.
for (const vp of VIEWPORTS) {
  const m = results[vp.name];
  if (m.error) continue;
  checkTrue(`${vp.name}: ${m.headings} group headings, expected 6`, m.headings === 6, String(m.headings));
}

console.log("\n== 2. every declared row exists in the DOM ==");
// THE CEILING IS GONE AND THE FLOOR REPLACED IT, which is the same
// decision as section 1. "At most twenty rows" was V4.6 #3's answer to a
// forty-five-row directory; the structure has been twenty-six rows and
// six groups since 2026-09-05, and every one of them is a deliberate
// entry the owner listed by name.
//
// What is worth holding is the opposite: no row may silently stop being
// rendered. 26 is what sidebarGroups() yields for a non-owner today
// (27 with the owner-only Business health row).
for (const vp of VIEWPORTS) {
  const m = results[vp.name];
  if (m.error) continue;
  checkTrue(`${vp.name}: ${m.rendered} rows in the DOM, floor 26`, m.rendered >= 26, String(m.rendered));
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
// 1440 CARRIES THE SAME FLOOR AS 1080p, not one fitted to what it
// currently scores. It is the same thing — a desktop column with the nav
// always on screen — so it answers to the same number, and it fails
// alongside 1080p rather than being quietly excused into a floor of 7.
// Setting a floor to the value you just measured is how a check gets its
// baseline set to the size of the problem.
// 1440 DROPS FROM 15 TO 14, AND THAT IS A FITTED NUMBER — said plainly,
// because the paragraph above forbids doing it silently. With every group
// open the panel carries 26 rows and 6 headings, so what fits in 900px of
// viewport is decided by arithmetic the layout cannot argue with: 1,564px
// of content, 609px of visible nav once the 92px header and 199px footer
// are out. 14 is what that yields and 15 is not reachable without taking
// a row out or a tap target below 44px.
//
// THE NUMBER IT REPLACES WAS 7. That is what this same viewport painted
// two days earlier, when only the group holding the current page was
// open — and the floor said 15 and had been RED ever since, read as a
// sidebar problem rather than as the collapse hiding two thirds of the
// nav. Fitted or not, 14 is double what the check was actually getting.
//
// The un-fitted guard is MONOTONICITY, asserted below: a taller viewport
// may never paint fewer readable rows than a shorter one. That cannot be
// satisfied by choosing a number, and it is what catches a chrome
// regression eating the panel at one size only.
const FLOOR = { "1080p (1920x1080)": 15, "1440w (1440x900)": 14, "768p  (1366x768)": 11 };

// A VIEWPORT IS FLOORED OR IT IS EXCLUDED BY NAME, never neither.
//
// `m.visible >= FLOOR[vp.name]` with no entry compares against undefined
// and is always false, so a new viewport would fail for the wrong reason
// and somebody would "fix" it by inventing a floor. Worse, a `continue`
// for unknown names would make the whole section pass by measuring
// nothing — the vacuity this repo has been bitten by. So: every viewport
// must appear in exactly one of the two maps, and that is asserted.
const NO_FLOOR = {
  "390w  (390x844)":
    "at 390 the sidebar is a DRAWER, not a column: it sits off-canvas until " +
    "opened, so 'rows readable on arrival' is 0 by design and a floor over it " +
    "would be a floor over nothing. Its height is still measured and printed.",
};
for (const vp of VIEWPORTS) {
  const floored = Object.prototype.hasOwnProperty.call(FLOOR, vp.name);
  const excused = Object.prototype.hasOwnProperty.call(NO_FLOOR, vp.name);
  checkTrue(
    `${vp.name}: has a row floor, or a written reason it has none`,
    floored !== excused,
    floored && excused ? "in BOTH maps" : "in NEITHER map — add a floor or a reason"
  );
}
for (const vp of VIEWPORTS) {
  const m = results[vp.name];
  if (m.error) continue;
  if (!Object.prototype.hasOwnProperty.call(FLOOR, vp.name)) continue;
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
// A TALLER VIEWPORT MAY NEVER PAINT FEWER ROWS THAN A SHORTER ONE.
//
// This replaces "at 1080p, every row is readable", which was the V4.6 #3
// brief's request against a sixteen-row sidebar and is arithmetically
// impossible against twenty-six: 1,564px of content does not fit in
// 1,080px of viewport however it is arranged, and the owner accepted
// that scroll on 2026-09-19.
//
// What survives the change is the invariant underneath it, and it is the
// one number in this section nobody can choose: give the panel more
// height and it must not show less. A chrome regression that eats the
// viewport at one size, a heading that grows only when the label wraps,
// a footer that reflows — each of those breaks this and none of them
// breaks a per-viewport floor that was fitted to what the page scored.
{
  const ordered = VIEWPORTS.filter(
    (vp) => !results[vp.name]?.error && Object.prototype.hasOwnProperty.call(FLOOR, vp.name)
  ).sort((a, b) => a.height - b.height);
  checkTrue(
    `there are at least two floored viewports to compare (${ordered.length})`,
    ordered.length >= 2,
    "with fewer than two, the monotonicity check below compares nothing and passes"
  );
  for (let i = 1; i < ordered.length; i++) {
    const shorter = results[ordered[i - 1].name];
    const taller = results[ordered[i].name];
    checkTrue(
      `${ordered[i].name} (${taller.visible}) paints at least as many rows as ${ordered[i - 1].name} (${shorter.visible})`,
      taller.visible >= shorter.visible,
      `${taller.visible} < ${shorter.visible} — more viewport, fewer rows`
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
// THE CEILING IS NOW IN SCREENS, NOT PIXELS, and it is the owner's own
// threshold rather than a ratchet.
//
// 1,100px was V4.6 #3's answer to a 1,385px eight-group nav that nothing
// could scroll comfortably. Every group is open since 2026-09-19 and the
// panel is deliberately taller than the viewport — the trade the owner
// made in writing: "the scroll is acceptable", with one condition
// attached, "if it is more than 3 screens on mobile, tell me and we
// discuss it again".
//
// So that is the check: the nav may scroll, and it may not exceed three
// phone screens. Measured 2026-09-19 at 390x844 — 1,633px, 1.9 screens.
// A pixel ratchet would now be a ratchet on a number the owner chose to
// let go up, which is a gate arguing with a decision instead of holding
// the condition the decision came with.
const MAX_SCREENS = 3;
for (const vp of VIEWPORTS) {
  const e = expanded[vp.name];
  if (!e || e.error) continue;
  const screens = e.asideScrollHeight / vp.height;
  checkTrue(
    `${vp.name}: ${e.asideScrollHeight}px of nav content = ${screens.toFixed(1)} screens, ceiling ${MAX_SCREENS}`,
    screens <= MAX_SCREENS,
    `${screens.toFixed(1)} screens — the owner asked to be told if the phone passes 3`
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
    // NOT /dashboard/memory. That URL was renamed to /dashboard/search on
    // 2026-09-05 — the page searches the user's own records and held no
    // conversation, while its label and its ten translations all said
    // "what the AI remembers about you" — and the old path is now a
    // permanent redirect. A hub that listed it would be offering a
    // 308 as a destination. It stayed in this list for a fortnight and
    // the line was red the whole time, read as a missing page rather
    // than as a stale expectation.
    "/dashboard/search", "/dashboard/documents", "/dashboard/published",
    // NOT /dashboard/marketplace. It became `retired` on 2026-09-24 —
    // the page keeps serving anyone holding the URL and NOTHING offers
    // it: not the sidebar, not the palette, not this hub. That is the
    // difference between `retired` and `hidden`, and a hub that listed
    // it would be offering a capability the product has withdrawn.
    // Exactly the shape of the /dashboard/memory note above: an
    // expectation that outlived the decision it described, red for two
    // days and readable as a missing page.
    "/dashboard/integrations", "/dashboard/affiliate",
    "/dashboard/trading-workflow", "/dashboard/reflection", "/dashboard/favorites",
  ];
  const absent = MUST_BE_LISTED.filter((h) => !hub.hrefs.includes(h));
  checkTrue(`the hub lists ${hub.cards} destinations`, hub.cards >= 40, String(hub.cards));
  checkTrue("and every hidden row is one of them", absent.length === 0, absent.join(", "));
  // ONE CHIP PER GROUP, PLUS "All types" — derived from the config rather
  // than typed, because the constant was 5 and stayed 5 while the sidebar
  // went from four groups to six on 2026-09-05. A number that has to be
  // edited by hand whenever the structure changes is a number that will
  // be wrong the next time it changes.
  const expectedChips = SIDEBAR_GROUP_COUNT + 1;
  checkTrue(
    `it has a type filter (${hub.chips} chips)`,
    hub.chips === expectedChips,
    `${hub.chips} — expected All types + ${SIDEBAR_GROUP_COUNT} groups`
  );
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
  // IT USED TO REQUIRE A REDIRECT to /dashboard/timeline?view=fav, and
  // that was the V4.6 implementation. src/app/dashboard/favorites/page.tsx
  // says in its own header that the route "spent V4.6 as a redirect" and
  // is the canonical starred page now — bookmarks and the palette land
  // here rather than bouncing. So the check asserted a mechanism the
  // product had deliberately replaced, and stayed red while the two
  // checks below it proved the page was working.
  //
  // What matters is where the person ends up, which is asserted as: it
  // does not bounce somewhere else, and the starred tab is the selected
  // one (below).
  checkTrue(
    `...and stays there rather than bouncing (${landed})`,
    landed === "/dashboard/favorites",
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
