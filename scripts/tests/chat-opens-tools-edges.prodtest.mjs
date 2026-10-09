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
const state = { siteFails: false, credits: 3000 };
const model = await startStandInModel(({ kind }) => {
  if (kind === "site") return state.siteFails ? { error: 529, type: "overloaded_error", message: "Overloaded" } : { text: SITE_HTML };
  // The clarification check, the off-topic check and the safety review ask
  // for a tool; a reply without one is read as "clear" by all three.
  return { text: "ok" };
});

const db = standInRows({
  tables: { user_websites: [], chat_conversations: [], chat_messages: [] },
  defaults: { user_websites: () => ({ html_content: "", status: "pending", error_message: null, generation_notes: null, pages: null, attempt_count: 0 }) },
  rpc: {
    reserve_credits: (args) => (state.credits >= args.p_credits ? [{ reservation_id: standInId() }] : [{ reservation_id: null, available: state.credits }]),
    settle_reservation: () => null,
    release_reservation: () => null,
    increment_daily_ai_spend: () => null,
    consume_rate_limit: () => true,
  },
});
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54451,
  handle: (ctx) => {
    if (ctx.url.pathname === "/rest/v1/user_credits") return ctx.json(200, [{ user_id: MOCK_USER.id, credits_remaining: state.credits, credits_total: 3000, plan_tier: MOCK_USER.user_metadata?.subscription_tier ?? "free", beta_expires_at: null }]), true;
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
