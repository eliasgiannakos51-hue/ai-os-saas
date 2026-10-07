/*
 * «ΝΕΟΣ ΛΟΓΑΡΙΑΣΜΟΣ ΟΛΟΚΛΗΡΩΝΕΙ ΜΙΑ ΕΡΓΑΣΙΑ ΣΕ 5 ΛΕΠΤΑ, ΧΩΡΙΣ ΟΔΗΓΙΕΣ» — IN
 * THE BUILT APP (MASTER 10 and 16, package 39).
 *
 * Run: node scripts/tests/first-task.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/first-task.prodtest.mjs
 *
 * One production build, two servers: one where the signed-in account is
 * the test account, so the switch "first-task" is on, and one where it is
 * off. The account is on the FREE plan — not the owner's — because that
 * is what a new account is. The database is the stand-in of
 * scripts/lib/mock-supabase.mjs with user_onboarding kept as a real row,
 * so what /api/onboarding writes is what the proxy and Home read next.
 * /api/chat is answered by the browser as Chat answers it (page.route),
 * so no model is called; what the Chat screen SENDS is what is held.
 *
 * The clock starts when the new account opens Home and stops when the
 * answer is on screen, and nothing on the way is a hint: the walk only
 * presses what the screen shows.
 *
 *   1. A new account opens Home, is on the first task, presses one, and
 *      has the answer — well inside five minutes — and Home stays Home.
 *   2. Its own sentence instead; «Παράλειψη»; the data import.
 *   3. A phone; then the switch off: the questionnaire, as it was.
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

// ---------------------------------------------------------------------
// user_onboarding, kept as a row: upserted by /api/onboarding, read by
// the proxy, Home and /onboarding.
// ---------------------------------------------------------------------
const onboarding = [];
function rest({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (table !== "user_onboarding") return false;
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const mine = onboarding.filter((r) => r.user_id === MOCK_USER.id);
  if (req.method === "GET") {
    if (single) return mine[0] ? json(200, mine[0]) : json(406, { message: "no rows" }), true;
    return json(200, mine), true;
  }
  if (req.method === "POST") {
    const input = JSON.parse(body || "{}");
    for (const row of Array.isArray(input) ? input : [input]) {
      const at = onboarding.find((r) => r.user_id === row.user_id);
      if (at) Object.assign(at, row);
      else onboarding.push({ goal: null, completed_at: null, skipped_at: null, activation_used_at: null, ...row });
    }
    return json(201, []), true;
  }
  return false;
}
const supa = await startMockSupabase({
  port: 54395,
  tableRows: { user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 100, credits_total: 100 }] },
  handle: rest,
});
const reset = () => onboarding.splice(0, onboarding.length);
const row = () => onboarding.find((r) => r.user_id === MOCK_USER.id) ?? null;

const freePort = () =>
  new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
// A new account on Free: not the owner, so no plan comes from ADMIN_EMAILS.
const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  ADMIN_EMAILS: "",
};

const el = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard;
const F = el.firstTask;
const ANSWER = "Θέμα: Αίτημα προσφοράς. Καλησπέρα σας, θα θέλαμε προσφορά για 200 κιλά καφέ τον μήνα.";

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
const chatAsked = [];
async function open(origin, device) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: "el", url: origin },
    ].map(({ domain, path, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  await page.route("**/api/chat", (r) => {
    chatAsked.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: [
      JSON.stringify({ type: "meta", conversationId: "c0000000-0000-4000-8000-000000000001", isNewConversation: true, title: "Προσφορά" }),
      JSON.stringify({ type: "delta", text: ANSWER }),
      JSON.stringify({ type: "done", messageId: "a0000000-0000-4000-8000-000000000001" }),
    ].join("\n") + "\n" });
  });
  const cdp = device.touch ? await context.newCDPSession(page) : null;
  async function press(locator) {
    await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.click();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return { context, page, press };
}
const answered = (page) => page.waitForFunction((text) => document.body.innerText.includes(text), ANSWER, { timeout: 30000 }).then(() => true).catch(() => false);
const desktop = { viewport: { width: 1440, height: 900 }, touch: false };

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

  // =================================================================
  console.log("\n== 1. a new account, Home, one press, an answer ==");
  {
    reset();
    const { context, page, press } = await open(ON, desktop);
    const t0 = Date.now();
    await page.goto(`${ON}/dashboard/overview`, { waitUntil: "networkidle" });
    check("a new account opening Home lands on the first task", new URL(page.url()).pathname === "/onboarding" && (await page.locator('[data-testid="first-task"]').count()) === 1, page.url());
    const options = page.locator('[data-testid="first-task-option"]');
    const texts = await options.allInnerTexts();
    check("three tasks, each a whole sentence", texts.length === 3 && ["write", "plan", "explain"].every((k, i) => texts[i].includes(F.tasks[k].text)), texts.join(" | "));
    check("...and what they cost, said before the press", (await page.locator('[data-testid="first-task"]').innerText()).includes(F.cost));
    check("no questionnaire in the way", (await page.getByText(el.onboarding.goalTitle).count()) === 0);
    const tops = await options.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
    check("all three in view without scrolling", tops.every((b) => b <= 900), tops.join());
    await press(options.first());
    await page.waitForURL(/\/dashboard\/chat/, { timeout: 15000 });
    const done = await answered(page);
    const seconds = (Date.now() - t0) / 1000;
    check("one press: Chat, the task already sent, in its way of working", chatAsked.at(-1)?.message === F.tasks.write.text && chatAsked.at(-1)?.workMode === "create", JSON.stringify(chatAsked.at(-1)));
    check(`the answer on screen, ${seconds.toFixed(1)} s after Home opened — inside five minutes`, done && seconds < 300);
    check("the address no longer carries the task, so a reload does not send it again", !new URL(page.url()).searchParams.has("ask"), page.url());
    check("what began the account is kept, and it counts as finished", Boolean(row()?.completed_at) && row()?.goal === "first-task:write", JSON.stringify(row()));
    await page.goto(`${ON}/dashboard/overview`, { waitUntil: "networkidle" });
    check("Home is Home from now on", new URL(page.url()).pathname === "/dashboard/overview");
    await page.goto(`${ON}/onboarding`, { waitUntil: "networkidle" });
    check("...and the first task is not offered again", new URL(page.url()).pathname === "/dashboard/overview");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 2. its own sentence, «Παράλειψη», the data import ==");
  {
    reset();
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/onboarding`, { waitUntil: "networkidle" });
    check("nothing to send before something is written", await page.locator('[data-testid="first-task-send"]').isDisabled());
    const own = "Πες μου τρεις ιδέες για όνομα για ένα καφέ δίπλα στη θάλασσα";
    await page.locator('[data-testid="first-task-own"]').fill(own);
    await page.locator('[data-testid="first-task-own"]').press("Enter");
    await page.waitForURL(/\/dashboard\/chat/, { timeout: 15000 });
    check("its own sentence: Chat, sent as written, no way of working imposed", (await answered(page)) && chatAsked.at(-1)?.message === own && chatAsked.at(-1)?.workMode === undefined, JSON.stringify(chatAsked.at(-1)));
    check("...and kept as its own beginning", row()?.goal === "first-task:own" && Boolean(row()?.completed_at));
    await context.close();
  }
  {
    reset();
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/onboarding`, { waitUntil: "networkidle" });
    await press(page.locator('[data-testid="first-task-skip"]'));
    await page.waitForURL(/\/dashboard\/overview/, { timeout: 15000 });
    check("«Παράλειψη»: Home, and it stays skipped", Boolean(row()?.skipped_at) && !row()?.completed_at);
    await context.close();
  }
  {
    reset();
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/onboarding`, { waitUntil: "networkidle" });
    await press(page.locator('[data-testid="first-task-import"]'));
    await page.waitForURL(/classic=1/, { timeout: 15000 });
    await page.getByText(el.onboarding.goalTitle).first().waitFor({ timeout: 10000 }).catch(() => null);
    check("the data import is one press away, as it was", (await page.getByText(el.onboarding.goalTitle).count()) > 0 && (await page.locator('[data-testid="first-task"]').count()) === 0);
    check("...and opening it decides nothing for the account", row() === null);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 3. a phone, then the switch off ==");
  {
    reset();
    const { context, page, press } = await open(ON, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${ON}/dashboard/overview`, { waitUntil: "networkidle" });
    check("on a phone it fits the screen", new URL(page.url()).pathname === "/onboarding" && (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    const heights = await page.locator('[data-testid="first-task-option"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    check("...every task a full-size press", heights.length === 3 && heights.every((h) => h >= 44), heights.join());
    await press(page.locator('[data-testid="first-task-option"]').nth(1));
    await page.waitForURL(/\/dashboard\/chat/, { timeout: 15000 });
    check("...and a press gives the answer there too", (await answered(page)) && chatAsked.at(-1)?.message === F.tasks.plan.text && chatAsked.at(-1)?.workMode === "run");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }
  {
    reset();
    const { context, page } = await open(OFF, desktop);
    await page.goto(`${OFF}/dashboard/overview`, { waitUntil: "networkidle" });
    await page.getByText(el.onboarding.goalTitle).first().waitFor({ timeout: 10000 }).catch(() => null);
    check("with the switch off a new account meets the questionnaire, as it always did", new URL(page.url()).pathname === "/onboarding" && (await page.locator('[data-testid="first-task"]').count()) === 0 && (await page.getByText(el.onboarding.goalTitle).count()) > 0);
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
