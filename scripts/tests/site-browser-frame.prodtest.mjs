/*
 * SITE — THE BROWSER FRAME AND THE MOTION BUTTON, IN THE BUILT APP
 * (owner, 2026-10-30, Κομμάτι 1 of "ΝΕΑ ΟΘΟΝΗ ΚΑΙ ΣΤΥΛ ΚΙΝΗΣΗΣ").
 *
 * Run: node scripts/tests/site-browser-frame.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/site-browser-frame.prodtest.mjs
 *      SHOT_DIR=/tmp/site-shots node scripts/tests/site-browser-frame.prodtest.mjs
 *
 * A finished site is seeded straight into user_websites and opened with
 * `?project=`, so this file tests only the new chrome — generate/edit/
 * publish already have their own coverage in site-pages.prodtest.mjs and
 * are not re-asked here.
 *
 * Both devices: 1440x900 with a mouse, 390x844 with touch — the same pair
 * every other Site/tool-shell prodtest uses.
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

const SID = "d2222222-2222-4222-8222-222222222222";
const NAME = "Αύρα Νάξος";
const HOME = `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>${NAME}</title></head><body><header><nav><a href=".">Αρχική</a></nav></header><main><section><h2>${NAME}</h2><p>Καλώς ήρθατε.</p></section></main><footer>Αύρα 2026</footer></body></html>`;

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54372,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    // Already unlocked, so opening this seeded site does not also pop the
    // "Ξεκλειδώθηκε επίτευγμα" toast over the chrome this file is testing.
    user_achievements: [{ user_id: MOCK_USER.id, achievement_key: "first_website_generated", unlocked_at: "2026-10-30T12:00:00Z" }],
    user_websites: [
      {
        id: SID, user_id: MOCK_USER.id, name: NAME, status: "completed", error_message: null, description: "x",
        html_content: HOME, pages: null, generation_notes: null, reference_image_url: null,
        has_reference_images: false, is_large_request: false, free_retry_used: false,
        created_at: "2026-10-30T12:00:00Z",
      },
    ],
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

    await page.goto(`${ON}/dashboard/website-builder?project=${SID}`, { waitUntil: "networkidle" });
    const frame = page.locator('[data-testid="site-browser-frame"]');
    check("the browser frame wraps the preview", (await frame.count()) === 1);
    check("...with the site's own name as the address, no fabricated domain", (await page.locator('[data-testid="site-browser-address"]').innerText()).trim() === NAME);
    check("...and the real preview iframe inside it", (await frame.locator('iframe[data-testid="site-live-preview"]').count()) === 1);
    await shot("1-desktop-default");

    // ---- desktop/mobile toggle
    check("desktop is pressed by default", (await page.locator('[data-testid="site-viewport-desktop"]').getAttribute("aria-pressed")) === "true");
    const frameWidthBefore = (await frame.boundingBox()).width;
    await press(page.locator('[data-testid="site-viewport-mobile"]'));
    await page.waitForTimeout(150);
    check("pressing mobile marks it pressed instead", (await page.locator('[data-testid="site-viewport-mobile"]').getAttribute("aria-pressed")) === "true" && (await page.locator('[data-testid="site-viewport-desktop"]').getAttribute("aria-pressed")) === "false");
    const frameWidthAfter = (await frame.boundingBox()).width;
    check(
      "the FRAME stays the same width — only the simulated page inside narrows",
      Math.abs(frameWidthAfter - frameWidthBefore) <= 2,
      `${frameWidthBefore} vs ${frameWidthAfter}`
    );
    const narrowed = (await page.locator('[data-testid="site-browser-page"]').boundingBox())?.width ?? 0;
    check("...and that inner page is narrowed toward phone width", narrowed > 0 && narrowed <= 400, String(narrowed));
    await shot("2-mobile-selected");
    await press(page.locator('[data-testid="site-viewport-desktop"]'));
    await page.waitForTimeout(150);

    // ---- Motion: the button and the list only (owner's stop-gate)
    const motionButton = page.locator('[data-testid="motion-button"]');
    check("a Motion button sits on the same bar as the viewport toggle", (await motionButton.count()) === 1);
    await press(motionButton);
    await page.waitForTimeout(100);
    check("it opens, aria-expanded true", (await motionButton.getAttribute("aria-expanded")) === "true");
    const choices = page.locator('[data-testid="motion-choice"]');
    check("eight styles are offered", (await choices.count()) === 8);
    const order = await choices.evaluateAll((els) => els.map((e) => e.getAttribute("data-motion-style")));
    check(
      "in the owner's own order",
      JSON.stringify(order) === JSON.stringify(["none", "softFade", "slideUp", "parallax", "glass", "holographic", "typewriter", "hoverLift"]),
      JSON.stringify(order)
    );
    await shot("3-motion-list");

    // ---- hovering/focusing a choice drives the preview swatch, nothing else
    const preview = page.locator('[data-testid="motion-preview"] .motion-demo');
    check("no style selected yet: the demo shows 'none'", (await preview.getAttribute("class"))?.includes("motion-demo-none"));
    const slideUp = choices.nth(2); // index 2 = slideUp, by DOM order already checked above
    if (device.touch) {
      await slideUp.evaluate((e) => e.focus());
    } else {
      await slideUp.hover();
    }
    await page.waitForTimeout(100);
    check("hovering/focusing 'Slide up' switches the demo to it", (await preview.getAttribute("class"))?.includes("motion-demo-slideUp"));
    await shot("4-motion-hover-slideup");
    check("no style is actually applied to the real site preview (src unchanged)", (await page.locator('iframe[data-testid="site-live-preview"]').getAttribute("srcdoc"))?.includes(NAME));
    // ONE textarea on the whole page — the shell's own composer — same
    // rule tool-shell.test.mjs holds statically; the Motion popover adds
    // buttons only, never a second field to type into.
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
