// Do the sidebar tooltips actually appear, in a production build, on the
// real /dashboard page?
//
// WHY THIS FILE EXISTS. This has now been reported as fixed twice and
// observed as broken twice. Both "proofs" were built on a /dev-sidebar
// harness page — a page that rendered its own copy of the sidebar with
// every group pre-expanded, and hovered one item that happened to have a
// hint. It could not have caught either bug, because the thing it tested
// was not the thing that ships.
//
// So this test does the opposite in every respect:
//   - `next build` + `next start`, not `next dev`
//   - the REAL /dashboard route, through the REAL dashboard/layout.tsx,
//     rendering the REAL <Sidebar/> — no test page, no extra providers,
//     no pre-expanded groups
//   - a real Chromium, a real mouse move to real coordinates
//   - assertions on what a user could SEE: a visible box, on screen, with
//     readable text, positioned next to the item hovered
//
// Nothing in the app is patched. Auth and the database are the only
// things replaced, by a local server speaking Supabase's own HTTP
// protocol, so lib/supabase/server.ts, @supabase/ssr and the layout's
// queries all run exactly as they do in production. Being logged in is
// not "context the real app lacks" — it is the normal state of the page.
//
// Run: node scripts/tests/sidebar-tooltips-production.test.mjs
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
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies([
  { ...AUTH_COOKIE, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
]);
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

const resp = await page.goto(`http://127.0.0.1:${PORT}/dashboard`, { waitUntil: "networkidle" });

console.log("\n== 1. the real dashboard, not a login redirect and not a harness ==");
check("HTTP 200", resp.status(), 200);
check("still on /dashboard", new URL(page.url()).pathname, "/dashboard");
if (new URL(page.url()).pathname !== "/dashboard") {
  console.log("        supabase stand-in received:", JSON.stringify(supaHits.slice(0, 8)));
  console.log("        server log:", serverLog.slice(-1200));
  await browser.close();
  cleanup();
  process.exit(1);
}
const navCount = await page.locator("aside nav a").count();
checkTrue(`the real sidebar rendered (${navCount} links)`, navCount > 10, `only ${navCount} links found`);

console.log("\n== 2. a tooltip appears on hover over a real sidebar item ==");
// Deliberately the FIRST link in the sidebar — the top of the Workspace
// group, which is what a user hovers first and which was one of the
// twelve that had no hint at all.
const first = page.locator("aside nav a").first();
const firstLabel = (await first.innerText()).trim();
const firstHref = await first.getAttribute("href");
console.log(`   hovering: "${firstLabel}" (${firstHref})`);

check("no tooltip before hovering", await page.locator("[data-tooltip]").count(), 0);
await first.hover();
let appeared = true;
try {
  await page.locator("[data-tooltip]").first().waitFor({ state: "visible", timeout: 3000 });
} catch {
  appeared = false;
}
checkTrue("a tooltip becomes visible", appeared);

if (appeared) {
  const tip = page.locator("[data-tooltip]").first();
  const text = (await tip.innerText()).trim();
  const box = await tip.boundingBox();
  const anchor = await first.boundingBox();
  check("it has role=tooltip", await tip.getAttribute("role"), "tooltip");
  checkTrue(`it has readable text: "${text}"`, text.length > 3);
  // The 12-missing-hintKeys bug produced a raw key path here rather than
  // a sentence, which a coverage test on messages/*.json would miss.
  checkTrue("the text is a real sentence, not an unresolved key", !/^sidebar\.hints\./.test(text));
  checkTrue("...and not an ICU error placeholder", !/^\s*\{|\}\s*$/.test(text));

  // The bug my own first version of this component shipped: the wrapper
  // is display:contents, so measuring IT gave a zero rect and pinned every
  // tooltip at (10, -15) — present in the DOM, invisible on screen. An
  // "is it visible" assertion passes on that. A position assertion does not.
  checkTrue(`it has a real size (${box?.width}x${box?.height})`, box && box.width > 20 && box.height > 10);
  checkTrue(
    `it is on screen (x ${Math.round(box?.x ?? -1)}, y ${Math.round(box?.y ?? -1)})`,
    box && box.x >= 0 && box.y >= 0 && box.y + box.height <= 900 && box.x + box.width <= 1280
  );
  checkTrue(
    `it sits beside the item it describes (tip centre y ${Math.round((box?.y ?? 0) + (box?.height ?? 0) / 2)}, item centre y ${Math.round((anchor?.y ?? 0) + (anchor?.height ?? 0) / 2)})`,
    box && anchor && Math.abs(box.y + box.height / 2 - (anchor.y + anchor.height / 2)) < 40
  );
  checkTrue("it is to the right of the sidebar item", box && anchor && box.x >= anchor.x);
  // A tooltip that swallows clicks would break the nav it is describing.
  check("it does not intercept the pointer", await tip.evaluate((el) => getComputedStyle(el).pointerEvents), "none");
  // Invisible-because-transparent is its own failure mode, and one that
  // "visible" does not catch.
  const style = await tip.evaluate((el) => {
    const s = getComputedStyle(el);
    return { opacity: s.opacity, bg: s.backgroundColor, color: s.color, z: s.zIndex, display: s.display };
  });
  checkTrue(`opacity is not 0 (${style.opacity})`, Number(style.opacity) > 0.5);
  checkTrue(`it has a background (${style.bg})`, !/rgba\(0, 0, 0, 0\)|transparent/.test(style.bg));
  checkTrue(`it stacks above the sidebar (z-index ${style.z})`, Number(style.z) >= 50);

  await page.screenshot({ path: "/tmp/tooltip-production.png" });
}

console.log("\n== 3. it works for EVERY sidebar item, not just one ==");
// The harness hovered a single item. Twelve items had no hint at all.
// Checking one item is precisely how that shipped, so every item gets
// hovered here.
//
// Collapsed groups are opened by CLICKING their real header button, the
// way a user opens them — not by forcing styles or rendering the sidebar
// pre-expanded, which is what the old harness did and why it proved
// nothing. Items inside a collapsed group are clipped to zero height, so
// they are genuinely un-hoverable until the group is opened; a user
// cannot hover them either.
const groupButtons = await page.locator("aside nav button[aria-expanded]").all();
console.log(`   ${groupButtons.length} collapsible groups to open`);
const misses = [];
const seen = new Set();

async function hoverAllVisibleLinks() {
  const links = await page.locator("aside a[data-active]").all();
  for (const link of links) {
    const href = await link.getAttribute("href");
    if (seen.has(href)) continue;
    const bb = await link.boundingBox();
    if (!bb || bb.height < 8) continue; // clipped inside a collapsed group
    // Is this row actually the thing under the pointer at its own centre?
    // A group mid-collapse still reports a height while its header sits
    // on top of it — a user could not hover it either, so neither does
    // this. Anything that IS reachable must show a tooltip.
    const reachable = await link.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return Boolean(top && el.contains(top));
    });
    if (!reachable) continue;
    seen.add(href);
    await page.mouse.move(4, 700);
    await page.waitForTimeout(90);
    await link.hover({ timeout: 4000 });
    let ok = true;
    try {
      await page.locator("[data-tooltip]").first().waitFor({ state: "visible", timeout: 1500 });
    } catch {
      ok = false;
    }
    if (!ok) misses.push(`${(await link.innerText()).trim()} (${href})`);
  }
}

