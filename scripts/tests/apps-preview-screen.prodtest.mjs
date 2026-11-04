/*
 * APPS — THE PREVIEW/DATA/PLAN SCREEN, IN THE BUILT APP (owner, "APPS:
 * ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ", 2026-10-30, Κομμάτι 2).
 *
 * Run: node scripts/tests/apps-preview-screen.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/apps-preview-screen.prodtest.mjs
 *      SHOT_DIR=/tmp/apps-shots node scripts/tests/apps-preview-screen.prodtest.mjs
 *
 * An already-approved plan is seeded straight into user_apps, so this
 * file tests only the new screen — planning and box-editing already have
 * their own coverage in apps-tool.prodtest.mjs and are not re-asked here.
 *
 * Both devices: 1440x900 with a mouse, 390x844 with touch — the same
 * pair every other tool-shell prodtest uses.
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

const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };

// Same shape as apps-tool.prodtest.mjs's PLAN: two screens on one
// collection — a form (customer-facing) and a list (owner-facing) — so
// switching screens is a real check, not a one-screen trivial case.
const DEFINITION = {
  title: "Κρατήσεις κομμωτηρίου",
  collections: [
    {
      key: "bookings",
      label: "Ραντεβού",
      visibility: "own",
      fields: [
        { key: "name", label: "Όνομα", type: "text", required: true },
        { key: "when", label: "Ημερομηνία", type: "date", required: true },
        { key: "service", label: "Υπηρεσία", type: "choice", required: true, options: ["Κούρεμα", "Βαφή"] },
      ],
    },
    { key: "services", label: "Υπηρεσίες", visibility: "owner", fields: [{ key: "title", label: "Τίτλος", type: "text", required: true }] },
  ],
  screens: [
    { key: "book", label: "Κλείσε ραντεβού", kind: "form", collection: "bookings", role: "customer" },
    { key: "day", label: "Η μέρα μου", kind: "list", collection: "bookings", role: "owner" },
  ],
  notifications: [{ key: "new_booking", label: "Νέο ραντεβού", collection: "bookings", to: "owner" }],
};
const appRows = [{ id: "app1", title: DEFINITION.title, definition: DEFINITION, status: "approved", versions: [], locale: "el", updated_at: new Date().toISOString() }];

function rest({ req, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "user_apps") {
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
    const idFilter = url.searchParams.get("id");
    const wanted = idFilter ? appRows.filter((r) => `eq.${r.id}` === idFilter) : appRows;
    if (req.method === "GET") return answer(wanted), true;
    return false;
  }
  return false;
}

const supa = await startMockSupabase({ port: 54413, tableRows: { feature_flags: flags, user_credits: credits }, handle: rest });

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
const EL = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.appBuilder;

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

    await page.goto(`${ON}/dashboard/app-builder`, { waitUntil: "load" });
    await press(page.locator('[data-testid="apps-recent-open"]'));
    await press(page.locator('[data-testid="apps-recent"] button', { hasText: DEFINITION.title }));
    await page.locator('[data-testid="app-tab"]').first().waitFor({ timeout: 15_000 });

    // ---- the tab bar, Preview first
    const tabs = page.locator('[data-testid="app-tab"]');
    check("three tabs, Preview/Data/Plan", (await tabs.count()) === 3);
    check("Preview is selected by default", (await page.locator('[data-testid="app-tab"][data-tab="preview"]').getAttribute("aria-selected")) === "true");

    // ---- the Preview tab: screens left, phone center, data+access right
    const screenButtons = page.locator('[data-testid="app-preview-screen"]');
    check("both screens are listed", (await screenButtons.count()) === 2);
    check("the first screen is selected by default", (await screenButtons.first().getAttribute("aria-pressed")) === "true");
    const phone = page.locator('[data-testid="app-phone-frame"]');
    check("the phone frame is there", (await phone.count()) === 1);
    check("the form screen shows its fields as mock rows, not real inputs", (await phone.locator('[data-testid="app-mock-field"]').count()) === 3);
    check("...with the field's own label, never an invented value", (await phone.locator('[data-testid="app-mock-field"]').first().innerText()).trim() === EL.type.text);
    check("...and a mock Send button", (await phone.locator('[data-testid="app-mock-submit"]').innerText()).trim() === EL.formSubmit);
    check("the right column names the collection's data and who sees what", (await page.locator(`text=${EL.seesOwn}`).count()) >= 1);
    await shot("1-preview-form");

    // ---- switching to the list screen
    await press(screenButtons.nth(1));
    await page.waitForTimeout(100);
    check("the list screen replaces the phone's content with ONE sample row", (await phone.locator('[data-testid="app-mock-row"]').count()) === 1);
    check("...clearly marked as a sample, never invented data", (await page.locator(`text=${EL.sampleRow}`).count()) >= 1);
    await shot("2-preview-list");

    // ---- Motion is present (shared button, not re-tested here — apps-preview-screen.test.mjs and site-browser-frame.prodtest.mjs already do)
    check("the shared Motion button sits in the Preview tab's toolbar", (await page.locator('[data-testid="motion-button"]').count()) === 1);

    // ---- the Data tab: every collection, not just the selected screen's
    await press(page.locator('[data-testid="app-tab"][data-tab="data"]'));
    await page.locator('[data-testid="app-data-tab"]').waitFor({ timeout: 5_000 });
    check("both collections are listed on the Data tab", (await page.locator(`text=${DEFINITION.collections[0].label}`).count()) >= 1 && (await page.locator(`text=${DEFINITION.collections[1].label}`).count()) >= 1);
    await shot("3-data-tab");

    // ---- the Plan tab: today's box-list-and-approve mechanism, untouched
    await press(page.locator('[data-testid="app-tab"][data-tab="plan"]'));
    await page.locator('[data-testid="app-plan"]').waitFor({ timeout: 5_000 });
    check("the four boxes are still there", (await page.locator('[data-testid="app-box"]').count()) === 4);
    check("an already-approved app shows the approved note, not the button", (await page.locator('[data-testid="app-approved"]').count()) === 1 && (await page.locator('[data-testid="app-approve"]').count()) === 0);
    await shot("4-plan-tab");

    // ONE textarea on the whole page — the shell's own composer — same
    // rule tool-shell.test.mjs holds statically.
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
