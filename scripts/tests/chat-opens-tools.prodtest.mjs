/*
 * CHAT OPENS THE SITE, IN THE BUILT APP (MASTER 16, package 7): «γράφω
 * "φτιάξε μου site για το camping" και ανοίγει το Site δίπλα».
 *
 * Run: node scripts/tests/chat-opens-tools.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/chat-opens-tools.prodtest.mjs
 *
 * One production build, two servers: one where the signed-in account is
 * the test account, so the switch "chat-opens-tools" is on, and one where
 * it is off. The Site's own routes and /api/chat are answered by the
 * browser (page.route), so no model is called and nothing is charged;
 * every request the screen makes is counted.
 *
 * With the switch on: the sentence opens the Site BESIDE the conversation
 * (the address stays /dashboard/chat), with its price, and /api/chat is
 * NOT called; nothing is made before the press; the press makes it and the
 * finished site is drawn in a preview with no scripts; the next sentence
 * changes it, still without /api/chat; a question about sites goes to
 * /api/chat as before. With the switch off, the sentence goes to /api/chat.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
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
  port: 54365,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
  },
});

const freePort = () =>
  new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  // Nobody is the owner here; the switch is decided by the test account.
  ADMIN_EMAILS: "",
};

const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const P = el.dashboard.chat.sitePane;

const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
};

async function start(env) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn("npx", ["next", "start", "-p", String(port)], { env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  servers.push(server);
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${origin}/api/health`, () => res()); r.on("error", rej); });
      return origin;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error("the production server did not start");
}

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production) ...");
    const build = spawn("npx", ["next", "build"], { env: base, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + log.slice(-3000));
      cleanup();
      process.exit(1);
    }
  }
  const ON = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  const OFF = await start({ ...base, TEST_ACCOUNT_EMAILS: "" });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
    await context.addCookies(
      [ON, OFF].flatMap((origin) => [
        { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: "el", url: origin },
      ]).map(({ domain, path, ...c }) => c)
    );
    const page = await context.newPage();
    pageErrors.length = 0;
    page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
    const cdp = device.touch ? await context.newCDPSession(page) : null;
    async function press(locator) {
      // To the middle of the screen, not just into it: on a phone the
      // bottom bar is fixed over the last row, and a finger there presses
      // the bar.
      await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    // ---- what the screen asks, answered here and counted
    const asked = { chat: 0, generate: [], process: 0, status: 0, edit: [] };
    const HTML = (line) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Camping</title></head><body><header><h1>Camping Νάξος</h1></header><main><section><p>${line}</p></section></main><footer>2026</footer></body></html>`;
    const SITE = (status, html) => ({ id: "a1111111-1111-4111-8111-111111111111", user_id: MOCK_USER.id, name: "Camping Νάξος", status, html_content: html, error_message: null, created_at: "2026-10-07T12:00:00Z" });
    await page.route("**/api/chat", (r) => {
      asked.chat++;
      return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: [
        JSON.stringify({ type: "meta", conversationId: "c1111111-1111-4111-8111-111111111111", isNewConversation: true }),
        JSON.stringify({ type: "delta", text: "Ένα καλό site είναι γρήγορο και καθαρό." }),
        JSON.stringify({ type: "done", credits: 1 }),
      ].join("\n") + "\n" });
    });
    await page.route("**/api/websites/generate/process", (r) => { asked.process++; return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }); });
    await page.route("**/api/websites/generate", (r) => {
      asked.generate.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, generated: true, record: SITE("pending", "") }) });
    });
    await page.route("**/api/websites/status**", (r) => {
      asked.status++;
      const record = asked.edit.length > 0 ? SITE("completed", HTML("Ωράριο: 9–21")) : asked.status < 2 ? SITE("processing", "") : SITE("completed", HTML("Σκηνές δίπλα στη θάλασσα."));
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, record }) });
    });
    await page.route("**/api/websites/edit", (r) => {
      asked.edit.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, edited: true, record: SITE("completed", HTML("Ωράριο: 9–21")) }) });
    });
    const pane = page.locator('[data-testid="chat-site-pane"]');
    async function say(text) {
      const field = page.locator("textarea").first();
      await press(field);
      await field.fill(text);
      await field.press("Enter");
      await page.waitForTimeout(600);
    }

    // ---- the switch off: the sentence is a chat message, as before
    await page.goto(`${OFF}/dashboard/chat`, { waitUntil: "networkidle" });
    await say("φτιάξε μου site για το camping");
    check("switch off: the sentence goes to the conversation, and no Site opens", asked.chat === 1 && (await pane.count()) === 0, JSON.stringify(asked));

    // ---- the switch on: the Site opens beside the conversation
    asked.chat = 0;
    await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
    await say("φτιάξε μου site για το camping");
    await pane.waitFor({ timeout: 10000 }).catch(() => null);
    check("switch on: the Site opens", (await pane.count()) === 1);
    check("...beside the conversation: the address is still Chat", new URL(page.url()).pathname === "/dashboard/chat", page.url());
    check("...and no model was asked to decide", asked.chat === 0, JSON.stringify(asked));
    check("...it says what it will make, and its price", (await pane.innerText()).includes(P.willMake) && /credit/i.test(await pane.innerText()));
    check("...and nothing is made before the press", asked.generate.length === 0 && asked.process === 0);
    if (device.touch) {
      check("phone: the Site takes the whole screen", await pane.evaluate((el) => { const r = el.getBoundingClientRect(); return r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1; }));
    } else {
      const thread = await page.locator('[data-testid="chat-thread"]').boundingBox();
      const box = await pane.boundingBox();
      check("computer: the Site is beside the conversation, on the right", thread && box && box.x >= thread.x + thread.width - 2 && box.width > 500, JSON.stringify({ thread, box }));
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("...and the page does not scroll sideways", overflow <= 1, `${overflow}px`);

    // ---- the press makes it
    await press(page.locator('[data-testid="chat-site-make"]'));
    await page.locator('[data-testid="chat-site-preview"] iframe').waitFor({ timeout: 15000 }).catch(() => null);
    check("the press asks for the site once, with the sentence as its brief", asked.generate.length === 1 && asked.generate[0].description === "φτιάξε μου site για το camping", JSON.stringify(asked.generate));
    check("...hands it to the worker and watches it", asked.process === 1 && asked.status >= 2, JSON.stringify(asked));
    const frame = page.locator('[data-testid="chat-site-preview"] iframe');
    check("the finished site is drawn beside the conversation", (await frame.count()) === 1 && ((await frame.getAttribute("srcdoc")) ?? "").includes("Σκηνές δίπλα στη θάλασσα."));
    check("...in a preview with no scripts", (await frame.getAttribute("sandbox")) === "");

    // ---- the next sentence changes it
    if (device.touch) {
      // On a phone the site covers the conversation: back to it, and the
      // site stays open behind, with a press to show it again.
      await press(page.locator('[data-testid="chat-site-back"]'));
      await page.waitForTimeout(300);
      check("phone: back to the conversation puts the site aside, still open", !(await pane.isVisible()) && (await page.locator('[data-testid="chat-site-reopen"]').count()) === 1);
    }
    await say("βάλε και ωράριο 9 με 21");
    await page.waitForFunction(() => (document.querySelector('[data-testid="chat-site-preview"] iframe')?.getAttribute("srcdoc") ?? "").includes("Ωράριο"), null, { timeout: 10000 }).catch(() => null);
    check("the next sentence changes that site", asked.edit.length === 1 && asked.edit[0].websiteId === SITE("completed", "").id && asked.edit[0].changeRequest === "βάλε και ωράριο 9 με 21", JSON.stringify(asked.edit));
    check("...without asking the model in the conversation", asked.chat === 0);
    check("...and the changed site is shown", (await pane.isVisible()) && ((await page.locator('[data-testid="chat-site-preview"] iframe').getAttribute("srcdoc")) ?? "").includes("Ωράριο: 9–21"));

    // ---- a question about sites is still a conversation
    await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
    await say("τι είναι ένα καλό site;");
    check("a question about sites goes to the conversation, and no Site opens", asked.chat === 1 && (await pane.count()) === 0, JSON.stringify(asked));

    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
