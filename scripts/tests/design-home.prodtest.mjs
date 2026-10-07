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
 *   5. RECENT, by the rule of 2026-10-05 (src/lib/nav/recent-tools.ts):
 *      a tool merely OPENED from All tools does not appear under Recent
 *      tools; one PINNED there does, at once.
 *   6. CHAT WITH NO MESSAGE (MASTER 14.2, 2026-10-07): the earth, the
 *      greeting and the field, together in the middle of the screen, and
 *      nothing else drawn there — no card, no examples, no chip.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with Input.dispatchTouchEvent.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { loadTs } from "./load-ts.mjs";

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
  railRecent: el.sidebar.rail.recentTools,
  // The square's one-word name since MASTER 14.1 (2026-10-07).
  posts: el.dashboard.tools.names.posts,
  greetings: Object.values(el.promise.greeting),
  mentor: el.dashboard.chat.mentorMode,
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
    // Each device starts with no pins: the mock keeps what the app writes.
    MOCK_USER.user_metadata = { subscription_tier: "growth" };
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

    // ---- 1b. the greeting over the field (the owner, 2026-10-07: «η γη
    // και ο χαιρετισμός μαζί ακριβώς στο κέντρο, πάνω από το πεδίο»). The
    // pair is measured as drawn — the earth's left edge to the end of the
    // greeting's TEXT, not the h1's box — against the field's own middle.
    const centre = await page.evaluate(() => {
      const h1 = document.querySelector("main h1");
      const earth = h1?.parentElement?.firstElementChild;
      const field = document.querySelector("main textarea");
      if (!h1 || !earth || earth === h1 || !field) return null;
      const range = document.createRange();
      range.selectNodeContents(h1);
      const text = [...range.getClientRects()];
      const left = Math.min(earth.getBoundingClientRect().left, ...text.map((r) => r.left));
      const right = Math.max(...text.map((r) => r.right));
      const f = field.getBoundingClientRect();
      return { pairMid: Math.round((left + right) / 2), fieldMid: Math.round((f.left + f.right) / 2) };
    });
    check("the earth and the greeting are centred over the field", Boolean(centre) && Math.abs(centre.pairMid - centre.fieldMid) <= 4, JSON.stringify(centre));
    await shot("0-home");

    // ---- 2. the rail
    await openRail();
    const aside = page.locator("aside").first();
    // textContent, not innerText: the headings are CSS-uppercased, and
    // Greek uppercase drops the accent — "Πρόσφατα" paints as "ΠΡΟΣΦΑΤΑ".
    const railText = await aside.evaluate((n) => n.textContent ?? "");
    check("the rail offers New", railText.includes(W.railNew), railText.slice(0, 200));
    check("...and All tools", railText.includes(W.railAll));
    // The design's rail has no group headings — only "Recent tools" and
    // "Recent conversations" when there is something under them — so the
    // old six are looked for in every paragraph of it, not in a heading
    // style the new rail does not use.
    const paragraphs = await aside.locator("p").evaluateAll((ps) => ps.map((p) => (p.textContent ?? "").trim()));
    const oldShown = W.oldHeadings.filter((h) => paragraphs.includes(h) || railText.includes(h));
    check("none of the old group headings is in the rail", oldShown.length === 0, oldShown.join(", "));
    check("...and no Recent tools heading over an empty list", !paragraphs.includes(W.railRecent), paragraphs.join(" · "));
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
    const cards = page.locator('[data-testid="tool-tile"]');
    const n = await cards.count();
    const cardInfo = await cards.evaluateAll((els) => els.map((a) => ({ text: a.innerText.trim(), lines: a.innerText.trim().split("\n").filter(Boolean).length })));
    // EXACTLY the squares lib/nav/all-tools.ts groups (MASTER 14.1): no
    // Settings block, nothing hidden coming back.
    const { ALL_TOOLS_GROUPS } = await loadTs("src/lib/nav/all-tools.ts");
    const squares = ALL_TOOLS_GROUPS.flatMap((g) => g.hrefs).length;
    check(`All tools draws exactly its ${squares} squares (${n} cards)`, n === squares && squares >= 15);
    check("...and every card has a name AND a one-line hint", cardInfo.every((c) => c.lines >= 2), cardInfo.filter((c) => c.lines < 2).map((c) => c.text).join(" | "));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("...and the page does not scroll sideways", overflow <= 1, `${overflow}px`);
    await shot("4-all-tools");

    // ---- 5. recent
    const railNow = async () => {
      await page.goto(`${ORIGIN}/dashboard/overview`, { waitUntil: "networkidle" });
      await openRail();
      return page.locator("aside").first().evaluate((n) => n.textContent ?? "");
    };
    const postsCard = cards.filter({ hasText: W.posts }).first();
    const postsThere = (await postsCard.count()) > 0;
    check("All tools has a Posts square to open and pin", postsThere);
    if (postsThere) await press(postsCard);
    await page.waitForURL(/\/dashboard\/posts/, { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    const railOpened = await railNow();
    check("a tool only OPENED from All tools is not under Recent tools", !railOpened.includes(W.railRecent), railOpened.slice(0, 300));
    if (cdp) await page.keyboard.press("Escape");

    await page.goto(`${ORIGIN}/dashboard/tools`, { waitUntil: "networkidle" });
    const pin = page.locator("li", { has: cards.filter({ hasText: W.posts }) }).locator('[data-testid="tool-pin"]').first();
    let pinned = false;
    if ((await pin.count()) > 0) {
      const saved = page.waitForResponse((r) => r.url().includes("/api/nav/recent-tools"), { timeout: 10000 });
      await press(pin);
      pinned = await saved.then((r) => r.ok(), () => false);
    }
    check("...pinning it from All tools is saved", pinned);
    const railPinned = await railNow();
    check("...and then it IS under Recent tools", railPinned.includes(W.railRecent) && railPinned.includes(W.posts), railPinned.slice(0, 300));
    await shot("5-recent");

    // ---- 6. chat with no message
    await page.goto(`${ORIGIN}/dashboard/chat`, { waitUntil: "networkidle" });
    const empty = page.locator('[data-testid="chat-empty"]');
    const emptyShown = await empty.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
    check("the empty Chat is drawn", emptyShown);
    const greetingText = emptyShown ? (await empty.locator("h1").innerText()).trim() : "";
    check(`...and it greets by the hour ("${greetingText}")`, W.greetings.some((g) => greetingText.startsWith(g)), W.greetings.join(" / "));
    // NOTHING ELSE IN THE CONVERSATION AREA: its only text is the
    // greeting, and nothing in it can be pressed.
    const thread = await page.locator('[data-testid="chat-thread"]').evaluate((n) => ({
      text: (n.innerText ?? "").trim(),
      pressable: n.querySelectorAll("button, a, input, [role=button]").length,
    }));
    check("...the conversation area holds the greeting and nothing else", thread.text === greetingText && thread.pressable === 0,
      JSON.stringify(thread).slice(0, 200));
    check("...and no Mentor Mode chip over the field", (await page.getByRole("button", { name: W.mentor }).count()) === 0);
    // TOGETHER, IN THE MIDDLE: the field right under the greeting, and
    // the group's middle near the middle of the Chat column.
    const geo = await page.evaluate(() => {
      const r = (el) => el?.getBoundingClientRect();
      const h1 = r(document.querySelector('[data-testid="chat-empty"] h1'));
      const field = r(document.querySelector("form textarea"));
      const earth = r(document.querySelector('[data-testid="chat-empty"]')?.firstElementChild);
      const column = r(document.querySelector('[data-testid="chat-thread"]')?.parentElement?.parentElement);
      return h1 && field && earth && column
        ? { gap: field.top - h1.bottom, groupMid: (earth.top + field.bottom) / 2, colMid: (column.top + column.bottom) / 2, colH: column.height }
        : null;
    });
    check("...the field sits right under the greeting", Boolean(geo) && geo.gap >= 0 && geo.gap <= 120, JSON.stringify(geo));
    check("...and the three are in the middle of the screen", Boolean(geo) && Math.abs(geo.groupMid - geo.colMid) <= geo.colH * 0.15, JSON.stringify(geo));
    await shot("6-chat-empty");
    await context.close();
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
