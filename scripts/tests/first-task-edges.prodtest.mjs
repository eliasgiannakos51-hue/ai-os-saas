/*
 * THE FIRST TASK AT ITS EDGES, IN THE BUILT APP (MASTER 16, package 39:
 * «νέος λογαριασμός ολοκληρώνει μία εργασία σε 5 λεπτά, χωρίς οδηγίες»).
 *
 * Run: node scripts/tests/first-task-edges.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/first-task-edges.prodtest.mjs
 *
 * first-task.prodtest.mjs holds the screen: its clock starts at Home with
 * the session already in the browser, and /api/chat is answered by the
 * browser. This one walks what is left, through the app's own routes:
 *
 *   - FROM SIGN-IN. The clock starts at the press of «Σύνδεση» on /login
 *     and stops when the answer is on screen. The sign-in goes through
 *     /api/auth/login to the stand-in's GoTrue token endpoint, so the
 *     session cookie is the one the app itself sets.
 *   - THE REAL CHAT ROUTE. /api/chat runs: the free message is claimed,
 *     the conversation and both messages are saved, and the model is a
 *     stand-in on this machine (ANTHROPIC_BASE_URL, which the SDK reads)
 *     that answers in Anthropic's own stream shape — or with Anthropic's
 *     own error shape (529 overloaded_error), or drops the connection
 *     half-way through an answer.
 *   - A FREE ACCOUNT. Not the owner (ADMIN_EMAILS is empty), no
 *     subscription; the switch "first-task" reaches it as the test
 *     account (TEST_ACCOUNT_EMAILS).
 *   - OUT OF CREDITS: the month's free messages used up and no credits.
 *   - GREEK AND ENGLISH. Every piece of text the screen shows on the way,
 *     from the login page to the answer, is collected as it appears
 *     (a MutationObserver installed before the first byte), and a Greek
 *     screen may carry no English sentence — nor an English one Greek.
 *
 *   1. el, desktop: sign in, a task, the answer — timed, free, saved.
 *   2. el, phone with real touch: the same, timed.
 *   3. en, desktop: the same in English.
 *   4. The model answers an error: what the person reads, that nothing
 *      was charged and the free message came back, and that the same
 *      task goes through once the model answers again. Greek and English.
 *   5. The model drops the connection mid-answer, on a phone.
 *   6. Out of credits, Greek and English: said in the reader's language,
 *      and the model is never called.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { chromiumPath } from "./lib/chromium.mjs";

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

const PASSWORD = "first-task-password";
const msgs = (locale) => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
const EL = msgs("el");
const EN = msgs("en");
const ANSWER = {
  el: "Θέμα: Αίτημα προσφοράς. Καλησπέρα σας, θα θέλαμε προσφορά για διακόσια κιλά καφέ τον μήνα.",
  en: "A good business description says what you do, where, and for whom, in the words your customers search with.",
};
const GREEK = /[Ͱ-Ͽἀ-῿]/;

// ---------------------------------------------------------------------
// THE MODEL: Anthropic's Messages API, streamed, on this machine.
// ---------------------------------------------------------------------
const model = { mode: "answer", calls: [] };
const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const modelServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const parsed = JSON.parse(body || "{}");
    const last = parsed.messages?.at(-1);
    const asked = typeof last?.content === "string" ? last.content : (last?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).at(-1) ?? "";
    model.calls.push({ url: req.url, asked, stream: parsed.stream === true });
    if (model.mode === "overloaded") {
      // Anthropic's own answer when it is overloaded: HTTP 529 and this body.
      res.writeHead(529, { "Content-Type": "application/json", "request-id": "req_stand_in" });
      return res.end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" }, request_id: "req_stand_in" }));
    }
    const text = GREEK.test(asked) ? ANSWER.el : ANSWER.en;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    sse(res, "message_start", { type: "message_start", message: { id: "msg_first_task", type: "message", role: "assistant", model: parsed.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 400, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
    sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    if (model.mode === "drop") {
      // Half an answer, then the connection is gone.
      sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(0, 30) } });
      return setTimeout(() => res.destroy(), 150);
    }
    const half = Math.floor(text.length / 2);
    sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(0, half) } });
    sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(half) } });
    sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
    sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 60 } });
    sse(res, "message_stop", { type: "message_stop" });
    res.end();
  });
});
await new Promise((r) => modelServer.listen(0, "127.0.0.1", r));
const MODEL_URL = `http://127.0.0.1:${modelServer.address().port}`;

// ---------------------------------------------------------------------
// THE DATABASE: the stand-in, with what this walk reads and writes kept
// as rows — the onboarding row, the credits, the free messages, the
// conversation and its messages — and every RPC the chat route makes
// recorded, so "nothing was charged" is read off what the route asked.
// ---------------------------------------------------------------------
// freeUsed is the month's counter, as user_credits keeps it: the route
// claims against it (consume_free_chat) and the composer reads it.
const state = { onboarding: [], conversations: [], messages: [], rpc: [], credits: 100, freeUsed: 0 };
let session = null;
let seq = 0;
const uuid = () => `c0000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const eqFilters = (url) => [...url.searchParams].filter(([, v]) => v.startsWith("eq.")).map(([k, v]) => [k, v.slice(3)]);
function rest({ req, url, body, json }) {
  if (url.pathname === "/auth/v1/token" && req.method === "POST") {
    const input = JSON.parse(body || "{}");
    if (input.email !== MOCK_USER.email || input.password !== PASSWORD) {
      return json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }), true;
    }
    return json(200, session), true;
  }
  if (!url.pathname.startsWith("/rest/v1/")) return false;
  const table = url.pathname.slice("/rest/v1/".length);
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (rows) => (single ? (rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" })) : json(200, rows));
  const input = () => {
    const parsed = JSON.parse(body || "{}");
    return Array.isArray(parsed) ? parsed : [parsed];
  };

  if (table.startsWith("rpc/")) {
    const name = table.slice(4);
    const args = JSON.parse(body || "{}");
    state.rpc.push({ name, args });
    if (name === "consume_rate_limit") return json(200, true), true;
    if (name === "consume_free_chat") {
      const limit = Number(args.p_limit);
      if (state.freeUsed < limit) {
        state.freeUsed++;
        return json(200, [{ granted: true, used: state.freeUsed, remaining: limit - state.freeUsed }]), true;
      }
      return json(200, [{ granted: false, used: state.freeUsed, remaining: 0 }]), true;
    }
    if (name === "release_free_chat") return (state.freeUsed = Math.max(0, state.freeUsed - 1)), json(200, null), true;
    if (name === "reserve_credits") {
      if (state.credits >= Number(args.p_credits)) {
        state.credits -= Number(args.p_credits);
        return json(200, [{ reservation_id: uuid(), available: state.credits }]), true;
      }
      return json(200, [{ reservation_id: null, available: state.credits }]), true;
    }
    return json(200, null), true;
  }
  if (table === "user_credits") {
    if (req.method !== "GET" && req.method !== "HEAD") return json(201, []), true;
    return answer([{ user_id: MOCK_USER.id, credits_remaining: state.credits, credits_total: 100, plan_tier: "free", free_chat_used: state.freeUsed, free_chat_period_start: new Date().toISOString() }]), true;
  }
  if (table === "user_onboarding") {
    const mine = state.onboarding.filter((r) => r.user_id === MOCK_USER.id);
    if (req.method === "GET") return answer(mine), true;
    if (req.method === "POST") {
      for (const row of input()) {
        const at = state.onboarding.find((r) => r.user_id === row.user_id);
        if (at) Object.assign(at, row);
        else state.onboarding.push({ goal: null, completed_at: null, skipped_at: null, activation_used_at: null, ...row });
      }
      return json(201, []), true;
    }
    return false;
  }
  if (table === "chat_conversations" || table === "chat_messages") {
    const store = table === "chat_conversations" ? state.conversations : state.messages;
    if (req.method === "POST") {
      const made = input().map((row) => ({ id: uuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_pinned: false, ...row }));
      store.push(...made);
      return answer(made), true;
    }
    if (req.method === "PATCH") return json(200, []), true;
    if (req.method === "GET") {
      const filters = eqFilters(url);
      return answer(store.filter((row) => filters.every(([k, v]) => String(row[k]) === v))), true;
    }
    return false;
  }
  return false;
}
const supa = await startMockSupabase({ port: 54396, handle: rest });
session = JSON.parse(Buffer.from(supa.authCookie.value.slice("base64-".length), "base64url").toString("utf8"));
// The errors a scenario causes on purpose: the chat route logs the model's
// failure, which is the log working, not a fault on the way.
let expectedLogs = [];
const expectedError = (line) => expectedLogs.some((re) => re.test(line));
function reset({ credits = 100, freeUsed = 0, mode = "answer" } = {}) {
  expectedLogs = [
    // This build has no mailer, and the new-device email says so in the
    // log on a first sign-in (src/app/api/auth/device-check/route.ts): the log
    // working.
    /^email:send-new-device-login: RESEND_API_KEY is not set/,
    ...(mode === "answer" ? [] : [/^\/api\/chat: /]),
  ];
  state.onboarding.splice(0);
  state.conversations.splice(0);
  state.messages.splice(0);
  state.rpc.splice(0);
  state.credits = credits;
  state.freeUsed = freeUsed;
  model.mode = mode;
  model.calls.splice(0);
}
const rpcNamed = (name) => state.rpc.filter((r) => r.name === name);
/** Credits taken: what each settlement charged, plus any direct deduction. A settlement of 0 is the cost record of a free message. */
const charged = () =>
  rpcNamed("settle_reservation").reduce((sum, r) => sum + Number(r.args.p_credits_to_charge ?? 0), 0) +
  rpcNamed("deduct_credits_atomic").reduce((sum, r) => sum + Number(r.args.p_amount ?? 1), 0);
