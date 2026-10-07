/*
 * A SITE OF FIVE PAGES, ONE PART CHANGED IN WORDS, PUBLISHED AT ITS OWN
 * ADDRESS — IN THE BUILT APP (MASTER 16, package 10).
 *
 * Run: node scripts/tests/site-pages.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/site-pages.prodtest.mjs
 *
 * One production build; the signed-in account is the test account, so the
 * switches "tool-shell" and "site-pages" are on. The Site's own routes are
 * answered by the browser (page.route), so no model is called and nothing
 * is charged, and every request the screen makes is counted. The published
 * address is the REAL public route (/s/<address> and /s/<address>/<page>)
 * reading the stand-in database.
 *
 * Five pages asked for with one press; the five as tabs; a part of the
 * third page chosen and changed in words, the change sent for that page
 * and that part; undo; the whole site downloaded as one archive of five
 * pages; published from the shell at its own address; and that address,
 * opened, serves the home page and the other pages with links between them.
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

const SID = "b1111111-1111-4111-8111-111111111111";
const ADDRESS = "avra-naxos";
const doc = (title, body) =>
  `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>${title}</title></head><body>` +
  `<header><nav><a href=".">Αρχική</a><a href="menu">Μενού</a><a href="rooms">Δωμάτια</a><a href="gallery">Φωτογραφίες</a><a href="contact">Επικοινωνία</a></nav></header>` +
  `<main><section><h2>${title}</h2><p>${body}</p></section><section><h2>Ωράριο</h2><p>Καθημερινά.</p></section></main><footer>Αύρα 2026</footer></body></html>`;
const HOME = doc("Αύρα Νάξος", "Καλώς ήρθατε στην Αύρα.");
const PAGES = [
  { slug: "menu", label: "Μενού", html: doc("Μενού", "Μουσακάς, χωριάτικη.") },
  { slug: "rooms", label: "Δωμάτια", html: doc("Δωμάτια", "Δίκλινα με θέα.") },
  { slug: "gallery", label: "Φωτογραφίες", html: doc("Φωτογραφίες", "Η παραλία μας.") },
  { slug: "contact", label: "Επικοινωνία", html: doc("Επικοινωνία", "Γράψτε μας.") },
];

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54369,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    // THE PUBLISHED ADDRESS: the public route reads this snapshot.
    published_sites: [
      { id: "c1111111-1111-4111-8111-111111111111", user_id: MOCK_USER.id, website_id: SID, subdomain: ADDRESS, html_content: HOME, pages: PAGES,
        status: "live", is_active: true, updated_at: "2026-10-07T12:00:00Z", published_at: "2026-10-07T12:00:00Z" },
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

const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const S = el.dashboard.toolShell;

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
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, acceptDownloads: true });
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

    // ---- what the screen asks, answered here and counted
    const asked = { generate: [], edit: [], undo: 0, publish: [] };
    let pagesNow = PAGES;
    const record = (status) => ({
      id: SID, user_id: MOCK_USER.id, name: "Αύρα Νάξος", status, error_message: null, description: "x",
      html_content: status === "completed" ? HOME : "", pages: status === "completed" ? pagesNow : null,
      generation_notes: null, reference_image_url: null, has_reference_images: false, is_large_request: false, free_retry_used: false,
      created_at: "2026-10-07T12:00:00Z",
    });
    let statusCalls = 0;
    await page.route("**/api/websites/generate/process", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
    await page.route("**/api/websites/generate", (r) => {
      asked.generate.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, generated: true, record: record("pending") }) });
    });
    await page.route(`**/api/websites/status?id=${SID}`, (r) => {
      statusCalls++;
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, record: record(statusCalls >= 2 ? "completed" : "processing") }) });
    });
    await page.route("**/api/websites/edit", (r) => {
      asked.edit.push(r.request().postDataJSON());
      pagesNow = PAGES.map((p) => (p.slug === "rooms" ? { ...p, html: p.html.replace("Καθημερινά.", "Καθημερινά, 9 με 21.") } : p));
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, edited: true, record: record("completed") }) });
    });
    await page.route(`**/api/websites/${SID}/undo`, (r) => {
      asked.undo++;
      pagesNow = PAGES;
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, record: record("completed") }) });
    });
    await page.route(`**/api/websites/${SID}/publish`, (r) => {
      if (r.request().method() === "GET") {
        return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, site: null, urlTemplate: `${ON}/s/{subdomain}` }) });
      }
      asked.publish.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, publishedSiteId: "c1111111-1111-4111-8111-111111111111", subdomain: ADDRESS, url: `${ON}/s/${ADDRESS}`, versionNumber: 1 }) });
    });

    await page.goto(`${ON}/dashboard/website-builder`, { waitUntil: "networkidle" });
    check("the Site is in the shell", (await page.locator('[data-testid="tool-shell"]').count()) === 1);
    const options = await page.locator('[data-testid="tool-shell-options"] > *').count();
    check(`...with four options, the pages among them (${options})`, options === 4 && (await page.locator('[data-testid="site-page-count"]').count()) === 1);

    // ---- five pages, with one press
    await press(page.locator('[data-testid="site-page-count"]'));
    const fiveChoice = page.locator('[data-testid="site-page-count-choice"]').filter({ hasText: "5" });
    await press(fiveChoice);
    check("five pages chosen, and the option says so", (await page.locator('[data-testid="site-page-count"]').innerText()).includes("5"));
    const field = page.locator("main textarea");
    await field.fill("Site για την ταβέρνα και τα δωμάτια Αύρα στη Νάξο.");
    await field.press("Enter");
    await page.locator('[data-testid="site-pages"]').waitFor({ timeout: 20000 }).catch(() => null);
    check("the request asks for five pages", asked.generate.length === 1 && /\nPAGES REQUESTED: 5\. Write exactly 5 pages/.test(asked.generate[0]?.description ?? ""), (asked.generate[0]?.description ?? "").slice(-200));
    const tabs = page.locator('[data-testid="site-page"]');
    check("the site opens with its five pages as tabs", (await tabs.count()) === 5, String(await tabs.count()));

    // ---- the third page, one part, in words
    await press(tabs.nth(2));
    await page.waitForTimeout(300);
    const frame = page.locator('[data-testid="site-preview"] iframe');
    check("the third page is shown", (await tabs.nth(2).getAttribute("aria-current")) === "page" && ((await frame.getAttribute("srcdoc")) ?? "").includes("Δίκλινα με θέα."));
    const parts = page.locator('[data-testid="site-box"]');
    check("its parts are listed", (await parts.count()) >= 3);
    await press(parts.nth(2));
    await page.waitForTimeout(300);
    if (device.touch && (await field.isVisible()) === false) await page.waitForTimeout(300);
    await field.fill("Βάλε ωράριο 9 με 21.");
    await field.press("Enter");
    await page.waitForTimeout(1000);
    check("the change is sent for that page and that part", asked.edit.length === 1 && asked.edit[0].pageSlug === "rooms" && asked.edit[0].section === 2 && asked.edit[0].changeRequest === "Βάλε ωράριο 9 με 21.", JSON.stringify(asked.edit[0] ?? null));
    if (device.touch && (await page.locator('[data-testid="site-preview"]').count()) === 0) {
      await press(page.locator('[data-testid="tool-shell-thread"] button').filter({ hasText: "Αύρα" }).last());
      await page.waitForTimeout(300);
    }
    check("...and the changed page is what is shown", ((await frame.getAttribute("srcdoc")) ?? "").includes("Καθημερινά, 9 με 21."));

    // ---- undo
    await press(page.locator('[data-testid="site-undo"]'));
    await page.waitForTimeout(800);
    check("undo takes it back, and says so", asked.undo === 1 && (await page.locator('[data-testid="tool-shell-thread"]').innerText()).includes(S.pages.undone));
    if (device.touch && (await page.locator('[data-testid="site-preview"]').count()) === 0) {
      await press(page.locator('[data-testid="tool-shell-thread"] button').filter({ hasText: "Αύρα" }).last());
      await page.waitForTimeout(300);
    }
    check("...and the page is as it was", ((await page.locator('[data-testid="site-preview"] iframe').getAttribute("srcdoc")) ?? "").includes("Καθημερινά.</p>"));

    // ---- the whole site, downloaded
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }).catch(() => null), press(page.locator('[data-testid="site-download"]'))]);
    let entries = 0;
    let name = "";
    if (download) {
      name = download.suggestedFilename();
      const bytes = readFileSync(await download.path());
      for (let i = 0; i + 3 < bytes.length; i++) if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 3 && bytes[i + 3] === 4) entries++;
    }
    check("the download is the whole site: one archive of five pages", name === "Αύρα Νάξος.zip" && entries === 5, JSON.stringify({ name, entries }));

    // ---- published at its own address
    const publishButton = page.getByRole("button", { name: el.dashboard.publishing.publish, exact: true });
    await press(publishButton);
    const input = page.locator("#publish-subdomain");
    await input.waitFor({ timeout: 5000 }).catch(() => null);
    await input.fill(ADDRESS);
    await page.waitForTimeout(300);
    await press(page.locator('[role="dialog"] button.bg-button'));
    await page.waitForTimeout(800);
    const live = page.locator(`a[href="${ON}/s/${ADDRESS}"]`);
    check("published from the shell, at its own address", asked.publish.length === 1 && asked.publish[0].subdomain === ADDRESS && (await live.count()) >= 1, JSON.stringify(asked.publish));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);

    // ---- the address itself
    const visitor = await context.newPage();
    const homeResponse = await visitor.goto(`${ON}/s/${ADDRESS}`, { waitUntil: "domcontentloaded" });
    const homeText = await visitor.content();
    check("the address serves the home page", homeResponse?.status() === 200 && homeText.includes("Καλώς ήρθατε στην Αύρα."), String(homeResponse?.status()));
    check("...whose menu leads to the other pages under the same address", homeText.includes(`href="/s/${ADDRESS}/rooms"`), homeText.match(/href="[^"]*rooms[^"]*"/)?.[0]);
    const roomsResponse = await visitor.goto(`${ON}/s/${ADDRESS}/rooms`, { waitUntil: "domcontentloaded" });
    check("...and each page is served there", roomsResponse?.status() === 200 && (await visitor.content()).includes("Δίκλινα με θέα."), String(roomsResponse?.status()));
    const missing = await visitor.goto(`${ON}/s/${ADDRESS}/nothing-here`, { waitUntil: "domcontentloaded" });
    check("...and a page the site does not have is a 404", missing?.status() === 404, String(missing?.status()));
    await visitor.close();

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
