/*
 * DESIGN, PART 2, IN THE BUILT APP: numbered sources, the Build split, the motion.
 *
 * Run: node scripts/tests/design-part2.prodtest.mjs
 *      SKIP_BUILD=1 DESIGN_SHOTS=/tmp/shots node scripts/tests/design-part2.prodtest.mjs
 *
 * The owner asked on 2026-10-03 for the rest of the approved design: sources
 * in chat (Perplexity), the result beside the work in Build, the movements,
 * the type scale. This drives a production build in Greek on a desktop and a
 * phone with real touch:
 *
 *   1. CHAT, LIVE. A question is sent; /api/chat answers (stubbed — no model
 *      is called) with the stream the route really emits, ending in the
 *      numbered text lib/chat/web-sources.ts builds. The answer shows "1"
 *      and "2" as links, two source cards, and no raw definition.
 *   2. CHAT, RELOADED. A conversation whose stored answer carries the
 *      definitions shows the same cards — the point of keeping them in the
 *      text rather than in a field that only the live stream had.
 *   3. BUILD. An open site sits to the RIGHT of the list at 1440px and slides
 *      in; on a phone it stays above the list, as before.
 *   4. MOTION. The panel animates — and under prefers-reduced-motion it does
 *      not.
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

const A = "https://www.example.gr/kafes-times";
const B = "https://stats.example.org/report";
// What the route stores and sends when the answer searched the web — the
// exact shape lib/chat/web-sources.ts produces (web-sources.test.mjs holds it).
const SOURCED =
  "Ο μέσος espresso κοστίζει 2,10 € [1] και ανέβηκε 6% φέτος. [2] [1]\n\n" +
  `[1]: <${A}> "Τιμές καφέ 2026"\n[2]: <${B}> "Report 2026"\n`;
const NOW = "2026-10-03T09:00:00Z";

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54355,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    chat_conversations: [{ id: "c-old", title: "Καφές", is_pinned: false, created_at: NOW, updated_at: NOW }],
    chat_messages: [
      { id: "m1", conversation_id: "c-old", user_id: MOCK_USER.id, role: "user", content: "Πόσο κοστίζει ο καφές;", created_at: NOW },
      { id: "m2", conversation_id: "c-old", user_id: MOCK_USER.id, role: "assistant", content: SOURCED, created_at: NOW },
    ],
    user_websites: [
      {
        id: "w1",
        user_id: MOCK_USER.id,
        name: "Καφετέρια Ακρόπολη",
        description: "site για καφετέρια",
        status: "completed",
        html_content: "<!doctype html><html><body><h1>Καφετέρια</h1></body></html>",
        pages: null,
        created_at: NOW,
        updated_at: NOW,
      },
    ],
  },
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

const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const W = { send: el.dashboard.chat.send, sources: el.dashboard.chat.sources.title };

const SHOT_DIR = process.env.DESIGN_SHOTS || "";
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

const ndjson = (events) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
const STREAM = ndjson([
  { type: "meta", conversationId: "c-new", isNewConversation: true, title: "Τιμή καφέ" },
  { type: "delta", text: "Ο μέσος espresso κοστίζει 2,10 € " },
  { type: "delta", text: "και ανέβηκε 6% φέτος." },
  { type: "done", content: SOURCED, usage: { creditsCharged: 8 } },
]);

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
    async function press(locator) {
      await locator.scrollIntoViewIfNeeded();
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${name}.png` });
    let chatCalls = 0;
    await page.route("**/api/chat", (r) => {
      chatCalls++;
      return r.fulfill({ contentType: "application/x-ndjson; charset=utf-8", body: STREAM });
    });

    // ---- 1. chat, live
    await page.goto(`${ORIGIN}/dashboard/chat`, { waitUntil: "networkidle" });
    const box = page.locator("textarea").last();
    await press(box);
    await page.keyboard.type("Πόσο κοστίζει ο espresso στην Ελλάδα;", { delay: 3 });
    // The VISIBLE one: the thread renders more than one control with this
    // name across its states, and a tap on a hidden one lands nowhere.
    const sendButton = page.locator(`button[aria-label="${W.send}"]:visible`).last();
    // NOTHING SITS ON SEND. A toast did, on the phone, on 2026-10-03 —
    // the tap landed on the toast and the message never left.
    const covered = (await sendButton.count()) === 0 ? "no send button" : await sendButton.evaluate((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit && (hit === b || b.contains(hit)) ? null : (hit?.outerHTML ?? "nothing").slice(0, 120);
    });
    check("nothing covers the Send button", covered === null, String(covered));
    if ((await sendButton.count()) > 0) await press(sendButton);
    const cards = page.locator(".source-cards a[data-source]");
    await cards.first().waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    check("the question reached /api/chat", chatCalls === 1, `${chatCalls} calls`);
    check("the answer shows two source cards", (await cards.count()) === 2, `${await cards.count()} cards`);
    const inline = await page.locator(`a[href="${A}"]`).evaluateAll((as) => as.map((a) => a.textContent));
    check("the number in the sentence is a link to source 1", inline.includes("1"), JSON.stringify(inline));
    const bodyText = await page.locator("main").innerText();
    check("no raw definition is printed", !bodyText.includes("]: <"), bodyText.slice(-200));
    await shot("1-chat-sources");
    const firstCard = (await cards.count()) > 0 ? await cards.first().innerText() : "";
    check("the quoted passage is nowhere — only titles and sites", firstCard.includes("example.gr"), firstCard);

    // ---- 2. chat, reloaded
    await page.goto(`${ORIGIN}/dashboard/chat?c=c-old`, { waitUntil: "networkidle" });
    const storedCards = page.locator(".source-cards a[data-source]");
    await storedCards.first().waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await shot("1b-chat-reloaded");
    check("a stored answer shows the same two cards after a reload", (await storedCards.count()) === 2, `${await storedCards.count()} cards`);

    // ---- 3. build split
    await page.goto(`${ORIGIN}/dashboard/website-builder?project=w1`, { waitUntil: "networkidle" });
    const panel = page.locator(".result-panel").first();
    await panel.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    const list = page.locator(".build-split > div").nth(1);
    const pb = await panel.boundingBox().catch(() => null);
    const lb = await list.boundingBox().catch(() => null);
    check("the open site's panel is on the page", Boolean(pb) && Boolean(lb));
    if (pb && lb) {
      if (device.label === "desktop") {
        check("at 1440px the result sits to the RIGHT of the list", pb.x >= lb.x + lb.width - 1, `panel x=${Math.round(pb.x)}, list ends ${Math.round(lb.x + lb.width)}`);
      } else {
        check("on a phone it stays above the list, as before", pb.y + pb.height <= lb.y + 1, `panel ends ${Math.round(pb.y + pb.height)}, list starts ${Math.round(lb.y)}`);
      }
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("...and the page does not scroll sideways", overflow <= 1, `${overflow}px`);

    // ---- 4. motion
    const anim = await panel.evaluate((n) => ({ name: getComputedStyle(n).animationName, ms: parseFloat(getComputedStyle(n).animationDuration) * 1000 })).catch(() => null);
    check("the panel slides in", anim?.name === "result-slide" && anim.ms >= 200, JSON.stringify(anim));
    await shot("2-build-split");
    await context.close();
  }

  // Reduced motion, once: the OS preference turns the movement off.
  const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await calm.addCookies([
    { ...supa.authCookie, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
    { name: "NEXT_LOCALE", value: "el", domain: "127.0.0.1", path: "/" },
  ]);
  const calmPage = await calm.newPage();
  await calmPage.goto(`${ORIGIN}/dashboard/website-builder?project=w1`, { waitUntil: "networkidle" });
  const calmMs = await calmPage.locator(".result-panel").first()
    .evaluate((n) => parseFloat(getComputedStyle(n).animationDuration) * 1000).catch(() => null);
  console.log("\n== reduced motion ==");
  check("under prefers-reduced-motion the panel does not move", calmMs !== null && calmMs < 1, `${calmMs}ms`);
  await calm.close();
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
