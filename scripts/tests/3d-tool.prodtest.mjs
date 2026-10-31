/*
 * THE 3D SCREEN, IN THE BUILT APP (the owner's "23. 3D: ΝΕΟ ΕΡΓΑΛΕΙΟ",
 * 2026-10-31, Κομμάτι 2), behind the switch "3d-tool".
 *
 * Run: node scripts/tests/3d-tool.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/3d-tool.prodtest.mjs
 *      SHOT_DIR=/tmp/3d-shots node scripts/tests/3d-tool.prodtest.mjs
 *
 * No model, no table beyond feature_flags and user_credits — this piece
 * has no data model yet, only the screen: the empty landing (globe, 3
 * examples, the shared composer's own "+" for photos), and — once a
 * photo is attached — the work screen (interactive placeholder box,
 * photos strip, settings panel, inert top bar).
 * Both devices: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

const EL = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.threeD;
const PNG = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 180, g: 90, b: 40 } } }).png().toBuffer();

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
const supa = await startMockSupabase({ port: 54482, tableRows: { feature_flags: flags, user_credits: credits } });
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
  // THE DRAG GOES THROUGH CDP ON TOUCH, mouse.move/down/up on desktop —
  // the same reasoning as chat-scroll.prodtest.mjs: a dispatchEvent touch
  // is untrusted and model-less onPointerMove would never fire for it.
  async function drag(locator, dx, dy) {
    const box = await locator.boundingBox();
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    if (!cdp) {
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + dx, startY + dy, { steps: 12 });
      await page.mouse.up();
      return;
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y: startY }] });
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX + (dx * i) / steps, y: startY + (dy * i) / steps }] });
      await page.waitForTimeout(12);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    // A synthetic CDP touch sequence that triggered setPointerCapture
    // (this box's own drag-to-rotate) needs a beat to actually release
    // it before the next tap — found 2026-10-31: without this wait, the
    // very next press() on a touch device landed on nothing, zoom
    // buttons included, right after a drag and nowhere else.
    await page.waitForTimeout(150);
  }
  return { context, page, press, drag };
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
    const { context, page, press, drag } = await open(ON, device);
    const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${name}.png` });

    await page.goto(`${ON}/dashboard/tools`, { waitUntil: "load" });
    const tile = page.locator('[data-testid="tool-tile"][href="/dashboard/3d"]').first();
    await tile.waitFor({ timeout: 15_000 });
    await press(tile);
    await page.locator('[data-testid="tool-shell"]').first().waitFor({ timeout: 15_000 });
    check("the real tool opened, not Coming Soon", (await page.locator('[data-testid="coming-soon"]').count()) === 0);

    // ---- empty until a photo is attached, matching Image's own paradigm
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 5_000 });
    check("exactly three examples, through the shared composer", (await page.locator('[data-testid="tool-shell-example"]').count()) === 3);
    await shot("1-empty");

    // ---- attaching a photo through the shell's own '+' opens the work screen
    await page.locator('[data-testid="composer-attach-input"]').setInputFiles([{ name: "βάζο.png", mimeType: "image/png", buffer: PNG }]);
    await page.locator('[data-testid="tool-shell-work"]').waitFor({ timeout: 5_000 });
    check("the work screen opened once a photo exists", (await page.locator('[data-testid="threeD-viewer"]').count()) === 1);
    check("the photo is shown in the strip", (await page.locator('[data-testid="threeD-photos"] img').count()) === 1);
    await shot("2-work-one-photo");

    // ---- the top bar: View in AR / Download / Make final, all inert
    check("View in AR is disabled — no provider call yet", await page.locator('[data-testid="threeD-view-ar"]').isDisabled());
    check("Download is disabled", await page.locator('[data-testid="threeD-download"]').isDisabled());
    check("Make final is disabled and shows no fabricated credit count", await page.locator('[data-testid="threeD-make-final"]').isDisabled());
    check("the price line shows no fabricated number", (await page.locator('[data-testid="threeD-price"]').innerText()).includes("—"));

    // ---- the placeholder box: default rotation/zoom, then zoom buttons, then reset
    const placeholder = page.locator('[data-testid="threeD-model-placeholder"]');
    check("the box starts at the default rotation and zoom", (await placeholder.getAttribute("data-zoom")) === "1.00");
    await press(page.locator('[data-testid="threeD-zoom-in"]'));
    const zoomedIn = await placeholder.getAttribute("data-zoom");
    check("zoom in increases the zoom value", Number(zoomedIn) > 1);
    await press(page.locator('[data-testid="threeD-zoom-out"]'));
    await press(page.locator('[data-testid="threeD-zoom-out"]'));
    const zoomedOut = await placeholder.getAttribute("data-zoom");
    check("zoom out decreases it back below the zoomed-in value", Number(zoomedOut) < Number(zoomedIn));

    // ---- drag rotates the box, the device's own real gesture (mouse or touch)
    const beforeDrag = { x: await placeholder.getAttribute("data-rotation-x"), y: await placeholder.getAttribute("data-rotation-y") };
    await drag(placeholder, 80, 40);
    const afterDrag = { x: await placeholder.getAttribute("data-rotation-x"), y: await placeholder.getAttribute("data-rotation-y") };
    check(`dragging on the viewer changes the box's own rotation (${device.label})`, afterDrag.x !== beforeDrag.x || afterDrag.y !== beforeDrag.y);
    await shot("3-rotated-zoomed");

    // ---- reset restores both rotation and zoom to the same defaults
    await press(page.locator('[data-testid="threeD-reset"]'));
    await page.waitForTimeout(100);
    check("reset restores the default zoom", (await placeholder.getAttribute("data-zoom")) === "1.00");
    check("...and the default rotation", (await placeholder.getAttribute("data-rotation-x")) === beforeDrag.x && (await placeholder.getAttribute("data-rotation-y")) === beforeDrag.y);

    // ---- the settings panel: real, local chip groups
    check("Type defaults to Product", (await page.locator('[data-testid="threeD-panel-type-option"][data-value="product"]').getAttribute("aria-pressed")) === "true");
    await press(page.locator('[data-testid="threeD-panel-type-option"][data-value="furniture"]'));
    check("...and changes when pressed", (await page.locator('[data-testid="threeD-panel-type-option"][data-value="furniture"]').getAttribute("aria-pressed")) === "true");

    check("Quality defaults to Draft", (await page.locator('[data-testid="threeD-panel-quality-option"][data-value="draft"]').getAttribute("aria-pressed")) === "true");
    await press(page.locator('[data-testid="threeD-panel-quality-option"][data-value="final"]'));
    check("...and changes when pressed", (await page.locator('[data-testid="threeD-panel-quality-option"][data-value="final"]').getAttribute("aria-pressed")) === "true");

    check("Format defaults to GLB", (await page.locator('[data-testid="threeD-panel-format-option"][data-value="glb"]').getAttribute("aria-pressed")) === "true");
    await press(page.locator('[data-testid="threeD-panel-format-option"][data-value="usdz"]'));
    check("...and changes when pressed", (await page.locator('[data-testid="threeD-panel-format-option"][data-value="usdz"]').getAttribute("aria-pressed")) === "true");

    check("Background defaults to White", (await page.locator('[data-testid="threeD-panel-background-option"][data-value="white"]').getAttribute("aria-pressed")) === "true");
    await press(page.locator('[data-testid="threeD-panel-background-option"][data-value="transparent"]'));
    check("...and changes when pressed", (await page.locator('[data-testid="threeD-panel-background-option"][data-value="transparent"]').getAttribute("aria-pressed")) === "true");

    check("Real size is inert (disabled button, not an <input>)", await page.locator('[data-testid="threeD-real-size"] button').isDisabled());
    await shot("4-panel-settings");

    // ---- adding photos stops at the cap of 4
    await page.locator('[data-testid="composer-attach-input"]').setInputFiles([
      { name: "2.png", mimeType: "image/png", buffer: PNG },
      { name: "3.png", mimeType: "image/png", buffer: PNG },
      { name: "4.png", mimeType: "image/png", buffer: PNG },
      { name: "5.png", mimeType: "image/png", buffer: PNG },
    ]);
    check("the photo strip stops at 4, even though 5 were offered", (await page.locator('[data-testid="threeD-photos"] img').count()) === 4);

    // ---- removing every photo returns to the empty landing
    for (let i = 0; i < 4; i++) {
      await press(page.locator('[data-testid="threeD-photo-remove"]').first());
    }
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 5_000 });
    check("removing every photo closes the work screen back to the empty landing", (await page.locator('[data-testid="threeD-viewer"]').count()) === 0);

    // ---- reopening with a fresh photo, then closing via the shell's own close/back
    await page.locator('[data-testid="composer-attach-input"]').setInputFiles([{ name: "ξανά.png", mimeType: "image/png", buffer: PNG }]);
    await page.locator('[data-testid="tool-shell-work"]').waitFor({ timeout: 5_000 });
    const closeBtn = device.touch ? page.locator('[data-testid="tool-shell-back"]') : page.locator('[data-testid="tool-shell-close"]');
    await press(closeBtn);
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 5_000 });
    check("closing the work screen reaches the composer's own empty landing again", (await page.locator('[data-testid="tool-shell-example"]').count()) === 3);

    // ---- words are honestly answered: nothing is built yet
    await page.locator("textarea").first().fill("ένα τραπέζι από το σαλόνι μου");
    await press(page.locator('button[type="submit"]'));
    await page.locator(`[data-testid="tool-shell-thread"] >> text=${EL.notBuilt}`).first().waitFor({ timeout: 10_000 });
    check("a description is answered honestly, as the tool's own reply — nothing wired yet (piece 3+)", (await page.locator('[data-role="tool"]').last().innerText()).includes(EL.notBuilt));

    check("still exactly one typable field on the page: the shell's own composer", (await page.locator("main textarea").count()) === 1 && (await page.locator('main input:not([type="checkbox"]):not([type="radio"]):not([type="file"])').count()) === 0);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== desktop: with the switch not open to this account, the square opens Coming Soon ==");
  {
    setFlags({ "3d-tool": "off" });
    const { context, page } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${ON}/dashboard/3d`, { waitUntil: "load" });
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
