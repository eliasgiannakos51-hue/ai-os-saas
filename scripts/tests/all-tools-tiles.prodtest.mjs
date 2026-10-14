/*
 * ALL TOOLS WITH ITS SQUARES HIDDEN, AND EVERYTHING ELSE STILL THERE, AS A
 * PERSON MEETS IT ON A COMPUTER AND A PHONE, IN GREEK AND IN ENGLISH.
 *
 * Run: node scripts/tests/all-tools-tiles.prodtest.mjs
 *      SKIP_BUILD=1 TILES_SHOTS=/tmp/shots node scripts/tests/all-tools-tiles.prodtest.mjs
 *
 * The owner, 2026-10-14: «Κρύψε όλα τα εργαλεία από το All tools, χωρίς να
 * σβήσεις τίποτα.» On a production build over the Supabase stand-in, with
 * the switch `all-tools-tiles` (src/lib/flags/flags.ts) in each position:
 *
 *   1. At its start (no row): the page, reached by the rail on a computer
 *      and the bottom tab on a phone, has no square, no group heading and
 *      no search — for the owner, the test account and a customer — and
 *      one line in the screen's language, nothing wider than the screen.
 *   2. «Κανείς», chosen: the same.
 *   3. «Όλοι»: every square is back, exactly the ones it had before — the
 *      grouped ones for a customer, and the new tools' too for the test
 *      account, whose switches let them in — with the four headings and the
 *      search, each square a square.
 *   4. «Εσύ και ο λογαριασμός δοκιμής»: the test account sees them, a
 *      customer not.
 *   5. With the switch at its start, every square's tool opens at its own
 *      address and answers, the Library still has what was made, and the
 *      Chat still opens the Site beside the conversation.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with Input.dispatchTouchEvent.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { standInRows, standInId } from "./lib/stand-in-rows.mjs";
import { startStandInModel } from "./lib/stand-in-model.mjs";
import { chromiumPath } from "./lib/chromium.mjs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + String(detail).slice(0, 600) : ""}`);
  }
}

// ---- who is who: the owner by ADMIN_EMAILS, the test account by
// TEST_ACCOUNT_EMAILS, and a customer who is neither.
const OWNER = "boss@example.com";
const TESTER = "tester@example.com";
const CUSTOMER = "someone@example.com";
const KEY = "all-tools-tiles";
const state = { flags: [], credits: 3000 };

const model = await startStandInModel(() => ({ text: "ok" }));
const db = standInRows({
  tables: { chat_conversations: [], chat_messages: [], user_websites: [] },
  defaults: { user_websites: () => ({ html_content: "", status: "pending", error_message: null, generation_notes: null, pages: null, attempt_count: 0 }) },
  rpc: {
    reserve_credits: () => [{ reservation_id: standInId() }],
    settle_reservation: () => null,
    release_reservation: () => null,
    increment_daily_ai_spend: () => null,
    consume_rate_limit: () => true,
  },
});
// One site the account made before the squares were hidden: the Library
// must still have it.
const MADE_SITE = {
  id: "00000000-0000-4000-8000-0000000000a1", user_id: MOCK_USER.id, name: "Camping Νάξος", description: "camping",
  html_content: "<!DOCTYPE html><html><body><h1>Camping Νάξος</h1></body></html>", status: "completed", pages: null,
  error_message: null, generation_notes: null, attempt_count: 1, created_at: "2026-10-10T09:00:00Z", updated_at: "2026-10-10T09:00:00Z",
};
const supa = await startMockSupabase({
  port: 54571,
  handle: (ctx) => {
    const p = ctx.url.pathname;
    if (p === "/rest/v1/user_credits") return ctx.json(200, [{ user_id: MOCK_USER.id, credits_remaining: state.credits, credits_total: 3000, plan_tier: MOCK_USER.user_metadata?.subscription_tier ?? "free", beta_expires_at: null }]), true;
    if (p === "/rest/v1/feature_flags") return ctx.json(200, state.flags), true;
    return db.handle(ctx);
  },
});
function account(email, flags = []) {
  MOCK_USER.email = email;
  MOCK_USER.user_metadata = { subscription_tier: "growth" };
  state.flags = flags;
}
const reset = () => {
  for (const t of Object.keys(db.store)) db.store[t].length = 0;
  db.store.user_websites.push({ ...MADE_SITE });
};

const PORT = await new Promise((resolve) => {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const ORIGIN = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  NEXT_PUBLIC_SITE_URL: ORIGIN,
  // Decided here, not by whatever this machine has set.
  ADMIN_EMAILS: OWNER,
  TEST_ACCOUNT_EMAILS: TESTER,
  // The model is the stand-in above; the key is a placeholder the routes
  // need to be present. Nothing leaves this machine.
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: model.url,
  UNSPLASH_ACCESS_KEY: "",
};

const LOCALES = ["el", "en"];
const M = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const ASK = { el: "φτιάξε μου site για το camping", en: "make me a website for my campsite" };
const { ALL_TOOLS_GROUPS, SWITCHED_SQUARES } = await loadTs("src/lib/nav/all-tools.ts");
const GROUPED = ALL_TOOLS_GROUPS.flatMap((g) => g.hrefs);
// What the grid drew before for the test account, whose switches are at
// staff: each group's own squares, then its new tools'.
const WITH_NEW = ALL_TOOLS_GROUPS.flatMap((g) => [...g.hrefs, ...SWITCHED_SQUARES.filter((s) => s.group === g.key).map((s) => s.href)]);
const EVERY_TOOL = [...new Set([...GROUPED, ...SWITCHED_SQUARES.map((s) => s.href)])];

// A Greek screen may carry the names of products and ⌘K's letter; an
// English one no Greek letter.
const PRODUCT_WORDS = new Set(["Ionexa", "AI", "K", "credits", "credit"]);
const wrongLanguage = (locale, text) =>
  locale === "el"
    ? [...new Set((text.match(/[A-Za-z][A-Za-z&]*/g) ?? []).filter((w) => !PRODUCT_WORDS.has(w)))]
    : [...new Set(text.match(/[Ͱ-Ͽἀ-῿]+/g) ?? [])];

