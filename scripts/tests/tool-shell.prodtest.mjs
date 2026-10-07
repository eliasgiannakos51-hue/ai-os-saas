/*
 * EVERY TOOL IN ONE SHELL, IN THE BUILT APP (MASTER 14.3, package 3).
 *
 * Run: node scripts/tests/tool-shell.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/tool-shell.prodtest.mjs
 *
 * One production build, two servers: one where the signed-in account is
 * the test account (TEST_ACCOUNT_EMAILS), so the switch "tool-shell" is on
 * for it, and one where it is not, so it is off. With the switch on, Posts
 * is the shell: the field is focused on arrival, at most four options sit
 * under it, nothing else on the page takes text, there are no steps on
 * top; a brief sent there writes the posts and they open beside the
 * conversation on a computer and over it on a phone, with a way back.
 * With the switch off, the old page is drawn exactly as before.
 *
 * /api/posts/generate is answered by the browser (page.route), so no
 * model is called and nothing is charged; what is tested is the screen.
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
  port: 54363,
  tableRows: { user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }] },
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
const W = {
  name: el.dashboard.tools.names.posts,
  oldGenerate: el.posts.form.generate,
  back: el.dashboard.toolShell.back,
};

const servers = [];
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

const SET = {
  version: 1,
  locale: "el",
  posts: [
    { platform: "linkedin", text: "Ο φούρνος μας φέρνει πλέον πρωινό στα γραφεία του κέντρου.", hashtags: ["#πρωινό"] },
    { platform: "x", text: "Πρωινό στο γραφείο, από τον φούρνο της γειτονιάς.", hashtags: [] },
  ],
};

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
    // A real finger on the phone, a mouse on the desktop.
    const cdp = device.touch ? await context.newCDPSession(page) : null;
    async function press(locator) {
      await locator.scrollIntoViewIfNeeded();
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    const sent = [];
    await page.route("**/api/posts/generate", (r) => {
      sent.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: null, set: SET, creditsCharged: 3 }) });
    });

    // ---- the switch off: the old page, as before
    await page.goto(`${OFF}/dashboard/posts`, { waitUntil: "networkidle" });
    check("switch off: the old page is drawn", (await page.locator('[data-testid="posts-generate"]').count()) === 1 && (await page.locator('[data-testid="tool-shell"]').count()) === 0);

    // ---- the switch on: the shell
    await page.goto(`${ON}/dashboard/posts`, { waitUntil: "networkidle" });
    const shell = page.locator('[data-testid="tool-shell"]');
    check("switch on: Posts is the shell", (await shell.count()) === 1 && (await page.locator('[data-testid="posts-generate"]').count()) === 0);
    check("...named with its one word", (await shell.locator("h1").innerText()).trim() === W.name);
    const focused = await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
    check("...the field is focused on arrival", focused);
    const fields = await page.locator("main textarea, main input:not([type=checkbox]):not([type=hidden])").count();
    check(`...and it is the only thing on the page that takes text (${fields})`, fields === 1);
    const options = await page.locator('[data-testid="tool-shell-options"] > *').count();
    check(`...with at most four options under it (${options})`, options >= 1 && options <= 4);
    check("...and no steps on top", (await page.locator('[data-testid^="step-flow"]').count()) === 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("...and the page does not scroll sideways", overflow <= 1, `${overflow}px`);

    // ---- the platforms option opens its choice by a press, finger or mouse
    const chooser = page.locator('[data-testid="posts-platforms"]');
    if ((await chooser.count()) === 1) {
      await press(chooser);
      await page.waitForTimeout(200);
    }
    const boxes = await page.locator('[data-testid="tool-shell-options"] input[type=checkbox]:visible').count();
    check(`the platforms option opens the five platforms to choose from (${boxes})`, boxes === 5);
    if ((await chooser.count()) === 1) await press(chooser);

    // ---- a brief, sent from the field
    const field = page.locator("main textarea");
    await field.fill("Ο φούρνος μας φέρνει πλέον πρωινό στα γραφεία του κέντρου.");
    await field.press("Enter");
    const work = page.locator('[data-testid="tool-shell-work"]');
    const opened = await work.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
    check("the brief went to /api/posts/generate once, with every platform", sent.length === 1 && Array.isArray(sent[0]?.platforms) && sent[0].platforms.length === 5, JSON.stringify(sent[0] ?? null));
    check("the posts open in the work area", opened && (await work.locator('[data-testid="posts-result"] > li').count()) === 2);
    check("...and the conversation keeps the brief and a card that opens them again",
      (await page.locator('[data-testid="tool-shell-thread"] [data-role="user"]').count()) === 1 && (await page.locator('[data-testid="tool-shell-card"]').count()) === 1);
    const geo = await page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      return { work: r('[data-testid="tool-shell-work"]'), thread: r('[data-testid="tool-shell-thread"]'), shell: r('[data-testid="tool-shell"]'), vw: innerWidth };
    });
    if (device.touch) {
      check("phone: the work is the whole screen", geo.work && Math.round(geo.work.width) === geo.vw, JSON.stringify(geo.work));
      const back = page.getByRole("button", { name: W.back });
      check("...with a way back to the conversation", (await back.count()) === 1);
      if ((await back.count()) === 1) {
        await press(back);
        await page.waitForTimeout(300);
        check("...that closes it", (await work.count()) === 0);
      }
    } else {
      check("computer: the work is beside the conversation, about 60%",
        geo.work && geo.thread && geo.shell && geo.work.left >= geo.thread.right - 1 && Math.abs(geo.work.width / geo.shell.width - 0.6) < 0.08, JSON.stringify(geo));
    }
    await context.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
