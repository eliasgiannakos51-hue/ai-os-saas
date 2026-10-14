/*
 * CHAT OPENS THE SITE, THROUGH THE APP'S OWN ROUTES AND AROUND ITS EDGES
 * (MASTER 16, package 7): «γράφω "φτιάξε μου site για το camping" και
 * ανοίγει το Site δίπλα».
 *
 * Run: node scripts/tests/chat-opens-tools-edges.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/chat-opens-tools-edges.prodtest.mjs
 *
 * scripts/tests/chat-opens-tools.prodtest.mjs answers the Site's routes in
 * the browser and walks every press. Here nothing is answered in the
 * browser: /api/websites/generate, its worker and /api/websites/status are
 * the app's own, the model is the stand-in of
 * scripts/tests/lib/stand-in-model.mjs, and the database keeps the site
 * the routes write (scripts/tests/lib/stand-in-rows.mjs). The stand-in
 * port is shared with library-edges.prodtest.mjs and
 * brand-memory.prodtest.mjs: one build serves the three.
 *
 *   1. A new account, an empty Chat: the sentence opens the Site beside
 *      the conversation with its price; one press makes it through the
 *      real routes; the finished site is drawn; «Άνοιγμα στο Site» opens
 *      that site in the Site, and the Library has it. Greek and English.
 *   2. A Free account, whose plan has no Site: the pane says so — which
 *      plan, how much, and a button there — and offers nothing to press
 *      that the server would refuse.
 *   3. No credits left: the press is refused in the screen's language.
 *   4. The model fails while making it: the pane says it in the screen's
 *      language, and that nothing was charged.
 *   5. No credits left for a change said after the site is made: the
 *      credits notice, with the numbers, and the site as it was.
 *   6. The limits and the other refusals of a change (2026-10-14), Greek
 *      and English: the 24-hour limit on new sites and the hour's AI
 *      requests, each by its name with the time it opens again on the
 *      reader's clock; a change asked while another runs, by what it is —
 *      never the server's English, never «could not create the website».
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with real touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { standInRows, standInId } from "./lib/stand-in-rows.mjs";
import { startStandInModel } from "./lib/stand-in-model.mjs";
import { screenText, englishOnGreek, greekOnEnglish, wordsOf } from "./lib/screen-language.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const IntlMessageFormat = require("intl-messageformat").default ?? require("intl-messageformat").IntlMessageFormat;

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

const ASK = { el: "φτιάξε μου site για το camping", en: "make me a website for my campsite" };
const SITE_HTML = '<!DOCTYPE html>\n<html lang="el">\n<head>\n<meta charset="utf-8">\n<title>Camping</title>\n</head>\n<body>\n<header><h1>Camping Νάξος</h1></header>\n<main><section><p>Σκηνές δίπλα στη θάλασσα.</p></section></main>\n<footer><p>2026</p></footer>\n</body>\n</html>\n';
const state = { siteFails: false, credits: 3000, hourlyFull: false, editBusy: false };
const model = await startStandInModel(({ kind }) => {
  if (kind === "site") return state.siteFails ? { error: 529, type: "overloaded_error", message: "Overloaded" } : { text: SITE_HTML };
  // The clarification check, the off-topic check and the safety review ask
  // for a tool; a reply without one is read as "clear" by all three.
  return { text: "ok" };
});

const db = standInRows({
  tables: { user_websites: [], chat_conversations: [], chat_messages: [], rate_limit_log: [] },
  defaults: { user_websites: () => ({ html_content: "", status: "pending", error_message: null, generation_notes: null, pages: null, attempt_count: 0 }) },
  rpc: {
    reserve_credits: (args) => (state.credits >= args.p_credits ? [{ reservation_id: standInId() }] : [{ reservation_id: null, available: state.credits }]),
    settle_reservation: () => null,
    release_reservation: () => null,
    increment_daily_ai_spend: () => null,
    // The hour's AI requests (lib/rate-limit.ts), full while state.hourlyFull.
    consume_rate_limit: (args) => !(state.hourlyFull && args.p_scope === "ai_hourly_user"),
  },
});
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54451,
  handle: (ctx) => {
    if (ctx.url.pathname === "/rest/v1/user_credits") return ctx.json(200, [{ user_id: MOCK_USER.id, credits_remaining: state.credits, credits_total: 3000, plan_tier: MOCK_USER.user_metadata?.subscription_tier ?? "free", beta_expires_at: null }]), true;
    // Another change to the site still running: api/websites/edit claims the
    // site with one conditional update, and finds it already claimed.
    if (state.editBusy && ctx.req.method === "PATCH" && ctx.url.pathname === "/rest/v1/user_websites" && ctx.url.searchParams.has("or")) return ctx.json(200, []), true;
    return db.handle(ctx);
  },
});
const reset = () => {
  for (const t of Object.keys(db.store)) db.store[t].length = 0;
  db.calls.length = 0;
  model.seen.length = 0;
};

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
  // Nobody is the owner here; the switches are decided by the test account.
  ADMIN_EMAILS: "",
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: model.url,
  UNSPLASH_ACCESS_KEY: "",
};

const msgs = { el: JSON.parse(readFileSync("messages/el.json", "utf8")), en: JSON.parse(readFileSync("messages/en.json", "utf8")) };
// "pack": the Greek catalogue's own word for a credit pack (credits.outOfCredits);
// the plans keep their names in every language (src/lib/billing/plans.ts).
const PLAN_NAMES = [...readFileSync("src/lib/billing/plans.ts", "utf8").matchAll(/\bname: "([A-Za-z]+)"/g)].map((m) => m[1]);
const GREEK_UI_LATIN = ["Ionexa", "credits", "credit", "Site", "Chat", "Slides", "Posts", "PDF", "AI", "pack", ...PLAN_NAMES];
const CONTENT = wordsOf(ASK.el, ASK.en, "Camping Νάξος", "Σκηνές δίπλα στη θάλασσα. 2026");

const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { model.close(); } catch {}
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
    async function open(locale) {
      const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
      await context.addCookies(
        [
          { ...supa.authCookie, url: ON, httpOnly: false, secure: false, sameSite: "Lax" },
          { name: "NEXT_LOCALE", value: locale, url: ON },
        ].map(({ domain, path, ...c }) => c)
      );
      const page = await context.newPage();
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
      async function say(text) {
        const field = page.locator("textarea").first();
        await press(field);
        await field.fill(text);
        await field.press("Enter");
        await page.waitForTimeout(600);
      }
      const generateCalls = [];
      page.on("request", (r) => { if (new URL(r.url()).pathname === "/api/websites/generate") generateCalls.push(r.url()); });
      return { context, page, press, say, generateCalls };
    }
    const pane = (page) => page.locator('[data-testid="chat-site-pane"]');
    async function language(page, locale, where) {
      const text = await screenText(page, '[data-testid="chat-site-pane"]');
      const wrong = locale === "el" ? englishOnGreek(text, [...GREEK_UI_LATIN, ...CONTENT]) : greekOnEnglish(text, CONTENT);
      check(`${where}: nothing in the pane is in the other language`, wrong.length === 0, wrong.slice(0, 12).join(" | "));
    }

    // ---- 1. the walk, through the real routes
    for (const locale of ["el", "en"]) {
      const M = msgs[locale];
      const P = M.dashboard.chat.sitePane;
      console.log(`\n== 1. ${device.label} ${device.viewport.width}x${device.viewport.height}, ${locale}: a new account, through the real routes ==`);
      reset();
      MOCK_USER.user_metadata = { subscription_tier: "growth" };
      pageErrors.length = 0;
      const { context, page, press, say } = await open(locale);
      await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
      check("an empty Chat to start from", (await page.locator('[data-testid="chat-thread"] [data-role="user"]').count()) === 0);
      await say(ASK[locale]);
      await pane(page).waitFor({ timeout: 10000 }).catch(() => null);
      check("the sentence opens the Site beside the conversation", (await pane(page).count()) === 1 && new URL(page.url()).pathname === "/dashboard/chat");
      const offer = await pane(page).innerText().catch(() => "");
      check("...saying what it will make, and its price", offer.includes(P.willMake) && /credit/i.test(offer), offer.slice(0, 300));
      await language(page, locale, "the offer");
      await press(page.locator('[data-testid="chat-site-make"]'));
      const drawn = await page.locator('[data-testid="chat-site-preview"] iframe').waitFor({ timeout: 45000 }).then(() => true, () => false);
      check("one press makes it, through /api/websites/generate and its worker, and draws it", drawn && ((await page.locator('[data-testid="chat-site-preview"] iframe').getAttribute("srcdoc")) ?? "").includes("Σκηνές δίπλα στη θάλασσα."));
      check("...one site, made from the sentence", db.store.user_websites.length === 1 && db.store.user_websites[0].status === "completed", JSON.stringify(db.store.user_websites.map((w) => ({ name: w.name, status: w.status }))));
      check("...and the model was asked for a site once", model.seen.filter((s) => s.kind === "site").length === 1);
      check("...drawn sandboxed, with no scripts", (await page.locator('[data-testid="chat-site-preview"] iframe').getAttribute("sandbox")) === "");
      await language(page, locale, "the finished site");
      const id = db.store.user_websites[0]?.id ?? "none";
      await press(page.locator('[data-testid="chat-site-open"]'));
      await page.waitForURL(new RegExp(`/dashboard/website-builder\\?project=${id}`), { timeout: 15000 }).catch(() => null);
      await page.waitForLoadState("networkidle");
      const srcdoc = (await page.locator('[data-testid="site-preview"] iframe').getAttribute("srcdoc").catch(() => null)) ?? "";
      check("«Open in Site» opens that site in the Site", page.url().includes(`project=${id}`) && srcdoc.includes("Σκηνές δίπλα στη θάλασσα."), page.url());
      await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
      check("...and the Library has it", (await page.locator('[data-testid="library-item"][data-kind="site"]').count()) === 1);
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }

    const M = msgs.el;
    const P = M.dashboard.chat.sitePane;

    // ---- 2. a Free account
    console.log(`\n== 2. ${device.label}: a Free account ==`);
    reset();
    MOCK_USER.user_metadata = { subscription_tier: "free" };
    {
      const { context, page, press, say, generateCalls } = await open("el");
      await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
      await say(ASK.el);
      await pane(page).waitFor({ timeout: 10000 }).catch(() => null);
      const text = await pane(page).innerText().catch(() => "");
      check("Free: the Site opens and says it is not on this plan", text.includes(M.common.upgradeRequired.title), text.slice(0, 300));
      check("...with the plan's own button", (await pane(page).locator('a[href^="/pricing#plan-"]').count()) === 1);
      check("...naming the plan and its price", PLAN_NAMES.some((n) => text.includes(n)) && /€\s?\d/.test(text), text.slice(0, 300));
      const make = page.locator('[data-testid="chat-site-make"]');
      check("...and nothing to press that the server would refuse", (await make.count()) === 0);
      if ((await make.count()) === 1) {
        await press(make);
        await page.waitForTimeout(2500);
      }
      check("...nothing was asked of the Site's routes", generateCalls.length === 0, String(generateCalls.length));
      await language(page, "el", "Free");
      await context.close();
    }
    MOCK_USER.user_metadata = { subscription_tier: "growth" };

    // ---- 3. no credits left
    console.log(`\n== 3. ${device.label}: no credits left ==`);
    reset();
    state.credits = 0;
    {
      const { context, page, press, say } = await open("el");
      await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
      await say(ASK.el);
      await pane(page).waitFor({ timeout: 10000 }).catch(() => null);
      await press(page.locator('[data-testid="chat-site-make"]'));
      await page.waitForTimeout(3000);
      const text = await pane(page).innerText().catch(() => "");
      check("no credits: the pane says the credits ran out", text.includes(M.credits.outOfCredits.title), text.slice(0, 400));
      // The numbers the route sent: 0 left, and what it needed.
      const withNumbers = M.credits.outOfCredits.detailWithNumbers.split("{needed}")[0].replace("{available}", "0");
      check("...with the numbers", text.includes(withNumbers), `${withNumbers} ∉ ${text.slice(0, 400)}`);
      check("...and nothing was made", db.store.user_websites.length === 0 && !model.seen.some((s) => s.kind === "site"));
      await language(page, "el", "no credits");
      await context.close();
    }
    state.credits = 3000;

    // ---- 4. the model fails while making it
    console.log(`\n== 4. ${device.label}: the model fails while making it ==`);
    reset();
    state.siteFails = true;
    {
      const { context, page, press, say } = await open("el");
      await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
      await say(ASK.el);
      await pane(page).waitFor({ timeout: 10000 }).catch(() => null);
      await press(page.locator('[data-testid="chat-site-make"]'));
      // The worker's own end: building, then failed — watched, not waited out.
      await page.waitForFunction(() => !document.querySelector('[data-testid="chat-site-pane"] [role="status"] .animate-spin, [data-testid="chat-site-stop"]'), null, { timeout: 45000 }).catch(() => null);
      await page.waitForTimeout(3000);
      const text = await pane(page).innerText().catch(() => "");
      check("the model failed: the pane says the site could not be made, and that making it was not charged", text.includes(P.failed), text.slice(0, 400));
      check("...and that is true: the hold was released and the making was never settled",
        db.calls.some((c) => c.name === "release_reservation") && !db.calls.some((c) => c.name === "settle_reservation" && c.args.p_feature === "website_generate"),
        JSON.stringify(db.calls.map((c) => `${c.name}:${c.args.p_feature ?? ""}`)));
      await language(page, "el", "the model failed");
      await context.close();
    }
    state.siteFails = false;

    // ---- 5. no credits left for a change said after the site is made
    // (2026-10-09). /api/websites/edit refuses before any model call; the
    // pane said «could not create the website» on a Greek screen — the
    // site existed, and the reason was gone.
    console.log(`\n== 5. ${device.label}: no credits left for a change ==`);
    reset();
    {
      const { context, page, press, say } = await open("el");
      await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
      await say(ASK.el);
      await pane(page).waitFor({ timeout: 10000 }).catch(() => null);
      await press(page.locator('[data-testid="chat-site-make"]'));
      await page.locator('[data-testid="chat-site-preview"] iframe').waitFor({ timeout: 45000 }).catch(() => null);
      state.credits = 0;
      if (device.touch) {
        await press(page.locator('[data-testid="chat-site-back"]'));
        await page.waitForTimeout(300);
      }
      const editCalls = [];
      page.on("request", (r) => { if (new URL(r.url()).pathname === "/api/websites/edit") editCalls.push(r.url()); });
      await say("κάνε τα χρώματα πιο σκούρα");
      await page.waitForTimeout(3000);
      const text = await pane(page).innerText().catch(() => "");
      check("no credits for a change: the change was asked of the Site's own route", editCalls.length === 1, String(editCalls.length));
      check("...and the pane says the credits ran out", text.includes(M.credits.outOfCredits.title), text.slice(0, 400));
      const withNumbers = M.credits.outOfCredits.detailWithNumbers.split("{needed}")[0].replace("{available}", "0");
      check("...with the numbers", text.includes(withNumbers), `${withNumbers} ∉ ${text.slice(0, 400)}`);
      check("...not that the site could not be made", !text.includes(M.dashboard.websiteBuilder.generateFailed) && !text.includes(P.failed), text.slice(0, 400));
      const srcdoc = (await page.locator('[data-testid="chat-site-preview"] iframe').getAttribute("srcdoc").catch(() => null)) ?? "";
      check("...and the site is still shown, as it was", srcdoc.includes("Σκηνές δίπλα στη θάλασσα.") && db.store.user_websites.length === 1);
      await language(page, "el", "no credits for a change");
      await context.close();
    }
    state.credits = 3000;

    // ---- 6. the limits and the other refusals of a change, in both
    // languages (2026-10-14)
    for (const locale of ["el", "en"]) {
      const L = msgs[locale];
      console.log(`\n== 6. ${device.label}, ${locale}: the limits, with when they open, and a change while another runs ==`);
      const opensLine = async (page, iso) => {
        const values = await page.evaluate(({ iso, locale }) => {
          const at = new Date(Math.ceil(Date.parse(iso) / 60000) * 60000);
          const clock = locale.startsWith("en") ? { timeStyle: "short" } : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
          const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
          return { time: new Intl.DateTimeFormat(locale, clock).format(at), day: day(at) === day(new Date()) ? "today" : "tomorrow" };
        }, { iso, locale });
        return new IntlMessageFormat(L.errors.retryAt, locale).format(values);
      };
      const old = { el: "Περίμενε περίπου ένα λεπτό", en: "Wait about a minute" }[locale];

      // 6a. Fifty sites in the last 24 hours, the oldest 23 hours ago: it
      // opens again in an hour.
      reset();
      const oldest = Date.now() - 23 * 3600_000;
      for (let i = 0; i < 50; i++) {
        db.store.user_websites.push({ id: standInId(), user_id: MOCK_USER.id, name: `site ${i}`, status: "completed", html_content: SITE_HTML, created_at: new Date(oldest + i * 60_000).toISOString(), error_message: null, generation_notes: null, pages: null });
      }
      {
        const { context, page, press, say } = await open(locale);
        await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
        await say(ASK[locale]);
        await pane(page).waitFor({ timeout: 10000 }).catch(() => null);
        const refused = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/websites/generate", { timeout: 20000 }).then((r) => r.json()).catch(() => null);
        await press(page.locator('[data-testid="chat-site-make"]'));
        const body = await refused;
        await page.waitForTimeout(1500);
        const text = await pane(page).innerText().catch(() => "");
        const line = await opensLine(page, new Date(oldest + 24 * 3600_000).toISOString());
        check(`the 24-hour limit on new sites: the route names it and when it opens (${body?.code})`,
          body?.code === "siteDailyLimit" && Math.abs(Date.parse(body?.retryAt ?? "") - (oldest + 24 * 3600_000)) < 1000, JSON.stringify(body));
        check(`...the pane says it in ${locale}: «${L.errors.codes.siteDailyLimit.what} ${line}»`,
          text.includes(L.errors.codes.siteDailyLimit.what) && text.includes(line), text.slice(0, 400));
        check("...not «about a minute», not «could not create the website», not the route's own sentence",
          !text.includes(old) && !text.includes(L.dashboard.websiteBuilder.generateFailed) && typeof body?.message === "string" && !text.includes(body.message), text.slice(0, 400));
        check("...and nothing was made", db.store.user_websites.length === 50 && !model.seen.some((x) => x.kind === "site"));
        await language(page, locale, "the 24-hour limit");
        await context.close();
      }

      // 6b. The hour's AI requests: twenty, the oldest 45 minutes ago — it
      // opens again in 15 minutes. Full only once the pane is open, so the
      // sentence that opens it is not the thing refused.
      reset();
      {
        const { context, page, press, say } = await open(locale);
        await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
        await say(ASK[locale]);
        await pane(page).waitFor({ timeout: 10000 }).catch(() => null);
        const first = Date.now() - 45 * 60_000;
        for (let i = 0; i < 20; i++) db.store.rate_limit_log.push({ id: standInId(), scope: "ai_hourly_user", identifier: MOCK_USER.id, created_at: new Date(first + i * 60_000).toISOString() });
        state.hourlyFull = true;
        const refused = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/websites/generate", { timeout: 20000 }).then((r) => r.json()).catch(() => null);
        await press(page.locator('[data-testid="chat-site-make"]'));
        const body = await refused;
        await page.waitForTimeout(1500);
        const text = await pane(page).innerText().catch(() => "");
        const line = await opensLine(page, new Date(first + 60 * 60_000).toISOString());
        check(`the hour's AI requests: the route names the limit and when it opens (${body?.code})`,
          body?.code === "hourlyLimit" && Math.abs(Date.parse(body?.retryAt ?? "") - (first + 60 * 60_000)) < 1000, JSON.stringify(body));
        check(`...the pane says it in ${locale}: «${L.errors.codes.hourlyLimit.what} ${line}»`,
          text.includes(L.errors.codes.hourlyLimit.what) && text.includes(line), text.slice(0, 400));
        check("...not «about a minute», not «could not create the website»", !text.includes(old) && !text.includes(L.dashboard.websiteBuilder.generateFailed), text.slice(0, 400));
        await language(page, locale, "the hour's limit");
        state.hourlyFull = false;
        await context.close();
      }

      // 6c. A change asked while another change to the site still runs.
      reset();
      {
        const { context, page, press, say } = await open(locale);
        await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
        await say(ASK[locale]);
        await pane(page).waitFor({ timeout: 10000 }).catch(() => null);
        await press(page.locator('[data-testid="chat-site-make"]'));
        await page.locator('[data-testid="chat-site-preview"] iframe').waitFor({ timeout: 45000 }).catch(() => null);
        if (device.touch) {
          await press(page.locator('[data-testid="chat-site-back"]'));
          await page.waitForTimeout(300);
        }
        state.editBusy = true;
        const answered = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/websites/edit", { timeout: 20000 }).then((r) => r.json()).catch(() => null);
        await say(locale === "el" ? "κάνε τα χρώματα πιο σκούρα" : "make the colours darker");
        const editBody = await answered;
        await page.waitForTimeout(2000);
        const text = await pane(page).innerText().catch(() => "");
        const busy = `${L.dashboard.toolShell.site.busy} ${L.errors.credits.notCharged}`;
        check(`a change while another runs: the pane says what it is, in ${locale}: «${busy}»`, text.includes(busy), text.slice(0, 400));
        check(`...the route said busy (${editBody?.busy}), and the pane says neither «could not create the website» nor the route's own sentence`,
          editBody?.busy === true && !text.includes(L.dashboard.websiteBuilder.generateFailed) && typeof editBody?.message === "string" && !text.includes(editBody.message), text.slice(0, 400));
        const srcdoc = (await page.locator('[data-testid="chat-site-preview"] iframe').getAttribute("srcdoc").catch(() => null)) ?? "";
        check("...and the site is still shown, as it was", srcdoc.includes("Σκηνές δίπλα στη θάλασσα."));
        await language(page, locale, "a change while another runs");
        state.editBusy = false;
        await context.close();
      }
    }
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
