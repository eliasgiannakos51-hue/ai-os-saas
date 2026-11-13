/*
 * THE EDITING SCREEN, IN THE BUILT APP (the owner's "18. EDITING:
 * ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΜΗΧΑΝΗ REMOTION", 2026-10-30, Κομμάτι 2), behind the
 * switch "editing-tool".
 *
 * Run: node scripts/tests/editing-tool.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/editing-tool.prodtest.mjs
 *      SHOT_DIR=/tmp/editing-shots node scripts/tests/editing-tool.prodtest.mjs
 *
 * No model, no table beyond feature_flags and user_credits — this piece
 * has no data model yet, only the screen and its two inert buttons.
 * Both devices: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

const EL = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.editing;

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

const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({ port: 54480, tableRows: { feature_flags: flags, user_credits: credits } });
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

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
  ADMIN_EMAILS: "",
};

const SHOT_DIR = process.env.SHOT_DIR;
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
async function open(origin, device) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: "el", url: origin },
    ].map(({ domain, path: p, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  const cdp = device.touch ? await context.newCDPSession(page) : null;
  async function press(locator) {
    await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.click();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return { context, page, press };
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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height}: the square opens the real screen ==`);
    setFlags({});
    const { context, page, press } = await open(ON, device);
    const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${name}.png` });

    await page.goto(`${ON}/dashboard/tools`, { waitUntil: "load" });
    const tile = page.locator('[data-testid="tool-tile"][href="/dashboard/editing"]').first();
    await tile.waitFor({ timeout: 15_000 });
    await press(tile);
    await page.locator('[data-testid="tool-shell"]').first().waitFor({ timeout: 15_000 });
    check("the real tool opened, not Coming Soon", (await page.locator('[data-testid="coming-soon"]').count()) === 0);

    // ---- the workspace opens by default, with its two inert buttons
    const work = page.locator('[data-testid="tool-shell-work"]');
    check("the workspace is open from the start — a real editor, not an empty chat landing", (await work.count()) === 1);
    const rail = page.locator('[data-testid="editing-tools-rail"]');
    check("the tools rail is there", (await rail.count()) === 1);
    const zoom = page.locator('[data-testid="editing-tool-zoom"]');
    check("Zoom is a real (disabled) control, not decoration", (await zoom.count()) === 1 && (await zoom.isDisabled()));
    const graphics = page.locator('[data-testid="editing-tool-graphics"]');
    check("Graphics is disabled too", (await graphics.count()) === 1 && (await graphics.isDisabled()));
    await shot("1-workspace");

    // ---- closing the workspace reaches the composer landing, and it is reachable again
    const closeBtn = device.touch ? page.locator('[data-testid="tool-shell-back"]') : page.locator('[data-testid="tool-shell-close"]');
    await press(closeBtn);
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 5_000 });
    check("closing the workspace reaches the composer's own empty landing", (await page.locator('[data-testid="tool-shell-example"]').count()) === 3);
    await shot("2-composer");
    const reopen = page.locator('[data-testid="editing-workspace-open"]');
    await press(reopen);
    await page.locator('[data-testid="tool-shell-work"]').waitFor({ timeout: 5_000 });
    check("the workspace is reachable again — never a dead end on any device", (await page.locator('[data-testid="editing-tools-rail"]').count()) === 1);

    // ---- words are honestly answered: nothing is built yet
    await press(closeBtn);
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 5_000 });
    await page.locator("textarea").first().fill("βάλε zoom όταν λέει τιμή");
    await press(page.locator('button[type="submit"]'));
    await page.locator(`[data-testid="tool-shell-thread"] >> text=${EL.notBuilt}`).first().waitFor({ timeout: 10_000 });
    check("a description is answered honestly, as the tool's own reply — nothing wired yet (pieces 3+)", (await page.locator('[data-role="tool"]').last().innerText()).includes(EL.notBuilt));
    await shot("3-not-built-reply");

    check("still exactly one typable field on the page: the shell's own composer", (await page.locator("main textarea").count()) === 1 && (await page.locator('main input:not([type="checkbox"]):not([type="radio"]):not([type="file"])').count()) === 0);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== desktop: with the switch not open to this account, the square opens Coming Soon ==");
  {
    setFlags({ "editing-tool": "off" });
    const { context, page } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${ON}/dashboard/editing`, { waitUntil: "load" });
    check("Coming Soon, not the real tool", (await page.locator('[data-testid="tool-shell-work"]').count()) === 0 && (await page.locator('[data-testid="coming-soon"]').count()) === 1);
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
