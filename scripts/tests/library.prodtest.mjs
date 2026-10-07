/*
 * THE LIBRARY, IN THE BUILT APP (MASTER 4.1, package 5): «φτιάχνω κάτι σε
 * τρία εργαλεία και τα βρίσκω και τα τρία εκεί».
 *
 * Run: node scripts/tests/library.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/library.prodtest.mjs
 *
 * One production build, two servers: one where the signed-in account is
 * the test account (TEST_ACCOUNT_EMAILS), so the switches "library" and
 * "tool-shell" are on for it, and one where they are off.
 *
 * The account has made a site, a deck and a set of posts (and one site
 * that failed). With the switch on, the page All tools calls «Βιβλιοθήκη»
 * shows the three, newest first, and not the failed one; a search finds
 * the site by a sentence on its page and shows that sentence; one kind
 * shows only that kind; pressing each opens IT, in its own tool; the
 * entries are one tab along. With the switch off, the page is as before.
 *
 * The mock database answers every table with all its rows, whatever the
 * filter, so who may see what is held by scripts/tests/library.test.mjs
 * against the queries, not here.
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

const SITE_ID = "a1111111-1111-4111-8111-111111111111";
const FAILED_SITE_ID = "a2222222-2222-4222-8222-222222222222";
const DECK_ID = "b1111111-1111-4111-8111-111111111111";
const POSTS_ID = "c1111111-1111-4111-8111-111111111111";

// THE SHAPES THE ROUTES STORE (lib/presentations/deck.ts, lib/posts/platforms.ts).
const slide = (layout, title, bullets) => ({ layout, title, bullets, notes: "", imageQuery: null, image: null });
const DECK = {
  version: 1,
  title: "Επενδυτές 2027",
  locale: "el",
  imageSource: "none",
  slides: [slide("title", "Επενδυτές 2027", []), slide("bullets", "Η αγορά", ["Τριπλάσια ζήτηση το καλοκαίρι"])],
};
const SET = {
  version: 1,
  locale: "el",
  posts: [{ platform: "linkedin", text: "Ανοίγουμε το Σάββατο στη Νάξο.", hashtags: ["#camping"] }],
};
const SITE_HTML =
  '<!doctype html><html><head><title>Camping</title></head><body><header><h1>Camping Νάξος</h1></header>' +
  "<section><h2>Η θάλασσα</h2><p>Σκηνές δίπλα στη θάλασσα, με καφέ το πρωί.</p></section><footer>2026</footer></body></html>";

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54364,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    user_websites: [
      { id: SITE_ID, user_id: MOCK_USER.id, name: "Camping Νάξος", html_content: SITE_HTML, status: "completed", error_message: null, reference_image_url: null, attempt_count: 1, has_reference_images: false, created_at: "2026-10-07T10:00:00Z" },
      { id: FAILED_SITE_ID, user_id: MOCK_USER.id, name: "Δεν βγήκε", html_content: "", status: "failed", error_message: "timeout", reference_image_url: null, attempt_count: 1, has_reference_images: false, created_at: "2026-10-07T11:00:00Z" },
    ],
    ai_presentations: [
      { id: DECK_ID, user_id: MOCK_USER.id, title: DECK.title, description: "Για επενδυτές", slide_count: 2, slides: DECK, image_source: "none", source: "generated", error: null, credits_charged: 4, created_at: "2026-10-07T09:00:00Z" },
    ],
    generated_posts: [
      { id: POSTS_ID, user_id: MOCK_USER.id, description: "Εγκαίνια του camping", platforms: ["linkedin"], posts: SET, locale: "el", status: "done", error: null, credits_charged: 2, created_at: "2026-10-07T12:00:00Z" },
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
  // Nobody is the owner here; the switch is decided by the test account.
  ADMIN_EMAILS: "",
};

const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const L = el.dashboard.library;

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
      await locator.scrollIntoViewIfNeeded();
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    const items = page.locator('[data-testid="library-item"]');
    const kinds = async () => (await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")))).join(",");

    // ---- the switch off: the page as it was
    await page.goto(`${OFF}/dashboard/timeline`, { waitUntil: "networkidle" });
    check("switch off: no Library, the entries as before",
      (await page.locator('[data-testid="library-items"]').count()) === 0 && (await page.getByRole("tab", { name: L.tab }).count()) === 0);

    // ---- the switch on: what was made, in three tools, in one place
    await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
    check("switch on: the page is the Library", (await page.locator("h1").first().innerText()).trim() === L.title);
    check("...with the site, the deck and the posts, newest first", (await kinds()) === "posts,site,slides", await kinds());
    check("...and not the site that failed", (await page.getByText("Δεν βγήκε").count()) === 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("...and the page does not scroll sideways", overflow <= 1, `${overflow}px`);

    // ---- a search in what a thing SAYS
    const search = page.locator('[data-testid="library-search"]');
    await press(search);
    await search.fill("θαλασσα");
    await search.press("Enter");
    await page.waitForURL(/[?&]q=/);
    await page.waitForLoadState("networkidle");
    check('a search for a word on the site\'s page, without its accent, finds the site', (await kinds()) === "site", await kinds());
    check("...and shows the sentence it was found in", (await items.first().innerText()).includes("δίπλα στη θάλασσα"));
    await search.fill("ποδήλατο");
    await search.press("Enter");
    await page.waitForURL(/q=%CF%80/);
    await page.waitForLoadState("networkidle");
    check("a search for nothing they made says so, with the words searched", (await items.count()) === 0 && (await page.getByText(L.noMatch.title.replace("{query}", "ποδήλατο")).count()) === 1);

    // ---- one kind
    await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
    await press(page.locator('[data-testid="library-kind"]', { hasText: L.kinds.slides }));
    await page.waitForURL(/kind=slides/);
    await page.waitForLoadState("networkidle");
    check("one kind shows only that kind", (await kinds()) === "slides", await kinds());

    // ---- pressing each opens IT, in its own tool
    await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
    await press(items.filter({ hasText: DECK.title }));
    await page.waitForURL(new RegExp(`/dashboard/presentations\\?record=${DECK_ID}`));
    await page.waitForLoadState("networkidle");
    check("the deck opens in Slides, on that deck", (await page.locator('[data-testid="tool-shell-work"]').count()) === 1
      && (await page.locator('[data-testid="tool-shell-work"]').innerText()).includes("Τριπλάσια ζήτηση το καλοκαίρι"));

    await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
    await press(items.filter({ hasText: "Camping Νάξος" }));
    await page.waitForURL(new RegExp(`/dashboard/website-builder\\?project=${SITE_ID}`));
    await page.waitForLoadState("networkidle");
    const srcdoc = (await page.locator('[data-testid="site-preview"] iframe').getAttribute("srcdoc").catch(() => null)) ?? "";
    check("the site opens in Site, on that site", srcdoc.includes("Σκηνές δίπλα στη θάλασσα"));

    await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
    await press(items.filter({ hasText: "Εγκαίνια του camping" }));
    await page.waitForURL(new RegExp(`/dashboard/posts\\?record=${POSTS_ID}`));
    await page.waitForLoadState("networkidle");
    check("the posts open in Posts, on those posts", (await page.locator('[data-testid="tool-shell-work"]').count()) === 1
      && (await page.locator('[data-testid="tool-shell-work"]').innerText()).includes("Ανοίγουμε το Σάββατο στη Νάξο."));

    // ---- the entries, one tab along
    await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
    await press(page.getByRole("tab", { name: el.dashboard.timeline.tabAll }));
    await page.waitForURL(/view=entries/);
    await page.waitForLoadState("networkidle");
    check("the entries are one tab along", (await page.locator('[data-testid="library-items"]').count()) === 0
      && (await page.getByRole("tab", { name: L.tab }).count()) === 1);

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
