/*
 * THE DESIGN THE OWNER APPROVED, IN THE BUILT APP, IN GREEK.
 *
 * Run: node scripts/tests/design-home.prodtest.mjs
 *      SKIP_BUILD=1 DESIGN_SHOTS=/tmp/shots node scripts/tests/design-home.prodtest.mjs
 *
 * The owner said OK to the "Ionexa Home" mockup on 2026-10-02 and named two
 * things in particular: the Greek typeface, and the routing line — with the
 * condition that the router be measured first (scripts/router-accuracy.mjs:
 * when it names a page, 30 of 30 were right). This asks the running page,
 * a production build on both a desktop and a phone driven by real touch:
 *
 *   1. THE TYPEFACE. The body is set in Commissioner and the face is
 *      LOADED for Greek — document.fonts.check with Greek letters, not
 *      the CSS string, because a font-family that names a face the browser
 *      never fetched renders in the fallback and reads the same in a
 *      stylesheet.
 *   2. THE RAIL. New and All tools, and none of the old six headings.
 *   3. THE ROUTING LINE. "φτιάξε site για καφετέρια" shows "Θα ανοίξει →
 *      Φτιάξε site" with a price, BEFORE anything is sent; a sentence that
 *      names no tool says Ionexa will read it; "αλλαγή" opens ⌘K; and
 *      nothing reaches /api/create while typing.
 *   4. ALL TOOLS. Every card has a name and a one-line hint, and the grid
 *      fits a 390px screen.
 *   5. RECENT. A tool opened from All tools appears under Recent in the
 *      rail afterwards.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with Input.dispatchTouchEvent.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

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

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54353,
  tableRows: { user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }] },
});

const PORT = await new Promise((resolve) => {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const ORIGIN = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  NEXT_PUBLIC_SITE_URL: ORIGIN,
};

// The words a Greek reader sees, read from the shipped messages, so a
// rewording moves the needles rather than breaking them.
const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const W = {
  goingTo: el.dashboard.goal.goingTo,
  routeAsk: el.dashboard.goal.routeAsk,
  change: el.dashboard.goal.routeChange,
  websiteBuilder: el.sidebar.items.websiteBuilder,
  railNew: el.sidebar.rail.new,
  railAll: el.sidebar.rail.allTools,
  railRecent: el.sidebar.rail.recent,
  posts: el.sidebar.items.posts,
  oldHeadings: ["make", "ask", "run", "see", "organise"].map((k) => el.sidebar.groups[k]),
  menu: el.common.toggleMenu,
  palette: el.common.jumpToPage,
};

const SHOT_DIR = process.env.DESIGN_SHOTS || "";
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

let server = null;
let browser = null;
const cleanup = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
};

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production) ...");
    const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + log.slice(-3000));
      cleanup();
      process.exit(1);
    }
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${ORIGIN}/api/health`, () => res()); r.on("error", rej); });
      up = true;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  if (!up) { console.log("  FAIL  the production server did not start"); cleanup(); process.exit(1); }

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  const DEVICES = [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ];

  for (const device of DEVICES) {
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const context = await browser.newContext({
      viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, deviceScaleFactor: device.touch ? 3 : 1,
    });
    await context.addCookies([
      { ...supa.authCookie, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: "el", domain: "127.0.0.1", path: "/" },
    ]);
    const page = await context.newPage();
    const cdp = device.touch ? await context.newCDPSession(page) : null;
    const creates = [];
    await page.route("**/api/create", (r) => {
      creates.push(r.request().postData() || "");
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, type: "answer", answer: "ok" }) });
    });

    // A real finger on the phone, a mouse on the desktop.
    async function press(locator) {
      await locator.scrollIntoViewIfNeeded();
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    // The rail on a phone lives in the drawer behind the menu button.
    async function openRail() {
      if (!cdp) return;
      await press(page.getByRole("button", { name: W.menu }).first());
      await page.waitForTimeout(400);
    }
    const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${name}.png` });

    await page.goto(`${ORIGIN}/dashboard/overview`, { waitUntil: "networkidle" });

    // ---- 1. the typeface
    const font = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        family: getComputedStyle(document.body).fontFamily,
        greek: document.fonts.check('400 16px "Commissioner"', "Αβγδ ωραία"),
        loaded: [...document.fonts].filter((f) => f.family.replace(/"/g, "") === "Commissioner" && f.status === "loaded").length,
      };
    });
    check("the body is set in Commissioner", /^"?Commissioner"?/.test(font.family), font.family);
    check("...and a Commissioner face is actually LOADED, not only named", font.loaded >= 1, `${font.loaded} loaded faces`);
    check("...and it covers Greek text", font.greek === true);

    // ---- 2. the rail
    await openRail();
    const aside = page.locator("aside").first();
    // textContent, not innerText: the headings are CSS-uppercased, and
    // Greek uppercase drops the accent — "Πρόσφατα" paints as "ΠΡΟΣΦΑΤΑ".
    const railText = await aside.evaluate((n) => n.textContent ?? "");
    check("the rail offers New", railText.includes(W.railNew), railText.slice(0, 200));
    check("...and All tools", railText.includes(W.railAll));
    const headings = await aside.locator("p.uppercase").evaluateAll((ps) => ps.map((p) => (p.textContent ?? "").trim()));
    const oldShown = W.oldHeadings.filter((h) => headings.includes(h));
    check(`the rail's headings were read (${headings.join(" · ")})`, headings.length >= 1);
    check("...and none of them is an old group heading", oldShown.length === 0, oldShown.join(", "));
    await shot("1-rail");
    if (cdp) { await page.keyboard.press("Escape"); await page.goto(`${ORIGIN}/dashboard/overview`, { waitUntil: "networkidle" }); }

    // ---- 3. the routing line
    const field = page.locator("textarea").first();
    await press(field);
    await field.fill("");
    await page.keyboard.type("φτιάξε site για την καφετέρια μου", { delay: 5 });
    const line = page.locator(".route-line");
    await line.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    const lineText = (await line.count()) ? await line.innerText() : "";
    check("typing a site request shows the routing line", lineText.includes(W.goingTo), lineText);
    check("...naming the Website Builder", lineText.includes(W.websiteBuilder), lineText);
    check("...with what it will cost there", /\d/.test(lineText), lineText);
    check("...and the line says website in its data too", (await line.getAttribute("data-route").catch(() => null)) === "website");
    await shot("2-route-website");

    await field.fill("");
    await page.keyboard.type("πόσα ξόδεψα τον Σεπτέμβριο;", { delay: 5 });
    await page.waitForTimeout(200);
    const askText = (await line.count()) ? await line.innerText() : "";
    check("a sentence that names no tool says Ionexa will read it", askText.includes(W.routeAsk), askText);
    check("nothing was sent while typing — /api/create was not called", creates.length === 0, `${creates.length} calls`);

    // Tolerant on purpose: with the line gone there is no button, and a
    // timeout here would end the run before RECENT is measured at all —
    // a crash where a named failure belongs.
    const changeButton = line.getByRole("button", { name: W.change, exact: true });
    let paletteOpen = false;
    if ((await changeButton.count()) > 0) {
      await press(changeButton);
      paletteOpen = await page.getByPlaceholder(W.palette).waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false);
    }
    check("\"αλλαγή\" opens the ⌘K palette", paletteOpen);
    await shot("3-change-opens-palette");
    await page.keyboard.press("Escape");

    // ---- 4. all tools
    await page.goto(`${ORIGIN}/dashboard/tools`, { waitUntil: "networkidle" });
    const cards = page.locator("a.tool-card");
    const n = await cards.count();
    const cardInfo = await cards.evaluateAll((els) => els.map((a) => ({ text: a.innerText.trim(), lines: a.innerText.trim().split("\n").filter(Boolean).length })));
    check(`All tools draws the tool list (${n} cards)`, n >= 20);
    check("...and every card has a name AND a one-line hint", cardInfo.every((c) => c.lines >= 2), cardInfo.filter((c) => c.lines < 2).map((c) => c.text).join(" | "));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("...and the page does not scroll sideways", overflow <= 1, `${overflow}px`);
    await shot("4-all-tools");

    // ---- 5. recent
    const postsCard = cards.filter({ hasText: W.posts }).first();
    if ((await postsCard.count()) > 0) await press(postsCard);
    await page.waitForURL(/\/dashboard\/posts/, { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    await page.goto(`${ORIGIN}/dashboard/overview`, { waitUntil: "networkidle" });
    await openRail();
    const railAfter = await page.locator("aside").first().evaluate((n) => n.textContent ?? "");
    check("a tool opened from All tools appears under Recent", railAfter.includes(W.railRecent) && railAfter.includes(W.posts), railAfter.slice(0, 300));
    await shot("5-recent");
    await context.close();
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