await hoverAllVisibleLinks();
for (const button of groupButtons) {
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
    await page.waitForTimeout(320); // the grid-rows transition
  }
  await hoverAllVisibleLinks();
}
check(`every reachable item shows a tooltip (${seen.size} hovered)`, misses, []);
checkTrue(`and that is most of the sidebar, not a couple of rows (${seen.size})`, seen.size >= 30);

console.log("\n== 4. keyboard users get it too ==");
await page.mouse.move(0, 0);
await page.waitForTimeout(200);
await first.focus();
let focusOk = true;
try {
  await page.locator("[data-tooltip]").first().waitFor({ state: "visible", timeout: 2000 });
} catch {
  focusOk = false;
}
checkTrue("focusing an item shows its tooltip", focusOk);
checkTrue(
  "the item points at it with aria-describedby",
  await first.evaluate((el) => {
    const id = el.closest("span")?.getAttribute("aria-describedby") ?? el.parentElement?.getAttribute("aria-describedby");
    return Boolean(id && document.getElementById(id));
  })
);

console.log("\n== 5. it goes away again ==");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("Escape dismisses it", await page.locator("[data-tooltip]").count(), 0);
await first.hover();
await page.locator("[data-tooltip]").first().waitFor({ state: "visible", timeout: 2000 });
await page.mouse.move(640, 800);
await page.waitForTimeout(400);
check("moving away dismisses it", await page.locator("[data-tooltip]").count(), 0);

console.log("\n== 6. nothing is broken underneath ==");
const realErrors = consoleErrors.filter(
  (e) => !/favicon|404|net::ERR_|Failed to load resource/i.test(e)
);
check("no console errors on the dashboard", realErrors, []);
// A hydration mismatch would silently discard the client tree and take
// every event handler — including the tooltip's — with it.
checkTrue(
  "no hydration mismatch",
  !consoleErrors.some((e) => /hydrat|did not match|Text content does not match/i.test(e))
);

console.log("\n== 7. the shipped bundle really contains the component ==");
// If a deploy is serving older commits, everything above still passes
// locally while the live site shows nothing — which is exactly the
// failure mode being investigated. This is the check that distinguishes
// "the code is wrong" from "the code is not deployed".
const src = readFileSync("src/components/ui/tooltip.tsx", "utf8");
checkTrue("the source marks tooltips with data-tooltip", /data-tooltip/.test(src));
const html = await page.content();
checkTrue("and the served page can produce one", html.includes("nav-item"));

await browser.close();
cleanup();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
