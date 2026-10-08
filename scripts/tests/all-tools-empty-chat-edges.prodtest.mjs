/*
 * PACKAGES 1 AND 2 AROUND THE EDGES: ALL TOOLS AND THE EMPTY CHAT, AS A
 * PERSON MEETS THEM, IN GREEK AND IN ENGLISH, ON A COMPUTER AND A PHONE.
 *
 * Run: node scripts/tests/all-tools-empty-chat-edges.prodtest.mjs
 *      SKIP_BUILD=1 EDGE_SHOTS=/tmp/shots node scripts/tests/all-tools-empty-chat-edges.prodtest.mjs
 *
 * design-home.prodtest.mjs walks MASTER Μέρος 16, lines 1 and 2, as they
 * are written, in Greek, for one paid account. This walks what is around
 * them (the owner, 2026-10-08: «Έλεγξε και τα γύρω του: άδεια κατάσταση,
 * σφάλμα παρόχου, τέλος credits, δωρεάν λογαριασμός, ελληνικά και
 * αγγλικά»), on a production build over the Supabase stand-in:
 *
 *   ALL TOOLS (line 1: «βλέπω μόνο μεγάλα τετράγωνα με τα σημαντικά
 *   εργαλεία, χωρίς beta»)
 *   1. Reached the way a person reaches it: the rail on a computer, the
 *      bottom tab on a phone, pressed.
 *   2. Every square IS a square, measured as drawn (width against
 *      height), four to a row on a computer and two on a phone.
 *   3. Every name is the screen's language's; a Greek screen carries no
 *      English word but the names of products, and an English one no
 *      Greek letter. No «beta» anywhere.
 *   4. A search that finds nothing says so with the words typed in it.
 *   5. A pin that cannot be saved goes back and says so.
 *   6. A Free account sees the same squares, and every square opens a
 *      page that answers.
 *   7. A tool behind a switch (lib/flags/flags.ts) gets its square
 *      exactly when the switch is on for this person (MASTER 14.1:
 *      «Κάθε νέο εργαλείο μπαίνει εδώ μόλις γίνει λειτουργικό»).
 *
 *   THE EMPTY CHAT (line 2: «βλέπω στο κέντρο τη γη με τον χαιρετισμό
 *   και το πεδίο, τίποτα άλλο»)
 *   8. Nothing else in the whole Chat column, under the field included —
 *      for a paid account, a Free one, a new one with no name, and one
 *      with every switch on.
 *   9. The greeting is the screen's language's, with the person's name
 *      when there is one, and never the email.
 *  10. Out of credits: the first message is refused in the screen's
 *      language, through the real /api/chat.
 *  11. The model provider fails: the first message reaches a stand-in
 *      provider that answers Anthropic's own overloaded error, and the
 *      screen says so in its language and keeps what was written.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with Input.dispatchTouchEvent.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
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
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

// ---- the accounts, as the stand-in answers them
const MEMBER = "owner@example.com";
const STAFF = "tester@example.com";
const STATE = { credits: 3000, freeUsed: 0, flags: [], conversationSeq: 0, consumed: 0, released: 0, limit: 0, atCapacity: false };
function account({ email = MEMBER, tier = "growth", name = null, credits = 3000, freeUsed = 0, flags = [] } = {}) {
  MOCK_USER.email = email;
  MOCK_USER.user_metadata = { subscription_tier: tier, ...(name ? { display_name: name } : {}) };
  STATE.credits = credits;
  STATE.freeUsed = freeUsed;
  STATE.flags = flags;
  STATE.atCapacity = false;
}
// The same answer shape the stand-in gives for a table: an object when
// the client asked for one row, a count in the header when it asked.
function rows(req, res, list) {
  if ((req.headers.prefer ?? "").includes("count=")) {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Range": list.length ? `0-${list.length - 1}/${list.length}` : "*/0" });
    res.end(JSON.stringify(req.method === "HEAD" ? null : list));
    return true;
  }
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  res.writeHead(single && !list[0] ? 406 : 200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(single ? (list[0] ?? { message: "no rows" }) : list));
  return true;
}
function handle({ req, res, url, body }) {
  const p = url.pathname;
  if (p === "/rest/v1/user_credits" && (req.method === "GET" || req.method === "HEAD")) {
    return rows(req, res, [{
      user_id: MOCK_USER.id,
      credits_remaining: STATE.credits,
      credits_total: 3000,
      plan_tier: MOCK_USER.user_metadata?.subscription_tier ?? "free",
      beta_expires_at: null,
      free_chat_used: STATE.freeUsed,
      free_chat_period_start: new Date().toISOString(),
    }]);
  }
  if (p === "/rest/v1/feature_flags") return rows(req, res, STATE.flags);
  // The platform's calls today, which lib/ai-circuit-breaker.ts holds
  // against MAX_DAILY_AI_CALLS before any AI call.
  if (p === "/rest/v1/daily_ai_spend_tracking" && req.method === "GET") return rows(req, res, STATE.atCapacity ? [{ total_calls: 10_000_000 }] : []);
  // The free message, claimed and given back as the RPCs of
  // supabase/migrations do it: one row, granted or not.
  if (p === "/rest/v1/rpc/consume_free_chat") {
    let limit = 0;
    try { limit = Number(JSON.parse(body || "{}").p_limit ?? 0); } catch {}
    const granted = STATE.freeUsed < limit;
    STATE.limit = limit;
    if (granted) { STATE.freeUsed++; STATE.consumed++; }
    return rows(req, res, [{ granted, used: STATE.freeUsed, remaining: Math.max(limit - STATE.freeUsed, 0) }]);
  }
  if (p === "/rest/v1/rpc/release_free_chat") {
    STATE.freeUsed = Math.max(0, STATE.freeUsed - 1);
    STATE.released++;
    return rows(req, res, []);
  }
  if (p === "/rest/v1/chat_conversations" && req.method === "POST") {
    STATE.conversationSeq++;
    const id = `00000000-0000-4000-8000-${String(STATE.conversationSeq).padStart(12, "0")}`;
    const now = new Date().toISOString();
    return rows(req, res, [{ id, user_id: MOCK_USER.id, title: "…", is_pinned: false, created_at: now, updated_at: now }]);
  }
  return false;
}