const SHOT_DIR = process.env.TILES_SHOTS || "";
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

let server = null;
let browser = null;
const pageErrors = [];
const cleanup = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
  try { model.close(); } catch {}
};

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production) ...");
    const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + log.slice(-3000));
      cleanup();
      process.exit(1);
    }
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${ORIGIN}/api/health`, () => res()); r.on("error", rej); });
      up = true;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  if (!up) { console.log("  FAIL  the production server did not start"); cleanup(); process.exit(1); }

  browser = await chromium.launch({ executablePath: chromiumPath() });
  const DEVICES = [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ];

  for (const device of DEVICES) {
    for (const locale of LOCALES) {
      const L = M[locale];
      const tag = `${device.label}/${locale}`;
      console.log(`\n== ${tag} ${device.viewport.width}x${device.viewport.height} ==`);
      const context = await browser.newContext({
        viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, deviceScaleFactor: device.touch ? 3 : 1,
      });
      await context.addCookies([
        { ...supa.authCookie, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      const page = await context.newPage();
      page.on("pageerror", (err) => pageErrors.push(`${tag} ${page.url()}: ${String(err?.message ?? err)}`));
      const cdp = device.touch ? await context.newCDPSession(page) : null;
      async function press(locator) {
        await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
        if (!cdp) return locator.click();
        const box = await locator.boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
      const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${locale}-${name}.png`, fullPage: true });
      const mainText = () => page.locator("main").first().evaluate((n) => n.innerText ?? "").catch(() => "");
      // What the page draws: its squares, its group headings, its search,
      // the hidden page's line, and whether anything is wider than the screen.
      const drawn = () => page.evaluate(() => {
        const main = document.querySelector("main") ?? document.body;
        return {
          tiles: [...main.querySelectorAll('[data-testid="tool-tile"]')].map((a) => {
            const r = a.getBoundingClientRect();
            return { href: a.getAttribute("href"), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
          }),
          headings: [...main.querySelectorAll('section[aria-labelledby^="tools-"] h2')].map((h) => h.textContent.trim()),
          search: main.querySelectorAll('[data-testid="tools-search"], input[type="search"]').length,
          title: (main.querySelector("h1")?.textContent ?? "").trim(),
          line: (main.querySelector('[data-testid="tools-hidden"]')?.textContent ?? "").trim(),
          wide: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      });
      const visit = async () => {
        await page.goto(`${ORIGIN}/dashboard/tools`, { waitUntil: "networkidle" });
        return drawn();
      };
      const nothing = (d) => d.tiles.length === 0 && d.headings.length === 0 && d.search === 0;
      const summary = (d) => JSON.stringify({ tiles: d.tiles.length, headings: d.headings, search: d.search, line: d.line, wide: d.wide });

      // ---- 1. the switch at its start, reached the way a person reaches it
      account(OWNER);
      await page.goto(`${ORIGIN}/dashboard/overview`, { waitUntil: "networkidle" });
      const toTools = device.touch
        ? page.getByRole("navigation", { name: L.sidebar.tabs.label }).getByRole("link", { name: L.sidebar.tabs.tools, exact: true })
        : page.locator("aside").first().getByRole("link", { name: L.sidebar.rail.allTools, exact: true });
      const reachable = (await toTools.count()) > 0;
      check(`${tag}: All tools is still one press away (${device.touch ? "the bottom tab" : "the rail"})`, reachable);
      if (reachable) await press(toTools.first());
      await page.waitForURL(/\/dashboard\/tools$/, { timeout: 15000 }).catch(() => {});
      await page.getByTestId("tools-hidden").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      check(`${tag}: ...and the press opens it`, /\/dashboard\/tools$/.test(page.url()), page.url());
      const start = await drawn();
      check(`${tag}: the switch at its start, the owner: no square, no group, no search`, nothing(start), summary(start));
      check(`${tag}: ...the page's title and one line, in the screen's language`, start.title === L.dashboard.tools.title && start.line === L.dashboard.tools.tilesHidden, summary(start));
      const text = await mainText();
      check(`${tag}: ...nothing in the other language`, wrongLanguage(locale, text).length === 0, wrongLanguage(locale, text).join(", "));
      check(`${tag}: ...and nothing wider than the screen`, !start.wide);
      await shot("1-hidden");
      for (const [who, email] of [["the test account", TESTER], ["a customer", CUSTOMER]]) {
        account(email);
        const d = await visit();
        check(`${tag}: the switch at its start, ${who}: no square, no group, no search`, nothing(d) && d.line === L.dashboard.tools.tilesHidden, summary(d));
      }

      // ---- 2. «Κανείς», chosen
      for (const [who, email] of [["the owner", OWNER], ["a customer", CUSTOMER]]) {
        account(email, [{ key: KEY, audience: "off" }]);
        const d = await visit();
        check(`${tag}: «${L.dashboard.systemHealth.flags.audience.off}», ${who}: no square, no group, no search`, nothing(d), summary(d));
      }

      // ---- 3. «Όλοι»: every square back, as before
      account(CUSTOMER, [{ key: KEY, audience: "everyone" }]);
      const back = await visit();
      check(`${tag}: «${L.dashboard.systemHealth.flags.audience.everyone}», a customer: the ${GROUPED.length} squares, as before`,
        back.tiles.map((t) => t.href).join() === GROUPED.join(), back.tiles.map((t) => t.href).join(", "));
      check(`${tag}: ...under the four headings, with the search`,
        back.headings.join() === ["make", "ask", "organise", "business"].map((k) => L.dashboard.tools.groups[k]).join() && back.search === 1 && back.line === "", summary(back));
      const odd = back.tiles.filter((t) => Math.abs(t.w - t.h) > 1);
      check(`${tag}: ...each one a square, as drawn`, back.tiles.length > 0 && odd.length === 0, odd.map((t) => `${t.href} ${t.w}x${t.h}`).join(" · "));
      check(`${tag}: ...and nothing wider than the screen`, !back.wide);
      await shot("2-everyone");
      account(TESTER, [{ key: KEY, audience: "everyone" }]);
      const backNew = await visit();
      check(`${tag}: «${L.dashboard.systemHealth.flags.audience.everyone}», the test account: the new tools' squares too, as before (${WITH_NEW.length})`,
        backNew.tiles.map((t) => t.href).join() === WITH_NEW.join(), backNew.tiles.map((t) => t.href).join(", "));
      // The search works again: a word finds its square.
      const search = page.getByTestId("tools-search");
      if ((await search.count()) > 0) {
        await press(search);
        await search.fill(locale === "el" ? "ιστότ" : "site");
        await page.waitForTimeout(300);
      }
      const found = await page.locator('[data-testid="tool-tile"]').evaluateAll((els) => els.map((a) => a.getAttribute("href")));
      check(`${tag}: ...and the search finds the Site again`, found.includes("/dashboard/website-builder"), found.join(", "));

      // ---- 4. «Εσύ και ο λογαριασμός δοκιμής»
      account(TESTER, [{ key: KEY, audience: "staff" }]);
      const staffSees = await visit();
      account(CUSTOMER, [{ key: KEY, audience: "staff" }]);
      const customerSees = await visit();
      check(`${tag}: «${L.dashboard.systemHealth.flags.audience.staff}»: the test account sees the squares, a customer not`,
        staffSees.tiles.length === WITH_NEW.length && nothing(customerSees), `${summary(staffSees)} | ${summary(customerSees)}`);

      // ---- 5. with the switch at its start, nothing else is gone
      account(TESTER);
      reset();
      if (locale === "el") {
        // Every square's tool, at its own address. As the test account, so
        // the new tools' pages — each behind its own switch at staff — are
        // there too.
        const broken = [];
        for (const href of EVERY_TOOL) {
          const res = await page.goto(`${ORIGIN}${href}`, { waitUntil: "domcontentloaded" });
          let body = "";
          for (let i = 0; i < 20 && body.trim().length === 0; i++) {
            body = await mainText();
            if (body.trim().length === 0) await page.waitForTimeout(250);
          }
          const at = new URL(page.url()).pathname;
          if (!res || res.status() >= 400 || at !== href || body.trim().length === 0 || /Application error|404/.test(body)) broken.push(`${href} → ${at} ${res?.status()}`);
        }
        check(`${tag}: the switch at its start: every tool opens at its own address and answers (${EVERY_TOOL.length})`, broken.length === 0, broken.join(", "));
      }
      await page.goto(`${ORIGIN}/dashboard/timeline`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="library-items"]').waitFor({ timeout: 15000 }).catch(() => null);
      check(`${tag}: ...the Library still has what was made`, (await page.locator('[data-testid="library-item"][data-kind="site"]').count()) === 1);
      await page.goto(`${ORIGIN}/dashboard/chat`, { waitUntil: "networkidle" });
      const field = page.locator("textarea").first();
      await press(field);
      await field.fill(ASK[locale]);
      await field.press("Enter");
      const pane = await page.locator('[data-testid="chat-site-pane"]').waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false);
      check(`${tag}: ...and «${ASK[locale]}» in the Chat still opens the Site beside the conversation`, pane && new URL(page.url()).pathname === "/dashboard/chat", page.url());
      await shot("3-chat-opens-site");
      await context.close();
    }
  }
  check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} catch (err) {
  check("the walk finished", false, err?.stack ?? String(err));
} finally {
  try { await browser?.close(); } catch {}
  cleanup();
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
