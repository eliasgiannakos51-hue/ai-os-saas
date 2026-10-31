/*
 * IMAGE — THE TOOLS RAIL AND SETTINGS PANEL, IN THE BUILT APP (owner,
 * "16. IMAGE: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ ΚΑΙ ΤΑ ΝΕΑ ΚΟΥΜΠΙΑ", 2026-10-30,
 * Κομμάτι 2).
 *
 * Run: node scripts/tests/image-tools-panel.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/image-tools-panel.prodtest.mjs
 *      SHOT_DIR=/tmp/image-shots node scripts/tests/image-tools-panel.prodtest.mjs
 *
 * A finished image is seeded straight into generated_images and opened
 * with `?record=`, so this file tests only the new chrome — the
 * generator itself already has its own coverage in
 * image-studio.prodtest.mjs and is not re-asked here.
 *
 * Both devices: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
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

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const ID = "c4444444-4444-4444-8444-444444444444";
const pathOf = (n) => `${MOCK_USER.id}/${ID}/v${n}.png`;
const ROW = {
  id: ID, user_id: MOCK_USER.id, prompt: "Ένα κεραμικό βάζο σε πέτρινο τραπέζι", aspect: "1:1", status: "done", credits_charged: 36,
  variants: [0, 1, 2, 3].map((n) => ({ index: n, path: pathOf(n), mime: "image/png", fullPath: null, previous: [] })),
  created_at: "2026-10-30T12:00:00Z", updated_at: "2026-10-30T12:00:00Z",
};

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54374,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    generated_images: [ROW],
    ai_images: [],
  },
  handle: ({ req, res, url, body, json }) => {
    const p = url.pathname;
    if (req.method === "POST" && p === "/storage/v1/object/sign/ai-images") {
      const { paths } = JSON.parse(body || "{}");
      json(200, (paths ?? []).map((path) => ({ path, signedURL: `/object/sign/ai-images/${path}?token=t`, error: null })));
      return true;
    }
    if (req.method === "GET" && p.startsWith("/storage/v1/object/sign/ai-images/")) {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(PNG);
      return true;
    }
    return false;
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
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
    await context.addCookies(
      [
        { ...supa.authCookie, url: ON, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: "el", url: ON },
      ].map(({ domain, path, ...c }) => c)
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
    const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${name}.png` });

    await page.goto(`${ON}/dashboard/images?record=${ID}`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="image-grid"]').waitFor({ timeout: 15_000 });

    // ---- the tools rail
    const rail = page.locator('[data-testid="image-tools-rail"]');
    check("the tools rail is there", (await rail.count()) === 1);
    const productAd = page.locator('[data-testid="image-tool-product-ad"]');
    check("Product ad is a real (disabled) control, not decoration", (await productAd.count()) === 1 && (await productAd.isDisabled()));
    const animate = page.locator('[data-testid="image-tool-animate"]');
    check("Animate is disabled today (Video and Editing are not ready yet)", (await animate.count()) === 1 && (await animate.isDisabled()));
    await shot("1-tools-rail");

    // ---- the settings panel: Same product
    const panel = page.locator('[data-testid="image-settings-panel"]');
    check("the settings panel is there", (await panel.count()) === 1);
    const slots = page.locator('[data-testid="image-same-product-slot"]');
    check("four reference slots are offered, all empty at first", (await slots.count()) === 4);

    // ---- picking a reference image fills one slot, locally
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: "ref.png", mimeType: "image/png", buffer: PNG });
    await page.waitForTimeout(150);
    check("one slot now shows the picture", (await page.locator('[data-testid="image-same-product-slot"] img').count()) === 1);
    await shot("2-same-product-picked");

    // ---- Search the web first toggles, locally
    const toggle = page.locator('[data-testid="image-search-web"]');
    check("off by default", (await toggle.getAttribute("aria-checked")) === "false");
    await press(toggle);
    await page.waitForTimeout(100);
    check("pressing it turns it on", (await toggle.getAttribute("aria-checked")) === "true");
    await shot("3-search-web-on");

    // ---- nothing from either control reached a real request
    let imagesCalled = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/images/") && req.method() !== "GET") imagesCalled++;
    });
    await page.waitForTimeout(200);
    check("picking a reference and flipping the toggle called no route", imagesCalled === 0);

    // ONE textarea on the whole page — the shell's own composer.
    check("still exactly one typable field on the page: the shell's own composer", (await page.locator("main textarea").count()) === 1 && (await page.locator('main input:not([type="checkbox"]):not([type="radio"]):not([type="file"])').count()) === 0);

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