const supa = await startMockSupabase({ port: 54411, handle });

// ---- a stand-in for the model provider, answering in Anthropic's own
// error shape: HTTP 529 with {"type":"error","error":{"type":
// "overloaded_error",...}} — what api.anthropic.com sends when it is
// overloaded, and what @anthropic-ai/sdk turns into an APIError.
const providerHits = [];
const provider = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    providerHits.push(`${req.method} ${req.url}`);
    res.writeHead(529, { "content-type": "application/json", "request-id": "req_stand_in" });
    res.end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
  });
});
const PROVIDER_PORT = await new Promise((resolve) => provider.listen(0, "127.0.0.1", () => resolve(provider.address().port)));

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
  // Who is staff is decided here, not by whatever this machine has set:
  // nobody is an admin, and the test account is STAFF.
  ADMIN_EMAILS: "",
  TEST_ACCOUNT_EMAILS: STAFF,
  // The model is the stand-in above. The key is a placeholder the route
  // needs to be present; nothing leaves this machine.
  ANTHROPIC_API_KEY: "sk-ant-stand-in-not-a-key",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${PROVIDER_PORT}`,
};

const LOCALES = ["el", "en"];
const M = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
// The squares as lib/nav/all-tools.ts groups them, and the new tools 14.1
// says enter All tools once they work, each behind its own switch.
const { ALL_TOOLS_GROUPS, ALL_TOOLS_NAMES, SWITCHED_SQUARES: SWITCHED } = await loadTs("src/lib/nav/all-tools.ts");
const GROUPED = ALL_TOOLS_GROUPS.flatMap((g) => g.hrefs);

// A Greek screen may carry the names of products and the word the product
// itself uses for its currency; nothing else in Latin letters.
const PRODUCT_WORDS = new Set(["Ionexa", "AI", "PDF", "PowerPoint", "Word", "Excel", "Unsplash", "K", "credits", "credit", "Google", "Calendar", "Gmail", "Drive", "Slack"]);
const latinWords = (text) => [...new Set((text.match(/[A-Za-z][A-Za-z&]*/g) ?? []).filter((w) => !PRODUCT_WORDS.has(w)))];
const greekLetters = (text) => [...new Set(text.match(/[Ͱ-Ͽἀ-῿]+/g) ?? [])];
const wrongLanguage = (locale, text) => (locale === "el" ? latinWords(text) : greekLetters(text));

const SHOT_DIR = process.env.EDGE_SHOTS || "";
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

let server = null;
let browser = null;
const cleanup = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
  try { provider.close(); } catch {}
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
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false, perRow: 4 },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true, perRow: 2 },
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
      const cdp = device.touch ? await context.newCDPSession(page) : null;
      // A real finger on the phone, a mouse on the desktop.
      async function press(locator) {
        await locator.scrollIntoViewIfNeeded();
        if (!cdp) return locator.click();
        const box = await locator.boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
      const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${locale}-${name}.png` });
      const mainText = () => page.locator("main").first().evaluate((n) => n.innerText ?? "");
      // The rail's row on a computer; the bottom tab on a phone, where the
      // rail is a drawer behind the menu button.
      const navLink = (href, railKey, tabKey) =>
        device.touch
          ? page.getByRole("navigation", { name: L.sidebar.tabs.label }).getByRole("link", { name: L.sidebar.tabs[tabKey], exact: true })
          : page.locator("aside").first().getByRole("link", { name: L.sidebar.rail[railKey], exact: true });

      // =============================== ALL TOOLS ===============================
      account({ tier: "growth" });
      await page.goto(`${ORIGIN}/dashboard/overview`, { waitUntil: "networkidle" });
      const toTools = navLink("/dashboard/tools", "allTools", "tools");
      const reachable = (await toTools.count()) > 0;
      check(`${tag}: All tools is one press away (${device.touch ? "the bottom tab" : "the rail"})`, reachable);
      if (reachable) await press(toTools.first());
      await page.waitForURL(/\/dashboard\/tools$/, { timeout: 15000 }).catch(() => {});
      // The squares, not the network, say the page is there: a client-side
      // move goes quiet before the page under it has drawn.
      await page.locator('[data-testid="tool-tile"]').first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      check(`${tag}: ...and the press opens it`, /\/dashboard\/tools$/.test(page.url()), page.url());

      const tiles = () => page.locator('[data-testid="tool-tile"]').evaluateAll((els) => els.map((a) => {
        const r = a.getBoundingClientRect();
        return {
          href: a.getAttribute("href"),
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
          top: Math.round(r.top + window.scrollY),
          group: a.closest("section")?.getAttribute("aria-labelledby") ?? "",
          name: (a.querySelector("span > span")?.textContent ?? "").trim(),
        };
      }));
      const drawn = await tiles();
      check(`${tag}: the ${GROUPED.length} squares are drawn (${drawn.length})`, drawn.length === GROUPED.length && drawn.every((t, i) => t.href === GROUPED[i]),
        drawn.map((t) => t.href).join(", "));
      const notSquare = drawn.filter((t) => Math.abs(t.w - t.h) > 1);
      check(`${tag}: every one of them IS a square, as drawn (width = height)`, drawn.length > 0 && notSquare.length === 0,
        notSquare.map((t) => `${t.name} ${t.w}x${t.h}`).join(" · "));
      const organise = drawn.filter((t) => t.group === "tools-organise");
      const firstRow = organise.filter((t) => t.top === organise[0]?.top).length;
      check(`${tag}: ...${device.perRow} to a row`, firstRow === device.perRow, `${firstRow} in the first row of ${organise.length}`);
      const wrongName = drawn.filter((t) => t.name !== L.dashboard.tools.names[ALL_TOOLS_NAMES[t.href]]);
      check(`${tag}: every square carries its ${locale} name`, drawn.length > 0 && wrongName.length === 0,
        wrongName.map((t) => `${t.href}="${t.name}"`).join(", "));
      const toolsText = await mainText();
      check(`${tag}: no word of another language on the page`, wrongLanguage(locale, toolsText).length === 0, wrongLanguage(locale, toolsText).join(", "));
      check(`${tag}: no «beta» and no «in testing» anywhere`, !/\bbeta\b|in testing|σε δοκιμή/i.test(await page.evaluate(() => document.body.innerText)));
      await shot("1-all-tools");

      // ---- a search that finds nothing
      const search = page.getByTestId("tools-search");
      await press(search);
      await search.fill("qqzzxx");
      const noMatch = L.dashboard.tools.noMatch.replace("{query}", "qqzzxx");
      const said = await page.getByText(noMatch, { exact: true }).waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
      check(`${tag}: a search that finds nothing says so, with the words typed`, said && !(await mainText()).includes("{query}"), noMatch);
      await search.fill("");

      // ---- a pin that cannot be saved
      await page.route("**/api/nav/recent-tools", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "stand-in failure" }) }));
      const pin = page.getByTestId("tool-pin").first();
      const answered = page.waitForResponse((r) => r.url().includes("/api/nav/recent-tools"), { timeout: 10000 }).catch(() => null);
      await press(pin);
      await answered;
      const toast = await page.getByRole("status").filter({ hasText: L.sidebar.rail.saveFailed }).first()
        .waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
      check(`${tag}: a pin the server refuses goes back, and the screen says so`, toast && (await pin.getAttribute("aria-pressed")) === "false");
      await page.unroute("**/api/nav/recent-tools");

      // ---- a tool behind a switch: its square exactly when the switch is on
      for (const who of [
        { label: "a member, the switches at their default (staff)", email: MEMBER, flags: [], shown: false },
        { label: "the test account, the switches at their default (staff)", email: STAFF, flags: [], shown: true },
        { label: "the test account, the switches off", email: STAFF, flags: SWITCHED.map((s) => ({ key: s.flag, audience: "off" })), shown: false },
        { label: "a member, the switches open to everyone", email: MEMBER, flags: SWITCHED.map((s) => ({ key: s.flag, audience: "everyone" })), shown: true },
      ]) {
        account({ email: who.email, tier: "growth", flags: who.flags });
        await page.goto(`${ORIGIN}/dashboard/tools`, { waitUntil: "networkidle" });
        const now = await tiles();
        const present = SWITCHED.filter((s) => now.some((t) => t.href === s.href && t.name === L.dashboard.tools.names?.[s.name]));
        check(`${tag}: ${who.label}: ${who.shown ? "Image and Connections have their squares" : "no square for a tool switched off"}`,
          who.shown ? present.length === SWITCHED.length : present.length === 0 && now.every((t) => !SWITCHED.some((s) => s.href === t.href)),
          now.map((t) => `${t.href}="${t.name}"`).join(", "));
        if (who.shown) {
          const odd = now.filter((t) => Math.abs(t.w - t.h) > 1);
          check(`${tag}: ...and they are squares too`, odd.length === 0, odd.map((t) => `${t.name} ${t.w}x${t.h}`).join(" · "));
        }
      }
      await shot("2-all-tools-switched");

      // ---- a Free account: the same squares, and every one opens
      account({ tier: "free" });
      await page.goto(`${ORIGIN}/dashboard/tools`, { waitUntil: "networkidle" });
      const free = await tiles();
      check(`${tag}: a Free account sees the same squares`, free.map((t) => t.href).join() === GROUPED.join(), free.map((t) => t.href).join(", "));
      const research = page.locator('[data-testid="tool-tile"][href="/dashboard/deep-research"]');
      if ((await research.count()) > 0) await press(research);
      await page.waitForURL(/\/dashboard\/deep-research/, { timeout: 15000 }).catch(() => {});
      check(`${tag}: pressing a square opens its tool`, /\/dashboard\/deep-research/.test(page.url()), page.url());
      if (device.label === "desktop" && locale === "el") {
        const broken = [];
        for (const href of GROUPED) {
          const res = await page.goto(`${ORIGIN}${href}`, { waitUntil: "domcontentloaded" });
          // Some pages draw their body in the browser: give them a moment.
          let text = "";
          for (let i = 0; i < 20 && text.trim().length === 0; i++) {
            text = await mainText().catch(() => "");
            if (text.trim().length === 0) await page.waitForTimeout(250);
          }
          if (!res || res.status() >= 400 || text.trim().length === 0 || /Application error/.test(text)) broken.push(`${href} ${res?.status()}`);
        }
        check(`${tag}: for a Free account every square opens a page that answers (${GROUPED.length})`, broken.length === 0, broken.join(", "));
      }

      // =============================== THE EMPTY CHAT ===============================
      // Everything drawn in the Chat column but the bar over it, the earth
      // and greeting, and the field itself.
      const extras = () => page.evaluate(() => {
        const thread = document.querySelector('[data-testid="chat-thread"]');
        const empty = document.querySelector('[data-testid="chat-empty"]');
        const column = thread?.parentElement?.parentElement;
        const field = column?.querySelector("form textarea")?.parentElement;
        if (!thread || !empty || !column || !field) return null;
        const bar = column.firstElementChild;
        const seen = [];
        for (const el of column.querySelectorAll("*")) {
          if (bar.contains(el) || empty.contains(el) || field.contains(el)) continue;
          if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width <= 1 || r.height <= 1 || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
          const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
          const drawnThing = /^(svg|img|button|a|input|select|canvas|video)$/i.test(el.tagName);
          if (own || drawnThing) seen.push(`${el.tagName.toLowerCase()}${own ? ` "${own.slice(0, 80)}"` : ""}`);
        }
        return { seen, greeting: (empty.querySelector("h1")?.textContent ?? "").trim(), column: column.innerText ?? "" };
      });
      const greetings = Object.values(L.promise.greeting);
      const openChat = async () => {
        await page.goto(`${ORIGIN}/dashboard/overview`, { waitUntil: "networkidle" });
        const toChat = navLink("/dashboard/chat", "chat", "chat");
        if ((await toChat.count()) > 0) await press(toChat.first());
        await page.waitForURL(/\/dashboard\/chat/, { timeout: 15000 }).catch(() => {});
        return page.getByTestId("chat-empty").waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
      };

      for (const who of [
        { label: "a paid account", set: { tier: "growth", name: "Ελένη" }, name: "Ελένη" },
        { label: "a new account with no name", set: { tier: "growth" }, name: null },
        { label: "a Free account", set: { tier: "free", name: "Ελένη" }, name: "Ελένη" },
        { label: "the test account, every switch on", set: { email: STAFF, tier: "growth", name: "Ελένη" }, name: "Ελένη" },
      ]) {
        account(who.set);
        const shown = await openChat();
        check(`${tag}: ${who.label}: the Chat opens empty, one press from Home`, shown && /\/dashboard\/chat/.test(page.url()), page.url());
        const e = shown ? await extras() : null;
        check(`${tag}: ${who.label}: the earth, the greeting and the field — nothing else in the column, under the field included`,
          Boolean(e) && e.seen.length === 0, JSON.stringify(e?.seen));
        const g = e?.greeting ?? "";
        const expected = greetings.find((x) => g.startsWith(x));
        check(`${tag}: ${who.label}: the greeting is the ${locale} one${who.name ? ", with the name" : ", with no name and no email"}`,
          Boolean(expected) && g === (who.name ? `${expected}, ${who.name}` : expected) && !g.includes("@"), `"${g}"`);
        const words = wrongLanguage(locale, (e?.column ?? "").replace(who.name ?? "\u0000", ""));
        check(`${tag}: ${who.label}: nothing in another language`, words.length === 0, words.join(", "));
        await shot(`3-chat-${who.label.replace(/\W+/g, "-")}`);
      }

      // ---- a Free account whose free messages are used up and no credits:
      // told before typing, in one line, and refused in its language.
      account({ tier: "free", credits: 0, freeUsed: 100000 });
      await openChat();
      const used = await extras();
      const exhausted = L.credits.freeChat.exhausted;
      check(`${tag}: free messages used up: the one line that says so, and nothing more`,
        Boolean(used) && used.seen.filter((s) => !s.startsWith("svg")).length === 1 && used.seen.some((s) => s.includes(exhausted.slice(0, 40))),
        JSON.stringify(used?.seen));
      const field = page.locator("form textarea").first();
      const ask = locale === "el" ? "Γράψε μου ένα ποίημα για τη θάλασσα" : "Write me a poem about the sea";
      await press(field);
      await field.fill(ask);
      let sent = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST", { timeout: 30000 }).catch(() => null);
      await press(page.locator('form button[type="submit"]').first());
      const refusal = await sent;
      await page.waitForTimeout(500);
      const refusedText = (await page.locator('[data-testid="chat-thread"]').evaluate((n) => n.parentElement.parentElement.innerText)).replace(ask, "");
      const insufficient = L.errors.codes.insufficientCredits.what;
      check(`${tag}: out of credits: the real /api/chat refuses the first message`, Boolean(refusal) && refusal.status() === 200, String(refusal?.status()));
      check(`${tag}: ...and the screen says it in ${locale}: «${insufficient}»`, refusedText.includes(insufficient), refusedText.slice(-300));
      check(`${tag}: ...with nothing in another language`, wrongLanguage(locale, refusedText).length === 0, wrongLanguage(locale, refusedText).join(", "));
      await shot("4-chat-out-of-credits");

      // ---- the service at its daily limit (the circuit breaker)
      account({ tier: "growth", name: "Ελένη" });
      STATE.atCapacity = true;
      await openChat();
      await press(field);
      await field.fill(ask);
      sent = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST", { timeout: 30000 }).catch(() => null);
      await press(page.locator('form button[type="submit"]').first());
      await sent;
      await page.waitForTimeout(500);
      const capacityText = (await page.locator('[data-testid="chat-thread"]').evaluate((n) => n.parentElement.parentElement.innerText)).replace(ask, "");
      check(`${tag}: the service at its daily limit: said in ${locale} — «${L.errors.codes.upstreamUnavailable.what}»`,
        capacityText.includes(L.errors.codes.upstreamUnavailable.what), capacityText.slice(-300));
      check(`${tag}: ...with nothing in another language`, wrongLanguage(locale, capacityText).length === 0, wrongLanguage(locale, capacityText).join(", "));
      STATE.atCapacity = false;

      // ---- the model provider fails on the first message
      account({ tier: "growth", name: "Ελένη" });
      STATE.consumed = 0; STATE.released = 0;
      const hitsBefore = providerHits.length;
      await openChat();
      await press(field);
      await field.fill(ask);
      sent = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST", { timeout: 30000 }).catch(() => null);
      await press(page.locator('form button[type="submit"]').first());
      await sent;
      const failedLine = await page.locator("p.text-danger").first().waitFor({ state: "visible", timeout: 30000 }).then(() => true, () => false);
      const failText = failedLine ? await page.locator("p.text-danger").first().innerText() : "";
      check(`${tag}: provider error: the message reached the provider stand-in (${providerHits.length - hitsBefore} calls)`, providerHits.length > hitsBefore);
      check(`${tag}: ...the free message it took was given back`, STATE.consumed === 1 && STATE.released === 1, JSON.stringify({ consumed: STATE.consumed, released: STATE.released }));
      check(`${tag}: ...the screen says it failed, in ${locale}`, failedLine && failText.length > 0 && wrongLanguage(locale, failText).length === 0, `"${failText}"`);
      // What the route knows, said: the AI service did not answer, and
      // nothing was kept (lib/errors/error-codes.ts: «the route said so ->
      // say what it said»).
      check(`${tag}: ...naming the AI service, not «something broke on our side»`, failText.includes(L.errors.codes.upstreamUnavailable.what), `"${failText}"`);
      check(`${tag}: ...and saying nothing was kept`, failText.includes(L.errors.credits.refunded), `"${failText}"`);
      const left = STATE.limit - STATE.freeUsed;
      const leftLine = L.credits.freeChat.remaining
        .replace(/\{count, plural, one \{[^}]*\} other \{([^}]*)\}\}/, (_, other) => other)
        .replace("#", String(left));
      const columnNow = await page.locator('[data-testid="chat-thread"]').evaluate((n) => n.parentElement.parentElement.innerText);
      check(`${tag}: ...and the free messages left are counted as they are: «${leftLine}»`, columnNow.includes(leftLine), columnNow.slice(-200));
      check(`${tag}: ...and what was written is still on the screen`,
        await page.getByTestId("chat-thread").getByText(ask, { exact: true }).first().isVisible().catch(() => false));
      await shot("5-chat-provider-error");
      await context.close();
    }
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