/** What the app's own error log received on the way (lib/log-error.ts writes it through this RPC). */
const loggedErrors = () => rpcNamed("record_production_error").map((r) => `${r.args.p_route ?? ""}: ${String(r.args.p_message ?? "").slice(0, 200)}`);

// ---------------------------------------------------------------------
// The production servers: one build, the account Free and the switch on.
// ---------------------------------------------------------------------
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
  TEST_ACCOUNT_EMAILS: MOCK_USER.email,
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: MODEL_URL,
};

const servers = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { modelServer.close(); } catch {}
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

// ---------------------------------------------------------------------
// A browser that keeps every piece of text the screen ever showed.
// ---------------------------------------------------------------------
const SEEN_SCRIPT = `(() => {
  const report = (text) => { const t = (text || "").replace(/\\s+/g, " ").trim(); if (t) window.__seenText?.(t); };
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
  const walk = (node) => {
    if (node.nodeType === 3) { if (!skip.has(node.parentNode?.nodeName)) report(node.nodeValue); return; }
    if (node.nodeType !== 1 || skip.has(node.nodeName)) return;
    if (node.getAttribute("placeholder")) report(node.getAttribute("placeholder"));
    for (const child of node.childNodes) walk(child);
  };
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") walk(m.target);
      else if (m.type === "attributes") { if (m.target.getAttribute("placeholder")) report(m.target.getAttribute("placeholder")); }
      else m.addedNodes.forEach(walk);
    }
  }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder"] });
})();`;

