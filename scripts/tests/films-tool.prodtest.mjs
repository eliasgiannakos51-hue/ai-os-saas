/*
 * THE FILMS SCREEN, IN THE BUILT APP (the owner's "20. FILMS:
 * ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΕΛΕΓΧΟ ΑΝΑ ΠΛΑΝΟ", 2026-10-30, Κομμάτι 2), behind the
 * switch "films-tool".
 *
 * Run: node scripts/tests/films-tool.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/films-tool.prodtest.mjs
 *      SHOT_DIR=/tmp/films-shots node scripts/tests/films-tool.prodtest.mjs
 *
 * No model, no table beyond feature_flags and user_credits — this piece
 * has no data model yet, only the screen, its sample storyboard frames,
 * and the per-shot inspector panel.
 * Both devices: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

const EL = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.films;

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
const supa = await startMockSupabase({ port: 54481, tableRows: { feature_flags: flags, user_credits: credits } });
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
    const tile = page.locator('[data-testid="tool-tile"][href="/dashboard/films"]').first();
    await tile.waitFor({ timeout: 15_000 });
    await press(tile);
    await page.locator('[data-testid="tool-shell"]').first().waitFor({ timeout: 15_000 });
    check("the real tool opened, not Coming Soon", (await page.locator('[data-testid="coming-soon"]').count()) === 0);

    // ---- the workspace opens by default, with the stage bar and credits
    await page.locator('[data-testid="tool-shell-work"]').waitFor({ timeout: 5_000 });
    const stages = page.locator('[data-testid="films-stage"]');
    check("all five stages are drawn", (await stages.count()) === 5);
    check("every stage reads Waiting today — nothing past this screen is wired", (await page.locator('[data-testid="films-stage"][data-stage-status="waiting"]').count()) === 5);
    check("the credits line shows no fabricated number", (await page.locator('[data-testid="films-credits"]').innerText()).includes("—"));

    // ---- Characters & places, inert today
    check("add-character is disabled", await page.locator('[data-testid="films-add-character"]').isDisabled());
    check("add-place is disabled", await page.locator('[data-testid="films-add-place"]').isDisabled());
    await shot("1-workspace");

    // ---- pressing a sample shot: white ring + the inspector opens
    const firstShot = page.locator('[data-testid="films-shot"][data-shot-id="1"]');
    check("no inspector panel before a shot is pressed", (await page.locator('[data-testid="films-shot-panel"]').count()) === 0);
    await press(firstShot);
    await page.locator('[data-testid="films-shot-panel"]').waitFor({ timeout: 5_000 });
    check("the pressed shot is marked selected (aria-pressed)", (await firstShot.getAttribute("aria-pressed")) === "true");
    await shot("2-shot-selected");

    // ---- Camera angle / Light / Camera move: real, per-shot selection
    const angleWide = page.locator('[data-testid="films-panel-angle-option"][data-value="wide"]');
    check("Camera angle defaults to Medium", (await page.locator('[data-testid="films-panel-angle-option"][data-value="medium"]').getAttribute("aria-pressed")) === "true");
    await press(angleWide);
    check("...and changes when pressed", (await angleWide.getAttribute("aria-pressed")) === "true");

    const toggle = page.locator('[data-testid="films-panel-continue"]');
    check("Continue from previous shot starts off", (await toggle.getAttribute("aria-checked")) === "false");
    await press(toggle);
    check("...and flips on press", (await toggle.getAttribute("aria-checked")) === "true");
    await shot("3-panel-settings");

    // ---- Reshoot is inert — no real pipeline exists yet
    check("Reshoot is disabled", await page.locator('[data-testid="films-panel-reshoot"]').isDisabled());

    // ---- switching shots shows THAT shot's own (default) settings, not shot 1's edits
    const secondShot = page.locator('[data-testid="films-shot"][data-shot-id="2"]');
    await press(secondShot);
    check("shot 2 starts at its own default angle (Medium), unaffected by shot 1's change", (await page.locator('[data-testid="films-panel-angle-option"][data-value="medium"]').getAttribute("aria-pressed")) === "true");
    check("...and shot 1 is no longer marked selected", (await firstShot.getAttribute("aria-pressed")) === "false");

    // ---- pressing the same shot again closes the panel
    await press(secondShot);
    check("pressing the same shot again closes the inspector", (await page.locator('[data-testid="films-shot-panel"]').count()) === 0);

    // ---- closing the workspace reaches the composer landing, and it is reachable again
    const closeBtn = device.touch ? page.locator('[data-testid="tool-shell-back"]') : page.locator('[data-testid="tool-shell-close"]');
    await press(closeBtn);
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 5_000 });
    check("closing the workspace reaches the composer's own empty landing", (await page.locator('[data-testid="tool-shell-example"]').count()) === 2);
    const reopen = page.locator('[data-testid="films-workspace-open"]');
    await press(reopen);
    await page.locator('[data-testid="tool-shell-work"]').waitFor({ timeout: 5_000 });
    check("the workspace is reachable again — never a dead end on any device", (await page.locator('[data-testid="films-stage-bar"]').count()) === 1);

    // ---- words are honestly answered: nothing is built yet
    await press(closeBtn);
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 5_000 });
    await page.locator("textarea").first().fill("μία ταινία για το κατάστημά μου");
    await press(page.locator('button[type="submit"]'));
    await page.locator(`[data-testid="tool-shell-thread"] >> text=${EL.notBuilt}`).first().waitFor({ timeout: 10_000 });
    check("a description is answered honestly, as the tool's own reply — nothing wired yet (pieces 3+)", (await page.locator('[data-role="tool"]').last().innerText()).includes(EL.notBuilt));

    check("still exactly one typable field on the page: the shell's own composer", (await page.locator("main textarea").count()) === 1 && (await page.locator('main input:not([type="checkbox"]):not([type="radio"]):not([type="file"])').count()) === 0);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== desktop: with the switch not open to this account, the square opens Coming Soon ==");
  {
    setFlags({ "films-tool": "off" });
    const { context, page } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${ON}/dashboard/films`, { waitUntil: "load" });
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
