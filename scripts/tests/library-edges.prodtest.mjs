/*
 * THE LIBRARY AROUND ITS EDGES, IN THE BUILT APP (MASTER 16, package 5):
 * «φτιάχνω κάτι σε τρία εργαλεία και τα βρίσκω και τα τρία εκεί» — from
 * the All tools square a person presses, and in the states the main walk
 * (scripts/tests/library.prodtest.mjs) does not reach.
 *
 * Run: node scripts/tests/library-edges.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/library-edges.prodtest.mjs
 *
 * ONE STAND-IN PORT FOR THE THREE BROWSER CHECKS OF PACKAGES 5, 6 AND 7
 * (this file, brand-memory.prodtest.mjs, chat-opens-tools-edges.prodtest.mjs):
 * the port is baked into the build, so one `next build` serves all three
 * with SKIP_BUILD=1. They run one after another, never together.
 *
 *   1. A new account that made nothing: the page opens on the Library
 *      tab and says nothing was made, in Greek and in English, with no
 *      word of the other language.
 *   2. Made in three tools, arriving from the All tools square: all three,
 *      each opening in its own tool; in Greek and in English.
 *   3. One tool's table does not answer: the other two, and a line naming
 *      the one that did not load.
 *   4. No table answers: it must not say «you have made nothing».
 *   5. A Free account, and one with no credits left: the Library reads,
 *      it spends nothing, so it opens for both with what they made.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with real touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { screenText, englishOnGreek, greekOnEnglish, wordsOf } from "./lib/screen-language.mjs";

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
const DECK_ID = "b1111111-1111-4111-8111-111111111111";
const POSTS_ID = "c1111111-1111-4111-8111-111111111111";
const slide = (layout, title, bullets) => ({ layout, title, bullets, notes: "", imageQuery: null, image: null });
const DECK = { version: 1, title: "Επενδυτές 2027", locale: "el", imageSource: "none", slides: [slide("title", "Επενδυτές 2027", []), slide("bullets", "Η αγορά", ["Τριπλάσια ζήτηση το καλοκαίρι"])] };
const SET = { version: 1, locale: "el", posts: [{ platform: "linkedin", text: "Ανοίγουμε το Σάββατο στη Νάξο.", hashtags: ["#camping"] }] };
const SITE_HTML = '<!doctype html><html><head><title>Camping</title></head><body><header><h1>Camping Νάξος</h1></header><section><p>Σκηνές δίπλα στη θάλασσα.</p></section></body></html>';
const MADE = {
  user_websites: [{ id: SITE_ID, user_id: MOCK_USER.id, name: "Camping Νάξος", html_content: SITE_HTML, status: "completed", error_message: null, reference_image_url: null, attempt_count: 1, has_reference_images: false, created_at: "2026-10-07T10:00:00Z" }],
  ai_presentations: [{ id: DECK_ID, user_id: MOCK_USER.id, title: DECK.title, description: "Για επενδυτές", slide_count: 2, slides: DECK, image_source: "none", source: "generated", error: null, credits_charged: 4, created_at: "2026-10-07T09:00:00Z" }],
  generated_posts: [{ id: POSTS_ID, user_id: MOCK_USER.id, description: "Εγκαίνια του camping", platforms: ["linkedin"], posts: SET, locale: "el", status: "done", error: null, credits_charged: 2, created_at: "2026-10-07T12:00:00Z" }],
};
const CONTENT_WORDS = wordsOf("Camping Νάξος", DECK.title, "Εγκαίνια του camping", "Ανοίγουμε το Σάββατο στη Νάξο.");
const LIBRARY_TABLES = ["user_websites", "ai_presentations", "generated_posts", "user_documents", "research_reports", "data_analyses", "user_files"];

// WHAT THE ACCOUNT HAS, changed between the parts below. A table in
// `failing` answers as PostgREST does when it cannot.
const state = { made: {}, failing: new Set(), credits: 3000 };
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54451,
  handle: ({ url, json }) => {
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    if (table === "user_credits") return json(200, [{ user_id: MOCK_USER.id, credits_remaining: state.credits, credits_total: 3000 }]), true;
    if (!LIBRARY_TABLES.includes(table)) return false;
    if (state.failing.has(table)) return json(500, { code: "XX000", message: "the stand-in was told to fail", details: null, hint: null }), true;
    return json(200, state.made[table] ?? []), true;
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

const msgs = { el: JSON.parse(readFileSync("messages/el.json", "utf8")), en: JSON.parse(readFileSync("messages/en.json", "utf8")) };
// What the Greek interface itself writes in Latin letters on these screens.
const GREEK_UI_LATIN = ["Ionexa", "credits", "credit", "Site", "Chat", "Slides", "Posts", "PDF"];

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
    for (const locale of ["el", "en"]) {
      const M = msgs[locale];
      const L = M.dashboard.library;
      console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height}, ${locale} ==`);
      const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
      await context.addCookies(
        [
          { ...supa.authCookie, url: ON, httpOnly: false, secure: false, sameSite: "Lax" },
          { name: "NEXT_LOCALE", value: locale, url: ON },
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
      const items = page.locator('[data-testid="library-item"]');
      const kinds = async () => (await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")))).join(",");
      const heading = async () => (await page.locator("main h1").first().innerText()).trim();
      async function language(where) {
        const text = await screenText(page);
        const wrong = locale === "el" ? englishOnGreek(text, [...GREEK_UI_LATIN, ...CONTENT_WORDS]) : greekOnEnglish(text, CONTENT_WORDS);
        check(`${where}: nothing on the screen is in the other language`, wrong.length === 0, wrong.slice(0, 12).join(" | "));
      }

      // ---- 1. a new account that made nothing
      state.made = {};
      state.failing = new Set();
      await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
      // The heading is the sidebar row's name, as every page's is
      // (scripts/tests/sidebar-naming.test.mjs); the tab is the Library's.
      check("new account: the page has its sidebar row's name", (await heading()) === M.sidebar.items.mine, await heading());
      check("...it opens on the Library tab", (await page.getByRole("tab", { name: L.tab }).getAttribute("aria-selected")) === "true");
      check("...and says nothing was made yet, and where things will come from", (await page.getByText(L.empty.title).count()) === 1 && (await page.getByText(L.empty.why).count()) === 1);
      await language("new account");

      // ---- 2. made in three tools, arriving from the All tools square
      state.made = MADE;
      await page.goto(`${ON}/dashboard/tools`, { waitUntil: "networkidle" });
      await press(page.locator('[data-testid="tool-tile"][href="/dashboard/timeline"]'));
      await page.waitForURL(/\/dashboard\/timeline$/);
      await page.waitForLoadState("networkidle");
      await page.locator('[data-testid="library-items"]').waitFor({ timeout: 15000 }).catch(() => null);
      check("from the All tools square: the Library, with the three things made in three tools", (await kinds()) === "posts,site,slides", await kinds());
      check("...on the Library tab, the square's name", (await page.getByRole("tab", { name: M.dashboard.tools.names.library }).getAttribute("aria-selected")) === "true");
      check("...each says which tool made it", (await items.filter({ hasText: L.kinds.site }).count()) === 1 && (await items.filter({ hasText: L.kinds.slides }).count()) === 1 && (await items.filter({ hasText: L.kinds.posts }).count()) === 1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check("...and the page does not scroll sideways", overflow <= 1, `${overflow}px`);
      await language("three things made");
      await press(items.filter({ hasText: "Εγκαίνια του camping" }));
      await page.waitForURL(new RegExp(`/dashboard/posts\\?record=${POSTS_ID}`), { timeout: 15000 }).catch(() => null);
      check("pressed, the posts open in Posts", new URL(page.url()).pathname === "/dashboard/posts" && page.url().includes(POSTS_ID), page.url());

      // ---- 3. one tool's table does not answer
      state.failing = new Set(["ai_presentations"]);
      await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
      check("one table fails: the other two are shown", (await kinds()) === "posts,site", await kinds());
      const failedLine = L.failed.replace("{tools}", L.kinds.slides);
      check("...with a line that names the tool that did not load", (await page.getByText(failedLine).count()) === 1, failedLine);

      // ---- 4. no table answers
      state.failing = new Set(LIBRARY_TABLES);
      await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
      check("nothing answers: it does not say «nothing made yet»", (await page.getByText(L.empty.title).count()) === 0);
      check("...it says what did not load", (await page.locator('[role="status"]').filter({ hasText: L.kinds.site }).count()) === 1);
      await page.goto(`${ON}/dashboard/timeline?q=${encodeURIComponent("θάλασσα")}`, { waitUntil: "networkidle" });
      check("...and a search does not say «nothing says that» either", (await page.getByText(L.noMatch.title.replace("{query}", "θάλασσα")).count()) === 0);
      state.failing = new Set();

      // ---- 5. a Free account, and an account with no credits left
      MOCK_USER.user_metadata = { subscription_tier: "free" };
      state.made = { generated_posts: MADE.generated_posts };
      await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
      check("Free account: the Library opens, with what it made", (await kinds()) === "posts", await kinds());
      MOCK_USER.user_metadata = { subscription_tier: "growth" };
      state.credits = 0;
      state.made = MADE;
      await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
      check("no credits left: the Library opens, with all of it", (await kinds()) === "posts,site,slides", await kinds());
      state.credits = 3000;

      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