async function open(origin, device, locale, { signedIn = false } = {}) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  const cookies = [{ name: "NEXT_LOCALE", value: locale, url: origin }];
  if (signedIn) cookies.push({ name: supa.authCookie.name, value: supa.authCookie.value, url: origin, httpOnly: false, secure: false, sameSite: "Lax" });
  await context.addCookies(cookies);
  const seen = new Set();
  await context.exposeBinding("__seenText", (_source, text) => { seen.add(text); });
  await context.addInitScript(SEEN_SCRIPT);
  const page = await context.newPage();
  const pageErrors = [];
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
  return { context, page, press, seen, pageErrors };
}

// The words a screen in one language may carry from the other script.
// Each is a name or a term the product uses as-is in Greek — with the
// reason — and the account's own address.
// Compared without case.
const LATIN_IN_GREEK = new Map([
  ["ionexa", "the product's name (the logo prints it in capitals)"],
  ["ai", "used untranslated in the Greek catalogue"],
  ["email", "used untranslated in the Greek catalogue"],
  ["csv", "a file type"],
  ["google", "a name"],
  ["supabase", "a name: the cookie notice says which service sets the session cookie"],
  ["auth", "part of the name «Supabase Auth» in the same notice"],
  ["credits", "the product's unit, untranslated in the Greek catalogue"],
  ["cookie", "untranslated in the Greek catalogue, as everywhere in Greek"],
  ["cookies", "untranslated in the Greek catalogue, as everywhere in Greek"],
  ["browser", "untranslated in the Greek catalogue"],
  ["free", "the plan's name, as the pricing page prints it"],
  ["you", "the login field's example address, you@domain.com"],
  ["domain", "the login field's example address, you@domain.com"],
  ["com", "the login field's example address, you@domain.com"],
]);
// The account's own name and address, which the sidebar prints.
const accountWords = new Set(MOCK_USER.email.toLowerCase().split(/[@.]/));
/** Sentences of the wrong language on a screen: Latin words on a Greek one, Greek letters on an English one. */
function foreign(seen, locale) {
  const out = [];
  for (const text of seen) {
    if (locale === "el") {
      const words = (text.match(/[A-Za-z][A-Za-z'’]+/g) ?? []).filter((w) => w.length > 2 && !LATIN_IN_GREEK.has(w.toLowerCase()) && !accountWords.has(w.toLowerCase()));
      if (words.length > 0) out.push(text);
    } else if (GREEK.test(text)) {
      out.push(text);
    }
  }
  return out;
}

const answered = (page, text, timeout = 30000) => page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true).catch(() => false);
async function signIn(page, press, origin, m) {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").waitFor({ timeout: 30000 });
  await page.locator("#email").fill(MOCK_USER.email);
  await page.locator("#password").fill(PASSWORD);
  const t0 = Date.now();
  await press(page.getByRole("button", { name: m.auth.login.logIn, exact: true }));
  return t0;
}

const desktop = { viewport: { width: 1440, height: 900 }, touch: false };
const phone = { viewport: { width: 390, height: 844 }, touch: true };
const timings = [];

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
  const ON = await start(base);
  browser = await chromium.launch({ executablePath: chromiumPath() });

  // =================================================================
  // 1-3. From sign-in to the answer: Greek on a desktop and a phone,
  //      English on a desktop.
  // =================================================================
  const walks = [
    { title: "1. el, desktop", locale: "el", device: desktop, task: "write", mode: "create", nth: 0 },
    { title: "2. el, phone with real touch", locale: "el", device: phone, task: "plan", mode: "run", nth: 1 },
    { title: "3. en, desktop", locale: "en", device: desktop, task: "explain", mode: "research", nth: 2 },
  ];
  for (const walk of walks) {
    console.log(`\n== ${walk.title}: sign in, one task, the answer ==`);
    reset();
    const m = walk.locale === "el" ? EL : EN;
    const taskText = m.dashboard.firstTask.tasks[walk.task].text;
    const { context, page, press, seen, pageErrors } = await open(ON, walk.device, walk.locale);
    const t0 = await signIn(page, press, ON, m);
    await page.locator('[data-testid="first-task"]').waitFor({ timeout: 30000 }).catch(() => null);
    check("signed in, a new account lands on the first task", new URL(page.url()).pathname === "/onboarding" && (await page.locator('[data-testid="first-task"]').count()) === 1, page.url());
    await press(page.locator('[data-testid="first-task-option"]').nth(walk.nth));
    const done = await answered(page, ANSWER[walk.locale]);
    const seconds = (Date.now() - t0) / 1000;
    timings.push(`${walk.title}: ${seconds.toFixed(1)} s`);
    check(`the answer on screen ${seconds.toFixed(1)} s after «${m.auth.login.logIn}» — inside five minutes`, done && seconds < 300);
    check("...answered by the model through the app's own chat route, asked the task as written", model.calls.length === 1 && model.calls[0].asked === taskText, JSON.stringify(model.calls));
    // The answer is saved after it has streamed: given a moment.
    for (let i = 0; i < 50 && !state.messages.some((r) => r.role === "assistant"); i++) await new Promise((r) => setTimeout(r, 200));
    const settled = rpcNamed("settle_reservation");
    check("...free, as the screen said: a free message was claimed, nothing held, nothing charged", rpcNamed("consume_free_chat").length === 1 && rpcNamed("reserve_credits").length === 0 && charged() === 0 && state.freeUsed === 1 && settled.every((r) => r.args.p_feature === "chat_free"), JSON.stringify(state.rpc.filter((r) => r.name !== "consume_rate_limit").map((r) => `${r.name}${r.args?.p_credits_to_charge !== undefined ? `(${r.args.p_feature}, ${r.args.p_credits_to_charge})` : ""}`)));
    check("...and kept: the conversation, the task and the answer", state.conversations.length === 1 && state.messages.some((r) => r.role === "user" && r.content === taskText) && state.messages.some((r) => r.role === "assistant" && r.content === ANSWER[walk.locale]), JSON.stringify(state.messages.map((r) => r.role)));
    check("...and what began the account is recorded", state.onboarding[0]?.goal === `first-task:${walk.task}` && Boolean(state.onboarding[0]?.completed_at), JSON.stringify(state.onboarding));
    const wrong = foreign(seen, walk.locale);
    check(`every word on the way, from the login page to the answer, is in ${walk.locale === "el" ? "Greek" : "English"} (${seen.size} pieces of text)`, wrong.length === 0, wrong.slice(0, 8).join(" | "));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    check(`no route logged an error the person did not cause (${loggedErrors().length})`, loggedErrors().every(expectedError), loggedErrors().slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  // 4. The model answers an error.
  // =================================================================
  for (const locale of ["el", "en"]) {
    console.log(`\n== 4. the model answers an error (${locale}) ==`);
    reset({ mode: "overloaded" });
    const m = locale === "el" ? EL : EN;
    const err = m.errors;
    const taskText = m.dashboard.firstTask.tasks.write.text;
    const { context, page, press, seen, pageErrors } = await open(ON, desktop, locale, { signedIn: true });
    await page.goto(`${ON}/onboarding`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="first-task-option"]').first().waitFor({ timeout: 30000 });
    await press(page.locator('[data-testid="first-task-option"]').first());
    await page.waitForURL(/\/dashboard\/chat/, { timeout: 30000 });
    const said = await page.waitForFunction((needles) => needles.some((n) => document.body.innerText.includes(n)), [err.codes.serverError.what, err.codes.upstreamUnavailable.what], { timeout: 45000 }).then(() => true).catch(() => false);
    const body = await page.locator("body").innerText();
    check("the person is told, in their language, that it did not work", said, body.slice(-600));
    console.log(`        reads: ${body.split("\n").find((l) => l.includes(err.codes.serverError.what) || l.includes(err.codes.upstreamUnavailable.what)) ?? ""}`);
    check("...their task is still on the screen", body.includes(taskText));
    check(`...the model was asked, and asked again as the SDK retries an overload (${model.calls.length} calls)`, model.calls.length >= 2, String(model.calls.length));
    check("...nothing was charged and the free message came back", charged() === 0 && rpcNamed("release_free_chat").length === 1 && state.freeUsed === 0, JSON.stringify(state.rpc.map((r) => r.name)));
    // The model is back: the same task, sent again from the field.
    model.mode = "answer";
    const field = page.locator("textarea").last();
    await field.fill(taskText);
    await field.press("Enter");
    check("once the model answers again, the same task gets its answer", await answered(page, ANSWER[locale]));
    const wrong = foreign(seen, locale);
    check(`every word on the screen is in ${locale === "el" ? "Greek" : "English"} (${seen.size} pieces of text)`, wrong.length === 0, wrong.slice(0, 8).join(" | "));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    check(`no route logged an error the person did not cause (${loggedErrors().length})`, loggedErrors().every(expectedError), loggedErrors().slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  // 5. The model drops the connection half-way through, on a phone.
  // =================================================================
  {
    console.log("\n== 5. the model drops the connection mid-answer (el, phone) ==");
    reset({ mode: "drop" });
    const { context, page, press, seen, pageErrors } = await open(ON, phone, "el", { signedIn: true });
    await page.goto(`${ON}/onboarding`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="first-task-option"]').first().waitFor({ timeout: 30000 });
    await press(page.locator('[data-testid="first-task-option"]').nth(1));
    await page.waitForURL(/\/dashboard\/chat/, { timeout: 30000 });
    const said = await page.waitForFunction((needles) => needles.some((n) => document.body.innerText.includes(n)), [EL.errors.codes.serverError.what, EL.errors.codes.upstreamUnavailable.what, EL.dashboard.chat?.streamInterruptedPartial ?? "\u0000"], { timeout: 45000 }).then(() => true).catch(() => false);
    check("the person is told it stopped, in Greek", said, (await page.locator("body").innerText()).slice(-600));
    check("...nothing was charged and the free message came back", charged() === 0 && rpcNamed("release_free_chat").length === 1 && state.freeUsed === 0, JSON.stringify(state.rpc.map((r) => r.name)));
    const wrong = foreign(seen, "el");
    check(`every word on the screen is in Greek (${seen.size} pieces of text)`, wrong.length === 0, wrong.slice(0, 8).join(" | "));
    check("...and it fits the phone", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    check(`no route logged an error the person did not cause (${loggedErrors().length})`, loggedErrors().every(expectedError), loggedErrors().slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  // 6. Out of credits: the month's free messages used up, no credits.
  // =================================================================
  for (const [locale, device] of [["el", desktop], ["en", phone]]) {
    console.log(`\n== 6. out of free messages and credits (${locale}, ${device.touch ? "phone" : "desktop"}) ==`);
    // More than any month's allowance.
    reset({ credits: 0, freeUsed: 1000 });
    const m = locale === "el" ? EL : EN;
    const { context, page, press, seen, pageErrors } = await open(ON, device, locale, { signedIn: true });
    await page.goto(`${ON}/onboarding`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="first-task-option"]').first().waitFor({ timeout: 30000 });
    await press(page.locator('[data-testid="first-task-option"]').first());
    await page.waitForURL(/\/dashboard\/chat/, { timeout: 30000 });
    const want = m.errors.codes.insufficientCredits.what;
    const said = await page.waitForFunction((t) => document.body.innerText.includes(t), want, { timeout: 30000 }).then(() => true).catch(() => false);
    check(`the person reads that there are no credits left, in ${locale === "el" ? "Greek" : "English"}: «${want}»`, said, (await page.locator("body").innerText()).slice(-500));
    check("...the model was never called and nothing was held or charged", model.calls.length === 0 && rpcNamed("reserve_credits").length === 0 && charged() === 0, JSON.stringify(state.rpc.map((r) => r.name)));
    const wrong = foreign(seen, locale);
    check(`every word on the screen is in ${locale === "el" ? "Greek" : "English"} (${seen.size} pieces of text)`, wrong.length === 0, wrong.slice(0, 8).join(" | "));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    check(`no route logged an error the person did not cause (${loggedErrors().length})`, loggedErrors().every(expectedError), loggedErrors().slice(0, 3).join(" | "));
    await context.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

if (timings.length) console.log(`\nfrom «Σύνδεση» to the answer on screen, measured ${new Date().toISOString().slice(0, 10)}:\n  ${timings.join("\n  ")}`);
console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
