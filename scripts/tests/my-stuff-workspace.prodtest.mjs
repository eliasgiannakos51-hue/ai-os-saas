/*
 * «1. MY STUFF: ΝΕΑ ΟΘΟΝΗ» (the owner's message, 2026-10-28), Κομμάτι 1,
 * IN THE BUILT APP: list left, details right, real presses, desktop and
 * phone — no owner screenshot exists to compare against (flagged in
 * docs/NEEDS-FROM-ELIAS.md), so this is the stand-in docs/TOOL-RULES.md
 * rule 3 asks for: a real production build, real taps.
 *
 * Run: node scripts/tests/my-stuff-workspace.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/my-stuff-workspace.prodtest.mjs
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

const FINANCE = [
  { id: "f1", description: "Διαφημίσεις Σεπτεμβρίου", type: "expense", amount: 240, created_at: "2026-09-05T10:00:00Z" },
  { id: "f2", description: "Πώληση πακέτου", type: "income", amount: 500, created_at: "2026-09-12T10:00:00Z" },
];
const SITES = [{ id: "s1", name: "Camping Παραλία", status: "ready", created_at: "2026-08-01T10:00:00Z" }];
const SESSIONS = [
  {
    id: "sess1",
    title: "Πόσα πούλησα τον Σεπτέμβριο;",
    turns: [
      { role: "user", text: "Πόσα πούλησα τον Σεπτέμβριο;" },
      {
        role: "tool",
        text: "500€ από μία πώληση [1].",
        citations: [{ kind: "finance", id: "f2", title: "Πώληση πακέτου", href: "/dashboard/finance?record=f2" }],
      },
    ],
  },
];

const supa = await startMockSupabase({
  port: 54415,
  tableRows: { finance_entries: FINANCE, user_websites: SITES, my_stuff_sessions: SESSIONS },
});

let server, browser;
const pageErrors = [];
function cleanup() {
  // DETACHED + GROUP KILL, not server.kill(): `npx next start` spawns a
  // grandchild `next-server` process, and killing only the npx handle
  // leaves that grandchild running — the leak scripts/tests/
  // prodtest-hygiene.test.mjs exists to catch, reproduced in its own
  // section 4.
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { browser?.close(); } catch {}
  try { supa.close(); } catch {}
}
process.on("exit", cleanup);

async function start(env) {
  const port = await new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port: p } = probe.address();
      probe.close(() => resolve(p));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  server = spawn("npx", ["next", "start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
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
    [{ ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" }].map(({ domain, path: p, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  const cdp = device.touch ? await context.newCDPSession(page) : null;
  async function press(locator) {
    await locator.first().evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.first().click();
    const box = await locator.first().boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return { context, page, press };
}

const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  ADMIN_EMAILS: "",
  TEST_ACCOUNT_EMAILS: MOCK_USER.email,
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
  const APP = await start(base);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  console.log("\n== desktop: the screen is list left, details right ==");
  {
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/my-stuff`, { waitUntil: "load" });
    await page.locator('[data-testid="my-stuff-list-item"]').first().waitFor({ timeout: 15_000 });
    check("all three real rows are listed", (await page.locator('[data-testid="my-stuff-list-item"]').count()) === 3);
    check("nothing selected yet reads as empty, not broken", (await page.locator('[data-testid="my-stuff-details-empty"]').count()) === 1);

    const financeRow = page.locator('[data-testid="my-stuff-list-item"][data-kind="finance"]').filter({ hasText: "Πώληση πακέτου" });
    await press(financeRow);
    await page.locator('[data-testid="my-stuff-details"]').waitFor({ timeout: 10_000 });
    const detailsText = await page.locator('[data-testid="my-stuff-details"]').innerText();
    check("selecting a row shows ITS OWN title in the details pane", detailsText.includes("Πώληση πακέτου"));
    const openHref = await page.locator('[data-testid="my-stuff-open"]').getAttribute("href");
    check("the Open link points at the real record", openHref === "/dashboard/finance?record=f2", openHref);

    const siteRow = page.locator('[data-testid="my-stuff-list-item"][data-kind="site"]');
    await press(siteRow);
    const detailsText2 = await page.locator('[data-testid="my-stuff-details"]').innerText();
    check("selecting a DIFFERENT row replaces the details, not appends", detailsText2.includes("Camping") && !detailsText2.includes("Πώληση πακέτου"));

    console.log("\n== desktop: the history drawer still reaches the old Q&A sessions ==");
    await press(page.locator('[data-testid="my-stuff-history-open"]'));
    await page.locator('[data-testid="shell-history-row"]').first().waitFor({ timeout: 10_000 });
    await press(page.locator('[data-testid="shell-history-row"]').first());
    await page.locator('[data-testid="my-stuff-history-turns"]').waitFor({ timeout: 10_000 });
    const turnsText = await page.locator('[data-testid="my-stuff-history-turns"]').innerText();
    check("the real question is still there", turnsText.includes("Πόσα πούλησα"));
    check("...and the real answer, with its citation chip", turnsText.includes("500€"));
    check("no page threw (desktop, " + pageErrors.length + ")", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== phone (390x844): list OR details, never squeezed side by side ==");
  {
    const { context, page, press } = await open(APP, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${APP}/dashboard/my-stuff`, { waitUntil: "load" });
    await page.locator('[data-testid="my-stuff-list-item"]').first().waitFor({ timeout: 15_000 });
    check("the list is visible", await page.locator('[data-testid="my-stuff-list"]').isVisible());
    check("no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    const row = page.locator('[data-testid="my-stuff-list-item"]').first();
    await press(row);
    await page.locator('[data-testid="my-stuff-details"]').waitFor({ timeout: 10_000 });
    check("the details pane covers the screen, the list is gone", await page.locator('[data-testid="my-stuff-details"]').isVisible() && !(await page.locator('[data-testid="my-stuff-list"]').isVisible()));
    const backTarget = page.locator('[data-testid="my-stuff-details-back"]');
    const box = await backTarget.boundingBox();
    check(`the back arrow is at least 44px (${Math.round(box?.height ?? 0)}px)`, (box?.height ?? 0) >= 44 && (box?.width ?? 0) >= 44);
    await press(backTarget);
    await page.locator('[data-testid="my-stuff-list"]').waitFor({ state: "visible", timeout: 10_000 });
    check("back returns to the list", await page.locator('[data-testid="my-stuff-list"]').isVisible());
    check("no page threw (phone, " + pageErrors.length + ")", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${failures.length} failed`);
  if (failures.length) console.log(failures.map((f) => "  - " + f).join("\n"));
  cleanup();
  process.exit(failures.length === 0 ? 0 : 1);
} catch (err) {
  console.log("  FAIL  unexpected error\n        " + (err?.stack ?? err));
  cleanup();
  process.exit(1);
}
