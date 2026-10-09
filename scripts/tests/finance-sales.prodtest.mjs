/*
 * FINANCES AND SALES — IN THE BUILT APP (MASTER 16, package 18):
 * «πλήρωσα 50 ευρώ ρεύμα» is found recorded; a contact moves from stage to
 * stage with a reminder, and the reminder arrives.
 *
 * Run: node scripts/tests/finance-sales.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/finance-sales.prodtest.mjs
 *
 * One production build, the real routes: api/finance/quick from the
 * Finances page, api/sales/[id]/stage from the Sales page, and the
 * reminder job api/cron/lead-reminders called as Vercel calls it, with
 * CRON_SECRET — its note then read back through api/notifications, the
 * bell's own route. The database is the stand-in, keeping the rows.
 *
 * WHAT THIS DOES NOT REACH: a push to a phone. No VAPID keys here, so the
 * job's push is skipped as unconfigured; the bell is checked instead.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch. Greek, then
 * English on a computer. Around it: a doubtful sentence, somebody else's
 * contact, a reminder in the past, the job run twice, the switch off.
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

const OTHER = "00000000-0000-4000-8000-0000000000ff";
const CRON_SECRET = "cron-secret-for-the-test";
let seq = 0;
const uuid = () => `${String(++seq).padStart(8, "0")}-0000-4000-8000-0000000000d8`;
const store = { finance_entries: [], leads: [], user_notifications: [] };
const reset = () => {
  store.finance_entries.length = 0;
  store.user_notifications.length = 0;
  store.leads.splice(
    0,
    Infinity,
    { id: uuid(), user_id: MOCK_USER.id, lead_name: "Ξενοδοχείο Αιγαίο", stage: "new", remind_at: null, reminded_at: null, created_at: new Date(Date.now() - 2000).toISOString() },
    { id: uuid(), user_id: MOCK_USER.id, lead_name: "Ταβέρνα Νάξου", stage: "contacted", remind_at: null, reminded_at: null, created_at: new Date(Date.now() - 1000).toISOString() },
    { id: uuid(), user_id: OTHER, lead_name: "Άλλου πελάτης", stage: "new", remind_at: null, reminded_at: null, created_at: new Date().toISOString() }
  );
};
reset();

function matches(row, url) {
  for (const [key, raw] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    if (op === "eq" && String(row[key]) !== value) return false;
    if (op === "is" && value === "null" && row[key] !== null && row[key] !== undefined) return false;
    if (op === "lte" && !(row[key] && new Date(row[key]).getTime() <= new Date(value).getTime())) return false;
  }
  return true;
}
const SERVICE = "service_role";
function rest({ req, res, url, body, json }) {
  // emailLocaleFor asks GoTrue's admin API for the person's preferred language.
  if (url.pathname.startsWith("/auth/v1/admin/users/")) return json(200, MOCK_USER), true;
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (!(table in store)) return false;
  // RLS for the person's own session; the service role sees every row.
  const asService = (req.headers.authorization ?? "").includes(supa.serviceKey) || (req.headers.apikey ?? "") === supa.serviceKey;
  const rows = store[table];
  const visible = asService ? rows : rows.filter((r) => r.user_id === MOCK_USER.id);
  const hit = visible.filter((r) => matches(r, url));
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
  if (req.method === "GET") return answer([...hit].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))), true;
  if (req.method === "POST") {
    const input = JSON.parse(body || "[]");
    const made = (Array.isArray(input) ? input : [input]).map((r) => ({ id: uuid(), created_at: new Date(Date.now() + seq).toISOString(), ...r }));
    rows.push(...made);
    return answer(made), true;
  }
  if (req.method === "PATCH") {
    const patch = JSON.parse(body || "{}");
    for (const r of hit) Object.assign(r, patch);
    return answer(hit), true;
  }
  return false;
}
void SERVICE;
const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth", preferred_locale: "el" };
const supa = await startMockSupabase({ port: 54407, tableRows: { feature_flags: flags, user_credits: credits }, handle: rest });
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

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
  CRON_SECRET,
  VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
  ANTHROPIC_API_KEY: "placeholder-never-asked",
};
const msgs = (loc) => JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
const EL = msgs("el");
const EN = msgs("en");
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

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
async function open(origin, device, locale = "el") {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: locale, url: origin },
    ].map(({ domain, path: p, ...c }) => c)
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
  return { context, page, press };
}
const mineLead = (name) => store.leads.find((l) => l.lead_name === name);
const runJob = (origin) => fetch(`${origin}/api/cron/lead-reminders`, { headers: { authorization: `Bearer ${CRON_SECRET}` } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

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
  const ON = await start({ ...base, ADMIN_EMAILS: MOCK_USER.email, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label}: a sentence becomes an entry; a contact moves, and is remembered ==`);
    setFlags({});
    reset();
    const { context, page, press } = await open(ON, device);
    await page.goto(`${ON}/dashboard/finance`, { waitUntil: "networkidle" });
    check("Finances has a place to write it", (await page.locator('[data-testid="finance-quick"]').innerText()).includes(EL.dashboard.financeQuick.title));
    await page.locator('[data-testid="finance-quick-text"]').fill("πλήρωσα 50 ευρώ ρεύμα");
    await press(page.locator('[data-testid="finance-quick-save"]'));
    await page.locator('[data-testid="finance-quick-said"]').waitFor({ timeout: 15_000 });
    const entry = store.finance_entries.at(-1);
    check("it is recorded: the person's, an expense of 50, for «ρεύμα»", store.finance_entries.length === 1 && entry.user_id === MOCK_USER.id && entry.type === "expense" && Number(entry.amount) === 50 && entry.description === "ρεύμα", JSON.stringify(entry));
    const money = new Intl.NumberFormat("el", { style: "currency", currency: "EUR" }).format(50);
    check("...and the page says so", (await page.locator('[data-testid="finance-quick-said"]').innerText()).includes(fill(EL.dashboard.financeQuick.doneExpense, { amount: money, description: "ρεύμα" })));
    await page.waitForLoadState("networkidle");
    check("...and it is in the list below", (await page.locator("main").innerText()).includes("ρεύμα"));
    await page.locator('[data-testid="finance-quick-text"]').fill("πλήρωσα 30 και 20 ευρώ");
    await press(page.locator('[data-testid="finance-quick-save"]'));
    await page.getByText(EL.dashboard.financeQuick.missingAmount).waitFor({ timeout: 15_000 });
    check("two amounts: asked, and nothing written", store.finance_entries.length === 1);

    // ---- Sales: a contact moves, with a reminder three days on
    await page.goto(`${ON}/dashboard/sales`, { waitUntil: "networkidle" });
    const leads = page.locator('[data-testid="sales-lead"]');
    check(`the person's contacts, each with its stage (${await leads.count()})`, (await leads.count()) === 2 && (await page.locator("main").innerText()).includes(EL.dashboard.sales.stages.new) && !(await page.locator("main").innerText()).includes("Άλλου πελάτης"));
    const aegean = leads.filter({ hasText: "Ξενοδοχείο Αιγαίο" });
    check("the next stage is offered first", (await aegean.locator('[data-testid="sales-stage"]').inputValue()) === "contacted");
    await press(aegean.locator('[data-testid="sales-move"]'));
    await page.waitForTimeout(1200);
    await page.waitForLoadState("networkidle");
    const moved = mineLead("Ξενοδοχείο Αιγαίο");
    const days = (new Date(moved.remind_at).getTime() - Date.now()) / 86_400_000;
    check("it is moved, with a reminder about three days on, at nine", moved.stage === "contacted" && moved.reminded_at === null && days > 2 && days < 4 && new Date(moved.remind_at).getHours() === 9, JSON.stringify(moved));
    check("...and the page shows where it stands now", (await page.locator('[data-testid="sales-lead"]').filter({ hasText: "Ξενοδοχείο Αιγαίο" }).getAttribute("data-stage")) === "contacted");

    // ---- the reminder comes due, and the job sends it once
    moved.remind_at = new Date(Date.now() - 60_000).toISOString();
    const first = await runJob(ON);
    check("the job, called as Vercel calls it, sends the due reminder", first.status === 200 && first.body?.sent === 1, JSON.stringify(first));
    const again = await runJob(ON);
    check("...once: run again, it sends nothing", again.body?.sent === 0 && moved.reminded_at);
    const bell = await page.request.get(`${ON}/api/notifications`);
    const notes = (await bell.json()).notifications ?? [];
    check("it is in the bell, in the person's language, naming the contact and its stage", notes.some((n) => n.title === fill(EL.dashboard.sales.reminder.title, { name: "Ξενοδοχείο Αιγαίο" }) && n.body === fill(EL.dashboard.sales.reminder.body, { stage: EL.dashboard.sales.stages.contacted }) && String(n.url).includes(moved.id)), JSON.stringify(notes.slice(0, 2)));
    await page.goto(`${ON}/dashboard/sales`, { waitUntil: "networkidle" });
    check("...and listed first on Sales", (await page.locator('[data-testid="sales-due"]').innerText()).includes("Ξενοδοχείο Αιγαίο"));
    const unauthorised = await fetch(`${ON}/api/cron/lead-reminders`);
    check("without the cron's secret, the job does nothing", unauthorised.status === 401);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== in English, desktop ==");
  {
    reset();
    // The account's own language decides the page, as it does in production.
    MOCK_USER.user_metadata = { ...MOCK_USER.user_metadata, preferred_locale: "en" };
    const { context, page, press } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false }, "en");
    await page.goto(`${ON}/dashboard/finance`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="finance-quick-text"]').fill("received $1,250 from ACME");
    await press(page.locator('[data-testid="finance-quick-save"]'));
    await page.locator('[data-testid="finance-quick-said"]').waitFor({ timeout: 15_000 });
    const entry = store.finance_entries.at(-1);
    check("income of 1,250 from ACME, said in English", entry?.type === "income" && Number(entry.amount) === 1250 && (await page.locator('[data-testid="finance-quick-said"]').innerText()).includes(fill(EN.dashboard.financeQuick.doneIncome, { amount: new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(1250), description: "from ACME" })));
    await page.goto(`${ON}/dashboard/sales`, { waitUntil: "networkidle" });
    check("Sales speaks English", (await page.locator('[data-testid="sales-stages"]').innerText()).includes(EN.dashboard.sales.title));
    MOCK_USER.user_metadata = { ...MOCK_USER.user_metadata, preferred_locale: "el" };
    await context.close();
  }

  console.log("\n== around it: somebody else's contact, a past reminder, the switch off ==");
  {
    reset();
    const { context, page } = await open(ON, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${ON}/dashboard/sales`, { waitUntil: "networkidle" });
    const theirs = store.leads.find((l) => l.user_id === OTHER);
    const moveTheirs = await page.request.patch(`${ON}/api/sales/${theirs.id}/stage`, { data: { stage: "won", remindAt: null } });
    check("somebody else's contact cannot be moved", moveTheirs.status() === 404 && theirs.stage === "new");
    const past = await page.request.patch(`${ON}/api/sales/${mineLead("Ταβέρνα Νάξου").id}/stage`, { data: { stage: "meeting", remindAt: new Date(Date.now() - 86_400_000).toISOString() } });
    check("a reminder in the past is refused, and nothing moves", past.status() === 400 && (await past.json()).code === "bad_reminder" && mineLead("Ταβέρνα Νάξου").stage === "contacted");
    const odd = await page.request.patch(`${ON}/api/sales/${mineLead("Ταβέρνα Νάξου").id}/stage`, { data: { stage: "maybe" } });
    check("a stage that does not exist is refused", odd.status() === 400);
    await context.close();

    setFlags({ "finance-sales": "off" });
    const off = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await off.page.goto(`${ON}/dashboard/finance`, { waitUntil: "networkidle" });
    check("with the switch off, Finances is as it was", (await off.page.locator('[data-testid="finance-quick"]').count()) === 0);
    await off.page.goto(`${ON}/dashboard/sales`, { waitUntil: "networkidle" });
    check("...and so is Sales", (await off.page.locator('[data-testid="sales-stages"]').count()) === 0);
    const refused = await off.page.request.post(`${ON}/api/finance/quick`, { data: { text: "πλήρωσα 50 ευρώ ρεύμα" } });
    check("...and the routes refuse", refused.status() === 403 && store.finance_entries.length === 0);
    await off.context.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
