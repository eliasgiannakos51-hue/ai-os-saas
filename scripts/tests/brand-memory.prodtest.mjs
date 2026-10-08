/*
 * MEMORY, IN THE BUILT APP, THROUGH THE APP'S OWN ROUTES (MASTER 16,
 * package 6): «λέω στο Chat το όνομα και τα χρώματα της επιχείρησής μου,
 * και το Site τα χρησιμοποιεί χωρίς να τα ξαναγράψω».
 *
 * Run: node scripts/tests/brand-memory.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/brand-memory.prodtest.mjs
 *
 * NOTHING IS ANSWERED IN THE BROWSER. /api/chat, /api/websites/generate,
 * its worker and /api/websites/status are the app's own; the model is the
 * stand-in of scripts/tests/lib/stand-in-model.mjs (ANTHROPIC_BASE_URL),
 * and the database the stand-in of scripts/lib/mock-supabase.mjs with the
 * tables this walk writes kept as rows (scripts/tests/lib/stand-in-rows.mjs)
 * — so the memory /api/chat records is the memory the Site's worker reads.
 * scripts/tests/brand-memory.itest.mjs holds the same two halves without a
 * browser.
 *
 * The stand-in port is shared with library-edges.prodtest.mjs and
 * chat-opens-tools-edges.prodtest.mjs: one build serves the three.
 *
 *   1. The test account says the name and colours in Chat; then, in the
 *      Site, asks for a site naming neither. The site the model is asked
 *      for carries the name and both colours as exact values, and the Site
 *      says what it took from memory.
 *   2. Nothing said yet: the brief carries no name and the Site says
 *      nothing about memory.
 *   3. The model fails while remembering: the answer still arrives and
 *      nothing is written.
 *   4. No credits left: Chat says so in the screen's language and nothing
 *      is remembered.
 *   5. A Free account: nothing is extracted (memory is not on Free) and
 *      the Site shows its plan wall.
 *   6. The owner (ADMIN_EMAILS) on a free subscription: the owner is
 *      exempt from every plan gate, so the walk of part 1 works for him.
 *   Greek and English; 1440x900 with a mouse and 390x844 with real touch.
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

// ---------------------------------------------------------------------
// The model: what each of the app's calls gets back.
// ---------------------------------------------------------------------
const SAID = { el: "Η επιχείρησή μου λέγεται Αύρα Camping και τα χρώματά της είναι ναυτικό μπλε και χρυσό.", en: "My business is called Αύρα Camping and its colours are navy and gold." };
const EXTRACTED = { el: "Τον λένε Ηλία.\nΕπιχείρηση: «Αύρα Camping».\nΧρώματα επιχείρησης: ναυτικό μπλε και χρυσό", en: "His name is Elias.\nΕπιχείρηση: «Αύρα Camping».\nΧρώματα επιχείρησης: navy, gold" };
const REPLY = { el: "Ωραία, το κράτησα.", en: "Got it, I will remember that." };
const ASK_SITE = { el: "Φτιάξε μου site για το camping μου στη Νάξο.", en: "Make me a site for my camping in Naxos." };
const SITE_HTML = '<!DOCTYPE html>\n<html lang="el">\n<head>\n<meta charset="utf-8">\n<title>Αύρα Camping</title>\n</head>\n<body>\n<header><h1>Αύρα Camping</h1></header>\n<main><section><p>Σκηνές δίπλα στη θάλασσα.</p></section></main>\n<footer><p>2026</p></footer>\n</body>\n</html>\n';
const state = { locale: "el", memoryFails: false, credits: 3000, holdRefused: false };
const model = await startStandInModel(({ kind, body }) => {
  if (kind === "memory") {
    if (state.memoryFails) return { error: 529, type: "overloaded_error", message: "Overloaded" };
    const asked = JSON.stringify(body.system ?? "").includes("Επιχείρηση:");
    return { text: asked ? EXTRACTED[state.locale] : "Τον λένε Ηλία." };
  }
  if (kind === "site") return { text: SITE_HTML };
  if (kind === "chat") return { text: REPLY[state.locale] };
  // The clarification check, the off-topic check and the safety review ask
  // for a tool; a reply without one is read as "clear" by all three.
  return { text: "ok" };
});

// ---------------------------------------------------------------------
// The database: the tables this walk writes, kept as rows.
// ---------------------------------------------------------------------
const db = standInRows({
  tables: { chat_conversations: [], chat_messages: [], chat_memory: [], user_websites: [] },
  defaults: {
    user_websites: () => ({ html_content: "", status: "pending", error_message: null, generation_notes: null, pages: null, attempt_count: 0 }),
    chat_conversations: () => ({ user_id: MOCK_USER.id, is_pinned: false, updated_at: new Date().toISOString() }),
  },
  rpc: {
    // chat_memory_record (20261003000000_chat_memory_dedup_and_retention.sql):
    // insert or bump by the fold, as the signed-in user.
    chat_memory_record: (args, store) => {
      const now = new Date().toISOString();
      const same = store.chat_memory.find((r) => r.memory_fold === args.p_memory_fold);
      if (same) {
        same.times_seen += 1;
        same.last_seen_at = now;
        return same.id;
      }
      const row = { id: standInId(), user_id: MOCK_USER.id, memory_text: args.p_memory_text, memory_fold: args.p_memory_fold, source_conversation_id: args.p_conversation_id, times_seen: 1, last_seen_at: now, created_at: now, surface: "chat", kind: "fact" };
      store.chat_memory.push(row);
      return row.id;
    },
    reserve_credits: (args) => (state.credits >= args.p_credits && !state.holdRefused ? [{ reservation_id: standInId() }] : [{ reservation_id: null, available: state.holdRefused ? 3 : state.credits }]),
    settle_reservation: () => null,
    release_reservation: () => null,
    consume_free_chat: () => [{ granted: false, used: 0, remaining: 0 }],
    release_free_chat: () => null,
    increment_daily_ai_spend: () => null,
    consume_rate_limit: () => true,
  },
});
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
  ADMIN_EMAILS: "",
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: model.url,
  UNSPLASH_ACCESS_KEY: "",
};

const msgs = { el: JSON.parse(readFileSync("messages/el.json", "utf8")), en: JSON.parse(readFileSync("messages/en.json", "utf8")) };
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
// "pack": the Greek catalogue's own word for a credit pack (credits.outOfCredits).
const GREEK_UI_LATIN = ["Ionexa", "credits", "credit", "Site", "Chat", "Slides", "Posts", "PDF", "AI", "pack"];
const CONTENT = wordsOf(SAID.el, SAID.en, REPLY.el, REPLY.en, ASK_SITE.el, ASK_SITE.en, "Αύρα Camping");

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

async function open(origin, device, locale) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: locale, url: origin },
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
  // To the END of the turn, not to the first words of the answer: the
  // extraction runs before the stream closes, and the SDK retries an
  // overloaded answer twice — a check made at the first words would count
  // before the retries, and a retry landing in the next part would write
  // there.
  async function sayInChat(text) {
    const field = page.locator("textarea").first();
    await press(field);
    await field.fill(text);
    const turn = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/chat", { timeout: 60000 });
    await field.press("Enter");
    await (await turn).finished();
  }
  async function askTheSite(text) {
    const field = page.locator("main textarea");
    await press(field);
    await field.fill(text);
    await field.press("Enter");
  }
  return { context, page, press, sayInChat, askTheSite };
}

// WHAT THE SITE'S WORKER WRITES INTO THE BRIEF (brandBriefFor in
// src/lib/memory/brand.ts): English, because it is the model's prompt and
// never a screen — compared against the request the model received.
const BRIEF_NAME = "BUSINESS NAME:";
const BRIEF_NAME_LINE = `${BRIEF_NAME} «Αύρα Camping»`;
const remembered = () => db.store.chat_memory.map((r) => r.memory_text);
const siteRequest = () => JSON.stringify(model.seen.filter((s) => s.kind === "site").map((s) => s.body));
const memoryCalls = () => model.seen.filter((s) => s.kind === "memory").length;
const waitFor = async (fn, ms = 30000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
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
  // The test account (the switches are "staff"), and the owner.
  const TEST = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  const OWNER = await start({ ...base, ADMIN_EMAILS: MOCK_USER.email, TEST_ACCOUNT_EMAILS: "" });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  const devices = [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ];

  // ---- 1. the walk, in both languages and on both devices
  for (const device of devices) {
    for (const locale of ["el", "en"]) {
      const M = msgs[locale];
      const WB = M.dashboard.websiteBuilder;
      console.log(`\n== 1. the walk: ${device.label}, ${locale} ==`);
      reset();
      state.locale = locale;
      MOCK_USER.user_metadata = { subscription_tier: "growth" };
      pageErrors.length = 0;
      const { context, page, sayInChat, askTheSite } = await open(TEST, device, locale);
      await page.goto(`${TEST}/dashboard/chat`, { waitUntil: "networkidle" });
      await sayInChat(SAID[locale]);
      const answered = await page.getByText(REPLY[locale]).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
      check("Chat answers what was said", answered);
      await waitFor(async () => remembered().length >= 2, 10000);
      check("...and remembers the business name as its own line", remembered().includes("Επιχείρηση: Αύρα Camping"), JSON.stringify(remembered()));
      check("...and its colours as their own line", remembered().some((t) => t.startsWith("Χρώματα επιχείρησης:")), JSON.stringify(remembered()));

      await page.goto(`${TEST}/dashboard/website-builder`, { waitUntil: "networkidle" });
      await askTheSite(ASK_SITE[locale]);
      const shown = await page.locator('[data-testid="site-preview"] iframe').waitFor({ state: "visible", timeout: 45000 }).then(() => true, () => false);
      check("the Site makes the site and shows it", shown);
      const sent = siteRequest();
      check("...the site the model was asked for carries the business name, never typed in the Site", sent.includes(BRIEF_NAME_LINE) && !ASK_SITE[locale].includes("Αύρα"), sent.slice(0, 300));
      check("...and the primary colour as an exact value", sent.includes("PRIMARY COLOUR: exactly #1f2a44"));
      check("...and the secondary colour as an exact value", sent.includes("SECONDARY COLOUR: exactly #c9a227"));
      const thread = await page.locator('[data-testid="tool-shell-thread"]').innerText().catch(() => "");
      const colours = locale === "el" ? "ναυτικό μπλε, χρυσό" : "navy, gold";
      const line = fill(WB.notes.fromMemory.both, { name: "Αύρα Camping", colours });
      check("...and the Site says what it took from memory, in the screen's language", thread.includes(line), `${line} ∉ ${thread.slice(0, 400)}`);
      const text = await screenText(page);
      const wrong = locale === "el" ? englishOnGreek(text, [...GREEK_UI_LATIN, ...CONTENT, "navy", "gold"]) : greekOnEnglish(text, CONTENT);
      check("...and nothing on the screen is in the other language", wrong.length === 0, wrong.slice(0, 12).join(" | "));
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }
  }

  const desktop = devices[0];
  const phone = devices[1];
  state.locale = "el";
  const WB = msgs.el.dashboard.websiteBuilder;

  // ---- 2. nothing said yet
  console.log("\n== 2. nothing remembered yet (phone) ==");
  reset();
  MOCK_USER.user_metadata = { subscription_tier: "growth" };
  {
    const { context, page, askTheSite } = await open(TEST, phone, "el");
    await page.goto(`${TEST}/dashboard/website-builder`, { waitUntil: "networkidle" });
    await askTheSite(ASK_SITE.el);
    await page.locator('[data-testid="site-preview"] iframe').waitFor({ state: "visible", timeout: 45000 }).catch(() => null);
    check("the site is made", model.seen.some((s) => s.kind === "site"));
    check("...with no business name or colour the person never said", !siteRequest().includes(BRIEF_NAME) && !siteRequest().includes("SECONDARY COLOUR: exactly #c9a227"));
    const thread = await page.locator('[data-testid="tool-shell-thread"]').innerText().catch(() => "");
    check("...and the Site says nothing about memory", !thread.includes(WB.notes.fromMemory.name.split("«")[0].trim()), thread.slice(0, 300));
    await context.close();
  }

  // ---- 3. the model fails while remembering
  console.log("\n== 3. the model fails while remembering (desktop) ==");
  reset();
  state.memoryFails = true;
  {
    const { context, page, sayInChat } = await open(TEST, desktop, "el");
    await page.goto(`${TEST}/dashboard/chat`, { waitUntil: "networkidle" });
    await sayInChat(SAID.el);
    const answered = await page.getByText(REPLY.el).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
    check("the answer still arrives", answered);
    check("...the extractor was asked", memoryCalls() >= 1, String(memoryCalls()));
    check("...and nothing was remembered", remembered().length === 0, JSON.stringify(remembered()));
    check("...and no error is shown for it", (await page.locator(".text-danger").count()) === 0);
    await context.close();
  }
  state.memoryFails = false;

  // ---- 4. no credits left
  console.log("\n== 4. no credits left (phone) ==");
  reset();
  state.credits = 0;
  {
    const { context, page, sayInChat } = await open(TEST, phone, "el");
    await page.goto(`${TEST}/dashboard/chat`, { waitUntil: "networkidle" });
    await sayInChat(SAID.el);
    await page.waitForTimeout(500);
    check("nothing is remembered and the extractor is not asked", remembered().length === 0 && memoryCalls() === 0, JSON.stringify({ remembered: remembered(), calls: memoryCalls() }));
    const said = await screenText(page);
    check("Chat says the credits ran out, in Greek", said.includes(msgs.el.errors.codes.insufficientCredits.what), said.slice(-400));
    const wrong = englishOnGreek(said, [...GREEK_UI_LATIN, ...CONTENT]);
    check("...with no English sentence on the Greek screen", wrong.length === 0, wrong.slice(0, 12).join(" | "));
    // The balance read before the answer says enough; the hold, a moment
    // later, says not (another tab spent it in between): the refusal comes
    // inside the answer's stream, and is said the same way.
    state.credits = 3000;
    state.holdRefused = true;
    await page.goto(`${TEST}/dashboard/chat`, { waitUntil: "networkidle" });
    await sayInChat(SAID.el);
    await page.waitForTimeout(500);
    const late = await screenText(page);
    check("the hold refused inside the answer: Chat says the credits ran out, in Greek", late.includes(msgs.el.errors.codes.insufficientCredits.what), late.slice(-400));
    check("...and nothing is remembered", remembered().length === 0 && memoryCalls() === 0);
    state.holdRefused = false;
    await context.close();
  }
  state.credits = 3000;

  // ---- 5. a Free account
  console.log("\n== 5. a Free account (desktop) ==");
  reset();
  MOCK_USER.user_metadata = { subscription_tier: "free" };
  {
    const { context, page, sayInChat } = await open(TEST, desktop, "el");
    await page.goto(`${TEST}/dashboard/chat`, { waitUntil: "networkidle" });
    await sayInChat(SAID.el);
    await page.getByText(REPLY.el).first().waitFor({ timeout: 20000 }).catch(() => null);
    check("Free: Chat answers", (await page.getByText(REPLY.el).count()) >= 1);
    check("...and memory, which is not on Free, makes no second model call and writes nothing", memoryCalls() === 0 && remembered().length === 0, JSON.stringify({ calls: memoryCalls(), remembered: remembered() }));
    await page.goto(`${TEST}/dashboard/website-builder`, { waitUntil: "networkidle" });
    check("...and the Site shows its plan wall", (await page.getByText(msgs.el.common.upgradeRequired.title).count()) >= 1);
    await context.close();
  }

  // ---- 6. the owner, on a free subscription
  console.log("\n== 6. the owner on a free subscription (phone) ==");
  reset();
  MOCK_USER.user_metadata = { subscription_tier: "free" };
  {
    const { context, page, sayInChat, askTheSite } = await open(OWNER, phone, "el");
    await page.goto(`${OWNER}/dashboard/chat`, { waitUntil: "networkidle" });
    await sayInChat(SAID.el);
    await page.getByText(REPLY.el).first().waitFor({ timeout: 20000 }).catch(() => null);
    await waitFor(async () => remembered().length >= 2, 10000);
    check("owner: Chat remembers the name", remembered().includes("Επιχείρηση: Αύρα Camping"), JSON.stringify({ calls: memoryCalls(), remembered: remembered() }));
    await page.goto(`${OWNER}/dashboard/website-builder`, { waitUntil: "networkidle" });
    await askTheSite(ASK_SITE.el);
    await page.locator('[data-testid="site-preview"] iframe').waitFor({ state: "visible", timeout: 45000 }).catch(() => null);
    check("...and the Site uses it", siteRequest().includes(BRIEF_NAME_LINE), siteRequest().slice(0, 300));
    await context.close();
  }
  MOCK_USER.user_metadata = { subscription_tier: "growth" };
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
