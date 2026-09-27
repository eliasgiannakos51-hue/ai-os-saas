#!/usr/bin/env node
/*
 * DOES A MAKE SCREEN REALLY OPEN READY TO BE TYPED INTO?
 *
 * Run: node scripts/tests/make-as-chat.prodtest.mjs
 *      MAKE_SHOTS=/tmp/shots node scripts/tests/make-as-chat.prodtest.mjs
 *
 * WHAT THIS ADDS TO THE STATIC HALF. make-as-chat.test.mjs reads the
 * source: it finds `autoFocus` in the file and counts what the disabled
 * expression waits on. Neither of those is the question a person has.
 * `autoFocus` in a file is not a cursor in a box — React drops it when
 * the element mounts inside a portal, a parent can steal focus in an
 * effect, and an element rendered behind a conditional does not focus
 * anything at all. So this asks the PAINTED page:
 *
 *   1. the page opens signed in, at the address asked for — not the
 *      login screen, not onboarding, not an upgrade wall;
 *   2. document.activeElement IS the prompt field;
 *   3. the primary button is DISABLED on arrival and ENABLED after
 *      typing one sentence, which is the "one input" claim tested as
 *      behaviour rather than as a regex over a `disabled=` attribute;
 *   4. on the phone, that a real finger — Input.dispatchTouchEvent, not
 *      page.tap(), which is a mouse wearing a hat — lands in the box;
 *   5. and a screenshot of each, on each device, for a human to look at.
 *
 * BOTH DEVICES FROM THE START, at 1440x900 and 390x844. A promise that
 * you type one sentence and get a thing is a promise about a phone
 * before it is one about a laptop, and interaction-coverage.test.mjs
 * holds the count of single-viewport drivers as a ratchet that may only
 * fall — so a new one arrives with its phone or it does not arrive.
 *
 * WHAT IT CANNOT SAY, and the report must not either: whether a result
 * comes out. That needs ANTHROPIC_API_KEY, which no gate in this
 * repository has and this container does not carry. "You type and it
 * appears" is verified by a person on the deployed site, and by nothing
 * here.
 *
 * THE ACCOUNT IS ON A PAID PLAN, deliberately, and the slug has to be
 * one billing/plans.ts actually lists: free, starter, growth,
 * professional, ultimate, enterprise. The first run of this file said
 * "pro", which is not one of them; resolvePlanSlug falls back to "free"
 * for anything unrecognized, so every Make screen rendered the upgrade
 * wall and the file reported "autoFocus in the source is not a cursor
 * on the screen" — a true sentence about the wall and a false one about
 * the feature. That is why the wall now gets a check of its own, BEFORE
 * the focus check, and why it looks for the one thing on it that is not
 * translated: a link to /pricing#plan-<slug>.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
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
  user_metadata: { subscription_tier: "ultimate" },
  identities: [],
};

const TABLE_ROWS = {
  user_credits: [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }],
  user_onboarding: [{ user_id: USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null }],
};

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
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
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows);
    }
    json(200, {});
  });
});
const SUPA_PORT = 54337;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));

const PROJECT_REF = "127";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 });
const session = {
  access_token: jwt({ sub: USER.id, aud: "authenticated", role: "authenticated", email: USER.email, iat: nowSec, exp: nowSec + 3600 }),
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
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
};

const SHOT_DIR = process.env.MAKE_SHOTS || "";
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

// THE ROWS THE SIDEBAR DRAWS UNDER MAKE, and what a person types into
// each. The two without a prompt are named rather than skipped: a list
// that quietly covered four of six would report a pattern that is not
// there yet.
const SCREENS = [
  { href: "/dashboard/website-builder", typed: "a one-page site for a coffee shop in Thessaloniki" },
  { href: "/dashboard/presentations", typed: "eight slides about our new pricing" },
  { href: "/dashboard/posts", typed: "a short post about our summer opening hours" },
  { href: "/dashboard/coding", typed: "a function that formats a phone number" },
];
const NO_PROMPT = [
  { href: "/dashboard/documents", why: "no prompt at all — you create an empty document and type into it" },
  { href: "/dashboard/data-analysis", why: "a FILE is the way in; the follow-up question is a one-line input" },
];

let server = null;
let browser = null;
const cleanup = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
};

try {
  console.log("running `next build` (production, not a dev server) ...");
  const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let buildLog = "";
  build.stdout.on("data", (d) => (buildLog += d));
  build.stderr.on("data", (d) => (buildLog += d));
  if ((await new Promise((r) => build.on("close", r))) !== 0) {
    console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
    cleanup();
    process.exit(1);
  }
  console.log("build ok — starting `next start`\n");
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const up = await (async () => {
    for (let i = 0; i < 90; i++) {
      try {
        await new Promise((res, rej) => {
          const r = http.get(`http://127.0.0.1:${PORT}/api/health`, () => res());
          r.on("error", rej);
        });
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    return false;
  })();
  if (!up) {
    console.log("  FAIL  the production server did not start");
    cleanup();
    process.exit(1);
  }

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  // TWO DEVICES, AND THE SECOND ONE IS THE POINT. "One field, you type,
  // it comes out" is a promise about a phone more than a laptop, and the
  // parts of it that can break are device-specific: a field below the
  // fold autofocuses without scrolling to itself, a keyboard covers the
  // button, a drawer overlays the box. interaction-coverage.test.mjs
  // holds both of these counts as ratchets that may only go down, which
  // is the reason this file was written with both from its second run
  // rather than added to a list of fourteen files owing a phone.
  const DEVICES = [
    { name: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ];

  // A REAL FINGER, not page.tap(). Playwright's tap synthesises the same
  // pointer sequence a mouse produces; Input.dispatchTouchEvent is the
  // one the browser treats as a touch, which is what decides whether an
  // overlay, a focus trap or a scroll container swallows it.
  async function touchTapFocused(page) {
    const rect = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      el.scrollIntoView({ block: "center" });
      el.blur();
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 24), w: r.width, h: r.height };
    });
    if (!rect || rect.w === 0) return null;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: rect.x, y: rect.y, radiusX: 8, radiusY: 8, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(150);
    return page.evaluate(() => (document.activeElement || {}).tagName?.toLowerCase() || "(none)");
  }

  for (const device of DEVICES) {
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch });
    await context.addCookies([{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
    const page = await context.newPage();

    console.log(`\n== ${device.name} ${device.viewport.width}x${device.viewport.height}: every drawn Make row opens ready to be typed into ==`);
    for (const screen of SCREENS) {
      const id = `${device.name} ${screen.href}`;
      const url = `http://127.0.0.1:${PORT}${screen.href}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      const landed = new URL(page.url()).pathname;
      check(`${id}: opens signed in, at its own address (${landed})`, landed === screen.href,
        `landed on ${landed} — a login screen, an onboarding redirect or an upgrade wall`);
      if (landed !== screen.href) continue;

      // THE WALL, FIRST. Every check below it describes a workspace, so
      // if a workspace is not what is on the screen they all report the
      // wrong thing. The link is the marker because its href carries a
      // plan slug rather than a translated word.
      const walled = await page.evaluate(() => !!document.querySelector('main a[href^="/pricing#plan-"]'));
      check(`${id}: a paid account sees the workspace, not an upgrade wall`, !walled,
        "the page rendered UpgradeRequired — check the tier slug this file signs in with against billing/plans.ts");
      if (walled) continue;

      // THE CURSOR, NOT THE ATTRIBUTE.
      const focus = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return { tag: "(none)", id: "" };
        return { tag: el.tagName.toLowerCase(), id: el.id || "", type: el.getAttribute("type") || "" };
      });
      check(`${id}: the cursor is already in a text box (${focus.tag}${focus.id ? "#" + focus.id : ""})`,
        focus.tag === "textarea" || (focus.tag === "input" && focus.type === "text"),
        `activeElement is <${focus.tag}> — autoFocus in the source is not a cursor on the screen`);

      // ON A PHONE, THE FINGER. A tap on the box that does not focus it
      // is the failure a person meets and no desktop run can see.
      if (device.touch) {
        const tagAfterTap = await touchTapFocused(page);
        check(`${id}: a finger on the box puts the cursor in it (${tagAfterTap ?? "no box"})`,
          tagAfterTap === "textarea" || tagAfterTap === "input",
          "the tap landed on something else — an overlay, a drawer or a scroll container took it");
      }

      // THE BUTTON, AS BEHAVIOUR. Found by being the one disabled control
      // on arrival rather than by a label, which is translated.
      const before = await page.evaluate(() =>
        [...document.querySelectorAll("main button")].filter((b) => b.disabled).length
      );
      check(`${id}: something is disabled before anything is typed (${before})`, before >= 1,
        "no disabled control — the action is pressable with an empty prompt");

      await page.keyboard.type(screen.typed, { delay: 0 });
      await page.waitForTimeout(250);
      const after = await page.evaluate(() =>
        [...document.querySelectorAll("main button")].filter((b) => b.disabled).length
      );
      check(`${id}: typing one sentence enables it (${before} disabled -> ${after})`, after < before,
        `still ${after} disabled after typing — something other than the text is being waited on`);

      if (SHOT_DIR) {
        const name = screen.href.split("/").pop();
        await page.screenshot({ path: `${SHOT_DIR}/${device.name}-${name}.png`, fullPage: false });
        console.log(`        shot: ${SHOT_DIR}/${device.name}-${name}.png`);
      }
    }

    console.log(`\n== ${device.name}: and the two that have no prompt, named rather than skipped ==`);
    for (const row of NO_PROMPT) {
      const url = `http://127.0.0.1:${PORT}${row.href}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      const landed = new URL(page.url()).pathname;
      check(`${device.name} ${row.href}: opens (${row.why})`, landed === row.href, `landed on ${landed}`);
      if (SHOT_DIR && landed === row.href) {
        const name = row.href.split("/").pop();
        await page.screenshot({ path: `${SHOT_DIR}/${device.name}-${name}.png`, fullPage: false });
        console.log(`        shot: ${SHOT_DIR}/${device.name}-${name}.png`);
      }
    }
    await context.close();
  }

  // THE FLOOR. Six rows on two devices is what a full run covers; a run
  // that navigated nowhere would print no failures at all.
  check(`the run measured every drawn Make row on both devices (${(SCREENS.length + NO_PROMPT.length) * DEVICES.length})`,
    (SCREENS.length + NO_PROMPT.length) * DEVICES.length === 12,
    String((SCREENS.length + NO_PROMPT.length) * DEVICES.length));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log("\nNOT MEASURED HERE: whether a result comes out. That needs a model key,");
console.log("which no gate in this repository has. It is a person's job on the");
console.log("deployed site, and this says nothing about it either way.");
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
