/*
 * «ΓΡΑΦΩ, ΒΛΕΠΩ ΤΑ ΚΟΥΤΙΑ, ΑΛΛΑΖΩ ΕΝΑ ΜΕ ΛΟΓΙΑ, ΚΑΙ ΤΡΕΧΕΙ ΜΟΝΟ ΤΟΥ» — IN THE
 * BUILT APP, DOWN THE THREE SENTENCES OF MASTER 5.18 (package 30).
 *
 * Run: node scripts/tests/automations.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/automations.prodtest.mjs
 *
 * EVERY ROUTE IS THE APP'S OWN, the ones that call the model included:
 * the server's model client is pointed at a stand-in on this machine
 * (ANTHROPIC_BASE_URL, which the SDK reads), which answers as the model
 * would — boxes for a sentence, one question for a sentence without an
 * hour, one changed box, a report, a summary. The database is the
 * stand-in of scripts/lib/mock-supabase.mjs, with the automation tables,
 * the files, the Library and the notifications kept as real rows here
 * (filters, inserts, updates, deletes), so what one route writes the next
 * one reads. The cron is called as Vercel calls it, with CRON_SECRET.
 *
 *   1. «Κάθε πρωί στις 9 στείλε μου στο Telegram τι έχω σήμερα»: asked for
 *      the hour first; the boxes; a box changed with words; the calendar
 *      and Telegram not connected — said on the boxes, and switching on
 *      refused.
 *   2. «Κάθε Δευτέρα φτιάξε αναφορά από τα Οικονομικά μου και στείλ' τη
 *      μου, αφού την εγκρίνω»: the action changed BY HAND to a notification;
 *      a dry run; switched on; the cron runs it at its hour and it waits;
 *      the notification leads to the report; approved, it is sent.
 *   3. «Όταν ανεβάζω αρχείο, κάνε σύνοψη και βάλ' τη στη Βιβλιοθήκη»:
 *      switched on; a file uploaded on the Files page; the summary in the
 *      Library and in the history.
 * Then: undo, the limit, delete, a phone, and the switch off.
 *
 *   7. 2026-11-05, after the owner's automation videos, in both shells
 *      (the old one and the approved editor layout), on a computer and
 *      with a finger: Simple says «Όταν → Αν → Κάνε»; Pro's lines light up
 *      while a run is REALLY going (the stand-in model holds its answer,
 *      and the screen reads the run's own steps), with reduced motion
 *      taking the dots away; a failed run marks its box; the gallery
 *      makes a whole automation with one press, off, editable after; and
 *      «Σου γλίτωσε» from the person's minutes — and nothing at all when
 *      the switch is closed or the column is not in the database yet.
 *
 *      SHOT_DIR=<dir> writes a picture of each screen there.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
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
// The tables the automations write and read, kept as rows.
// ---------------------------------------------------------------------
const STATEFUL = ["automation_flows", "automation_flow_versions", "automation_runs", "user_documents", "user_notifications", "user_files", "finance_entries", "user_integrations", "user_delivery_channels"];
const store = Object.fromEntries(STATEFUL.map((t) => [t, []]));
store.finance_entries.push(
  { id: "f1", user_id: MOCK_USER.id, description: "Ενοίκια σκηνών", type: "income", amount: 1850, created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() },
  { id: "f2", user_id: MOCK_USER.id, description: "Ρεύμα", type: "expense", amount: 240, created_at: new Date(Date.now() - 86_400_000).toISOString() }
);
let seq = 0;
const uuid = () => `9${String(++seq).padStart(7, "0")}-0000-4000-8000-000000000000`;
function matches(row, url) {
  for (const [key, raw] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    if (key === "or") continue; // the claims' "free or stale": always free here
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    const cell = row[key];
    if (op === "eq" && String(cell) !== value) return false;
    if (op === "neq" && String(cell) === value) return false;
    if (op === "gte" && !(String(cell) >= value)) return false;
    if (op === "lte" && !(cell !== null && cell !== undefined && String(cell) <= value)) return false;
    if (op === "lt" && !(cell !== null && cell !== undefined && String(cell) < value)) return false;
    if (op === "is" && value === "null" && cell !== null && cell !== undefined) return false;
    if (op === "not" && raw.startsWith("not.is.null") && (cell === null || cell === undefined)) return false;
    if (op === "in") {
      const set = value.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, ""));
      if (!set.includes(String(cell))) return false;
    }
  }
  return true;
}
const DEFAULTS = {
  automation_flows: () => ({ is_active: false, time_zone: "Europe/Athens", next_run_at: null, last_run_at: null, cost_limit: 100, busy_since: null, created_at: new Date().toISOString() }),
  automation_runs: () => ({ status: "queued", steps: [], state: null, credits_charged: 0, error: null, approval_expires_at: null, started_at: new Date(Date.now() + seq).toISOString(), finished_at: null, event_ref: null }),
  user_files: () => ({ uploaded_at: new Date().toISOString(), created_at: new Date().toISOString() }),
};
const writes = [];
let minutesColumnMissing = false;
function rest({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (!STATEFUL.includes(table)) return false;
  // A DATABASE THE MIGRATION HAS NOT REACHED (20261114000000): the column
  // is not there, so a read that names it, or a write that sets it, is
  // refused the way Postgres and PostgREST refuse it.
  if (table === "automation_flows" && minutesColumnMissing && (/minutes_saved/.test(url.searchParams.get("select") ?? "") || /minutes_saved/.test(body ?? ""))) {
    json(400, req.method === "GET" ? { code: "42703", message: "column automation_flows.minutes_saved does not exist" } : { code: "PGRST204", message: "Could not find the 'minutes_saved' column of 'automation_flows' in the schema cache" });
    return true;
  }
  const rows = store[table];
  const hit = rows.filter((r) => matches(r, url));
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (list) => {
    if ((req.headers.prefer ?? "").includes("count=")) {
      res.writeHead(200, { "Content-Type": "application/json", "Content-Range": list.length ? `0-${list.length - 1}/${list.length}` : "*/0" });
      res.end(req.method === "HEAD" ? "" : JSON.stringify(list));
      return;
    }
    if (single) return list[0] ? json(200, list[0]) : json(406, { message: "no rows" });
    json(200, list);
  };
  if (req.method === "GET" || req.method === "HEAD") {
    let list = [...hit];
    const order = url.searchParams.get("order");
    if (order) {
      const [col, dir] = order.split(".");
      list.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === "desc" ? -1 : 1));
    }
    const limit = Number(url.searchParams.get("limit"));
    if (limit) list = list.slice(0, limit);
    answer(list);
    return true;
  }
  if (req.method === "POST") {
    const input = JSON.parse(body || "[]");
    const made = (Array.isArray(input) ? input : [input]).map((r) => ({ id: uuid(), ...(DEFAULTS[table]?.() ?? {}), ...r }));
    rows.push(...made);
    writes.push({ table, method: "POST", rows: made });
    answer(made);
    return true;
  }
  if (req.method === "PATCH") {
    const patch = JSON.parse(body || "{}");
    for (const r of hit) Object.assign(r, patch);
    writes.push({ table, method: "PATCH", patch, count: hit.length });
    answer(hit);
    return true;
  }
  if (req.method === "DELETE") {
    for (const r of hit) rows.splice(rows.indexOf(r), 1);
    // Versions and runs go with their automation, as the foreign keys say.
    if (table === "automation_flows") {
      for (const t of ["automation_flow_versions", "automation_runs"]) store[t] = store[t].filter((r) => !hit.some((f) => f.id === r.flow_id));
    }
    answer(hit);
    return true;
  }
  return false;
}

const flags = [];
const bucket = new Map();
// The person's language, as the account keeps it: what a notification is written in.
MOCK_USER.user_metadata = { ...(MOCK_USER.user_metadata ?? {}), preferred_locale: "el" };
const supa = await startMockSupabase({
  port: 54381,
  tableRows: { feature_flags: flags, user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }] },
  // THE FILES BUCKET: what the browser stores is what the register route reads back.
  handle: (ctx) => {
    const m = ctx.url.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/)?user-files\/(.+)$/);
    if (m && ctx.req.method === "POST") {
      bucket.set(decodeURIComponent(m[1]), ctx.body);
      ctx.json(200, { Key: `user-files/${m[1]}` });
      return true;
    }
    if (m && ctx.req.method === "GET") {
      const bytes = bucket.get(decodeURIComponent(m[1]));
      if (bytes === undefined) return ctx.json(404, { message: "not found" }), true;
      ctx.res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      ctx.res.end(bytes);
      return true;
    }
    if (ctx.url.pathname.startsWith("/storage/v1/object/user-files")) return ctx.json(200, []), true;
    return rest(ctx);
  },
});
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

// ---------------------------------------------------------------------
// The model, answered as the model would.
// ---------------------------------------------------------------------
const MORNING = (at) => [
  { id: "b1", kind: "start", when: "time", every: "day", at },
  { id: "b2", kind: "read", source: "calendar_today" },
  { id: "b3", kind: "ai", instruction: "Γράψε σύντομα τι έχω σήμερα, με τις ώρες" },
  { id: "b4", kind: "action", do: "send_telegram" },
];
const MONDAY = [
  { id: "b1", kind: "start", when: "time", every: "week", at: "08:00", weekday: 1 },
  { id: "b2", kind: "read", source: "finances_week" },
  { id: "b3", kind: "ai", instruction: "Φτιάξε αναφορά της εβδομάδας από τα έσοδα και τα έξοδα" },
  { id: "b4", kind: "approval" },
  { id: "b5", kind: "action", do: "send_email" },
];
const UPLOAD = [
  { id: "b1", kind: "start", when: "file_uploaded" },
  { id: "b2", kind: "read", source: "uploaded_file" },
  { id: "b3", kind: "ai", instruction: "Κάνε σύνοψη του αρχείου σε πέντε γραμμές" },
  { id: "b4", kind: "action", do: "save_to_library" },
];
const modelAsked = [];
// How long the stand-in model holds its answer: long enough, in §7, to see
// a run that is really going — its row says it is at the AI box.
let modelDelayMs = 0;
const tool = (name, input) => ({ id: "msg", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [{ type: "tool_use", id: "t", name, input }], stop_reason: "tool_use", usage: { input_tokens: 900, output_tokens: 300 } });
const text = (t) => ({ id: "msg", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 1200, output_tokens: 200 } });
const model = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const asked = JSON.parse(body || "{}");
    modelAsked.push(asked);
    const words = JSON.stringify(asked.messages ?? []);
    let out;
    if (asked.tool_choice?.name === "set_automation") {
      // Keyed on the person's own words: "κάθε πρωί" with no hour is a question.
      if (words.includes("κάθε πρωί") && !/9|εννιά/.test(words.split("Their time zone")[0])) out = tool("set_automation", { name: "", boxes: [], question: "Τι ώρα το πρωί να σου στέλνω;", unsupported: "" });
      else if (words.includes("κάθε πρωί")) out = tool("set_automation", { name: "Το πρωινό μου", boxes: MORNING("09:00"), question: "", unsupported: "" });
      else if (words.includes("Δευτέρα")) out = tool("set_automation", { name: "Αναφορά Δευτέρας", boxes: MONDAY, question: "", unsupported: "" });
      else out = tool("set_automation", { name: "Σύνοψη αρχείων", boxes: UPLOAD, question: "", unsupported: "" });
    } else if (asked.tool_choice?.name === "set_box") {
      out = tool("set_box", { box: { id: "b1", kind: "start", when: "time", every: "day", at: "08:00" } });
    } else if (words.includes("Φτιάξε αναφορά")) {
      out = text("Αναφορά εβδομάδας: έσοδα 1.850,00 €, έξοδα 240,00 €, καθαρά 1.610,00 €.");
    } else {
      out = text("Σύνοψη: η σύμβαση μίσθωσης ισχύει ως τις 31/12/2027 με μηνιαίο μίσθωμα 900 €.");
    }
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
      res.end(JSON.stringify(out));
    }, modelDelayMs);
  });
});
await new Promise((r) => model.listen(0, "127.0.0.1", r));
const MODEL_URL = `http://127.0.0.1:${model.address().port}`;

const freePort = () =>
  new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
const CRON_SECRET = "cron-secret-for-this-test-only-0123456789";
const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  // The owner's account: not charged, so no credit machinery is needed to
  // walk the screens. What a charged run holds and settles is held by
  // automations.test.mjs and automations.itest.mjs.
  ADMIN_EMAILS: MOCK_USER.email,
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: MODEL_URL,
  CRON_SECRET,
  RESEND_API_KEY: "",
};

const el = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.automations;
// The shared shell's own words (the «Simple | Pro» switch lives there, not
// in the Automations namespace — directive 55, Κομμάτι 1).
const el2 = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.toolShell;
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
// The brand names the boxes print, read from where the screen takes them.
const CONNECTION = {
  google_calendar: readFileSync("src/lib/integrations/providers.ts", "utf8").match(/id: "google_calendar",[\s\S]*?name: "([^"]+)"/)[1],
  telegram: readFileSync("src/components/automations/flow-boxes.tsx", "utf8").match(/telegram: "([^"]+)"/)[1],
};

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
async function open(origin, device) {
  // A person in Greece: the browser's zone is the one an automation is made in.
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, timezoneId: "Europe/Athens", reducedMotion: device.reducedMotion ?? "no-preference" });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: "el", url: origin },
    ].map(({ domain, path, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  page.on("dialog", (d) => d.accept());
  const cdp = device.touch ? await context.newCDPSession(page) : null;
  async function press(locator) {
    await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.click();
    // A finger lands where the thing IS: wait out a slide (the history column
    // takes 200ms to come in) before taking its place from the page.
    let box = await locator.boundingBox();
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 60));
      const next = await locator.boundingBox();
      const still = next && box && Math.abs(next.x - box.x) < 0.5 && Math.abs(next.y - box.y) < 0.5;
      box = next;
      if (still) break;
    }
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return { context, page, press };
}
async function say(page, press, words) {
  await page.locator("textarea").first().fill(words);
  await press(page.locator('button[type="submit"]').first());
}
async function settle(page) {
  await page.waitForFunction(() => !document.querySelector('[aria-live="polite"]')?.textContent?.trim(), null, { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(300);
}
const thread = (page) => page.locator('[data-testid="tool-shell-thread"]').innerText();
/** Waits, up to ten seconds, for something the server writes into the stand-in's rows. */
async function until(fn, ms = 10000) {
  for (let waited = 0; waited < ms && !fn(); waited += 100) await new Promise((r) => setTimeout(r, 100));
}
const flowNamed = (name) => store.automation_flows.find((f) => f.name === name);
const runsOf = (flow) => store.automation_runs.filter((r) => r.flow_id === flow?.id);

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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  const desktop = { viewport: { width: 1440, height: 900 }, touch: false };
  // SECTIONS 1-4 DRIVE PRO'S BOXES, so they say so rather than leaning on a
  // default. `agents-automations-pro` (directive 55) fails towards "staff"
  // and ADMIN_EMAILS above is this very account, so leaving it unset would
  // open every one of them in Simple — where there is no `flow-box` to
  // press, and four sections would fail for a reason that is not theirs.
  // Section 6 is the one that turns it on. (The old `automations` row this
  // line used to set went away with that switch on 2026-10-23.)
  setFlags({ "agents-automations-pro": "off" });

  // =================================================================
  console.log("\n== 1. «Κάθε πρωί στις 9 στείλε μου στο Telegram τι έχω σήμερα» ==");
  {
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    check("the tool opens in the shell: its name, what it does, and the price before anything is spent",
      (await page.locator("main").innerText()).includes(el.name) && (await page.locator("main").innerText()).includes(el.help) && /\d/.test(await page.locator('[data-testid="flow-price"]').innerText()));
    await say(page, press, "Στείλε μου στο Telegram κάθε πρωί τι έχω σήμερα");
    await settle(page);
    check("a sentence without an hour is answered with one question, and nothing is made", (await thread(page)).includes("Τι ώρα το πρωί να σου στέλνω;") && store.automation_flows.length === 0);
    check("...the field now asks for the answer", (await page.locator("textarea").first().getAttribute("placeholder")) === el.placeholderAnswer);
    await say(page, press, "στις 9");
    await settle(page);
    const asked = modelAsked.filter((m) => m.tool_choice?.name === "set_automation").at(-1);
    check("the answer goes back WITH the sentence it was about", JSON.stringify(asked.messages).includes("κάθε πρωί τι έχω σήμερα") && JSON.stringify(asked.messages).includes("στις 9"));
    const morning = flowNamed("Το πρωινό μου");
    check("the automation is made, off, with its first version", morning && morning.is_active === false && store.automation_flow_versions.filter((v) => v.flow_id === morning.id).length === 1);
    const boxes = page.locator('[data-testid="flow-box"]');
    check("its four boxes are drawn, top to bottom, each one saying what it does",
      (await boxes.count()) === 4 && (await boxes.nth(0).innerText()).includes(fill(el.start.day, { at: "09:00" })) && (await boxes.nth(1).innerText()).includes(el.sources.calendar_today) && (await boxes.nth(3).innerText()).includes(el.actions.send_telegram));
    const needs = await page.locator('[data-testid="flow-needs"]').allInnerTexts();
    check("the calendar and Telegram are not connected: each box says so, with the press that connects it",
      needs.length === 2 && needs[0].includes(fill(el.needsConnection, { name: CONNECTION.google_calendar })) && needs[1].includes(fill(el.needsConnection, { name: CONNECTION.telegram })) && (await page.locator('[data-testid="flow-needs"] a').first().getAttribute("href")) === "/dashboard/integrations");
    // Change ONE box with words.
    await press(boxes.nth(0));
    check("pressing a box chooses it: the field says it will change only that one", (await page.locator('[data-testid="box-chosen"]').innerText()).includes(el.kinds.start) && (await page.locator("textarea").first().getAttribute("placeholder")) === el.placeholderBox);
    await say(page, press, "στις 8 αντί για 9");
    await settle(page);
    const changeAsked = modelAsked.filter((m) => m.tool_choice?.name === "set_box").at(-1);
    check("the model is asked for that one box, shown the row", changeAsked && JSON.stringify(changeAsked.messages).includes("στις 8 αντί για 9"));
    check("only that box changed: the start is 08:00, the other three are as they were",
      (await boxes.nth(0).innerText()).includes(fill(el.start.day, { at: "08:00" })) && JSON.stringify(flowNamed("Το πρωινό μου").boxes.slice(1)) === JSON.stringify(MORNING("09:00").slice(1)) && flowNamed("Το πρωινό μου").version === 2);
    await press(page.locator('[data-testid="flow-toggle"]'));
    await settle(page);
    check("switching it on is refused while the calendar and Telegram are not connected, and it says which",
      flowNamed("Το πρωινό μου").is_active === false && (await thread(page)).includes(fill(el.errors.needsConnection, { names: `${CONNECTION.google_calendar}, ${CONNECTION.telegram}` })));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 2. «Κάθε Δευτέρα φτιάξε αναφορά … αφού την εγκρίνω» ==");
  {
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    await say(page, press, "Κάθε Δευτέρα φτιάξε αναφορά από τα Οικονομικά μου και στείλ' τη μου, αφού την εγκρίνω");
    await settle(page);
    const monday = flowNamed("Αναφορά Δευτέρας");
    const boxes = page.locator('[data-testid="flow-box"]');
    check("five boxes, with the approval before the sending", monday && (await boxes.count()) === 5 && (await boxes.nth(3).getAttribute("data-kind")) === "approval" && (await boxes.nth(0).innerText()).includes(fill(el.start.week, { day: el.weekdays.d1, at: "08:00" })));
    // Change the action BY HAND: to the app's own notification.
    await press(boxes.nth(4));
    await page.locator('[data-testid="flow-box-editor"] select').selectOption("notify");
    await press(page.locator('[data-testid="flow-box-save"]'));
    await settle(page);
    // A save by hand shows nothing while it is in flight (no "working"
    // line to wait out), so wait for what it wrote and what the box says.
    await until(() => flowNamed("Αναφορά Δευτέρας")?.version === 2);
    await boxes.nth(4).filter({ hasText: el.actions.notify }).waitFor({ timeout: 10000 }).catch(() => null);
    check("a box changed by hand: no model call, a new version, the box says so",
      flowNamed("Αναφορά Δευτέρας").boxes[4].do === "notify" && flowNamed("Αναφορά Δευτέρας").version === 2 && (await boxes.nth(4).innerText()).includes(el.actions.notify) && !modelAsked.some((m) => JSON.stringify(m).includes("notify\"}") && m.tool_choice?.name === "set_box"));
    // Undo, then redo by hand.
    await press(page.locator('[data-testid="flow-undo"]'));
    await settle(page);
    check("«Αναίρεση» puts back the box as it was", flowNamed("Αναφορά Δευτέρας").boxes[4].do === "send_email" && flowNamed("Αναφορά Δευτέρας").version === 1 && (await boxes.nth(4).innerText()).includes(el.actions.send_email));
    await press(boxes.nth(4));
    await page.locator('[data-testid="flow-box-editor"] select').selectOption("notify");
    await press(page.locator('[data-testid="flow-box-save"]'));
    await settle(page);
    check("...and changed again, the undone version is replaced, not stacked", flowNamed("Αναφορά Δευτέρας").version === 2 && store.automation_flow_versions.filter((v) => v.flow_id === monday.id).length === 2);
    // Dry run.
    await press(page.locator('[data-testid="flow-try"]'));
    await settle(page);
    const dry = runsOf(monday).find((r) => r.started_by === "dry");
    check("a dry run: every box ran, the approval passed through, nothing was sent",
      dry?.status === "done" && dry.steps.map((s) => s.note).join() === "started,read_items,ai_done,would_wait,would_send" && store.user_notifications.length === 0, JSON.stringify(dry?.steps));
    await page.locator('[data-testid="flow-run"]').first().waitFor({ timeout: 10000 }).catch(() => null);
    const shownRun = await page.locator('[data-testid="flow-run"]').first().innerText();
    await press(page.locator('[data-testid="flow-run"] button').first());
    const wouldSend = await page.locator('[data-testid="flow-output"]').first().innerText().catch(() => "");
    check("...its history says it was a try, and what it would have sent", shownRun.includes(el.by.dry) && wouldSend.startsWith("Αναφορά εβδομάδας: έσοδα 1.850,00 €"), `${shownRun} | ${wouldSend}`);
    // Switch on.
    await press(page.locator('[data-testid="flow-toggle"]'));
    await settle(page);
    const on = flowNamed("Αναφορά Δευτέρας");
    const next = new Date(on.next_run_at ?? 0);
    const athens = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(next);
    check("switched on, its next run is a Monday at 08:00 in Athens", on.is_active === true && athens === "Mon 08:00", athens);
    check("...and the screen says when", (await page.locator('[data-testid="flow-state"]').innerText()).includes(el.status.on));
    // The hour comes: the cron, as Vercel calls it.
    on.next_run_at = new Date(Date.now() - 60_000).toISOString();
    const refused = await page.request.get(`${ON}/api/cron/automation-flows`);
    check("the cron refuses a call without its secret", refused.status() === 401 || refused.status() === 403);
    const tick = await page.request.get(`${ON}/api/cron/automation-flows`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    const tickBody = await tick.json();
    const timed = runsOf(monday).find((r) => r.started_by === "time");
    check("at its hour the server runs it on its own", tick.status() === 200 && tickBody.ran === 1 && timed, JSON.stringify(tickBody));
    check("...moving the next run a week on before it ran", new Date(flowNamed("Αναφορά Δευτέρας").next_run_at).getTime() > Date.now() + 86_400_000);
    check("...and it stops at the approval, with the report", timed?.status === "waiting_approval" && timed.state?.text?.startsWith("Αναφορά εβδομάδας") && timed.steps.at(-1).note === "approval_waiting");
    const note = store.user_notifications.at(-1);
    check("the person is told, and the notification leads to that run", note && note.url === `/dashboard/automation?run=${timed?.id}` && note.body === fill(el.notify.approval, { name: "Αναφορά Δευτέρας" }), JSON.stringify(note));
    const again = await page.request.get(`${ON}/api/cron/automation-flows`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    check("the next tick does not run it again", (await again.json()).ran === 0 && runsOf(monday).filter((r) => r.started_by === "time").length === 1);
    // Follow the notification.
    await page.goto(`${ON}${note.url}`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="flow-approve"]').waitFor({ timeout: 10000 }).catch(() => null);
    check("the notification opens the automation at the waiting run, showing what will be sent",
      (await page.locator('[data-testid="flow-output"]').first().innerText()).startsWith("Αναφορά εβδομάδας") && (await page.locator('[data-testid="flow-approve"]').isVisible()));
    await press(page.locator('[data-testid="flow-approve"]'));
    await settle(page);
    const approved = runsOf(monday).find((r) => r.id === timed.id);
    const sent = store.user_notifications.filter((n) => n.body?.includes("Αναφορά εβδομάδας"));
    check("approved, it goes on from the box after the approval and sends what the person read",
      approved.status === "done" && approved.steps.map((s) => s.note).join() === "started,read_items,ai_done,approval_given,sent" && sent.length === 1, JSON.stringify(approved.steps));
    check("...without asking the model again", modelAsked.filter((m) => JSON.stringify(m.messages).includes("Φτιάξε αναφορά")).length === 2);
    const approveAgain = await page.request.post(`${ON}/api/automations/runs/${timed.id}/approve`);
    check("...and a second press sends nothing more", approveAgain.status() === 409 && (await approveAgain.json()).code === "not_waiting" && store.user_notifications.filter((n) => n.body?.includes("Αναφορά εβδομάδας")).length === 1);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 3. «Όταν ανεβάζω αρχείο, κάνε σύνοψη και βάλ' τη στη Βιβλιοθήκη» ==");
  {
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    // THE [◧] EMPTY LANDING'S EXAMPLES SEND IMMEDIATELY (Batch 3,
    // 2026-10-22) — not "fill the field", the old "flow-examples" panel's
    // way.
    await press(page.locator('[data-testid="tool-shell-example"]', { hasText: el.example.file }));
    check("an example sends immediately", (await page.locator('[data-testid="tool-shell-thread"]').innerText()).includes(el.example.file));
    await settle(page);
    const upload = flowNamed("Σύνοψη αρχείων");
    check("four boxes: a file, read, summarised, into the Library", upload && (await page.locator('[data-testid="flow-box"]').count()) === 4 && (await page.locator('[data-testid="flow-needs"]').count()) === 0);
    await press(page.locator('[data-testid="flow-toggle"]'));
    await settle(page);
    check("switched on: it runs on every file, with no next hour", flowNamed("Σύνοψη αρχείων").is_active === true && flowNamed("Σύνοψη αρχείων").next_run_at === null && (await page.locator('[data-testid="flow-state"]').innerText()).includes(el.status.onFile));
    // Upload on the Files page, as anybody would.
    await page.goto(`${ON}/dashboard/files`, { waitUntil: "networkidle" });
    const contract = Buffer.from("Σύμβαση μίσθωσης. Ισχύει ως τις 31/12/2027. Μίσθωμα 900 € τον μήνα.");
    const seen = [];
    page.on("request", (r) => seen.push(`${r.method()} ${new URL(r.url()).pathname}`));
    page.on("console", (m) => seen.push(`console ${m.type()}: ${m.text().slice(0, 160)}`));
    const kicked = page.waitForResponse((r) => r.url().endsWith("/api/automations/events"), { timeout: 30000 }).catch(() => null);
    const registered = page.waitForResponse((r) => /\/api\/files\/(register|upload)$/.test(r.url()), { timeout: 30000 }).catch(() => null);
    // The Files tool's own picker (the shell's, or the page's before it), not another one on the screen.
    await page.locator('[data-testid="analyze-upload-input"]').first().setInputFiles({ name: "σύμβαση.md", mimeType: "text/markdown", buffer: contract });
    const reg = await registered;
    const regBody = reg ? await reg.json().catch(() => null) : null;
    check("the file is stored and read, and its answer says one automation was started", reg?.status() === 200 && regBody?.file?.processing_status === "ready" && regBody.automations === 1, `${JSON.stringify(regBody)}\n        seen: ${seen.filter((x) => !/_next|favicon/.test(x)).slice(-15).join(" | ")}\n        inputs: ${await page.locator('input[type="file"]').count()} ${await page.locator('input[type="file"]').first().getAttribute("data-testid")}\n        url: ${page.url()}\n        main: ${(await page.locator("main").innerText()).slice(0, 400).replace(/\n/g, " / ")}`);
    const kick = await kicked;
    check("the upload that started an automation asks for it to run, at once", Boolean(kick) && kick.status() === 200 && (await kick.json()).ran === 1);
    const run = runsOf(upload).find((r) => r.started_by === "event");
    const doc = store.user_documents.at(-1);
    check("the file was read, summarised, and the summary is in the Library as the person's document",
      run?.status === "done" && doc?.user_id === MOCK_USER.id && doc.content.html.includes("Σύνοψη: η σύμβαση μίσθωσης ισχύει ως τις 31/12/2027") && doc.title.startsWith("Σύνοψη αρχείων — "), JSON.stringify(run?.steps));
    check("...and what was read was the file, fenced as data", modelAsked.some((m) => JSON.stringify(m.messages).includes("Μίσθωμα 900") && JSON.stringify(m.messages).includes("UNTRUSTED")));
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    await press(page.locator('[data-testid="tool-shell-history-toggle"]'));
    await press(page.locator('[data-testid="shell-history-row"]', { hasText: "Σύνοψη αρχείων" }));
    await page.locator('[data-testid="flow-run"]').first().waitFor({ timeout: 10000 }).catch(() => null);
    check("the history shows the run from the file, done", (await page.locator('[data-testid="flow-run"]').count()) > 0 && (await page.locator('[data-testid="flow-run"]').first().innerText()).includes(el.by.event) && (await page.locator('[data-testid="flow-run"]').first().innerText()).includes(el.runStatus.done));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 4. the limit, delete, a phone ==");
  {
    const { context, page, press } = await open(ON, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    check("on a phone the field and the options fit the screen", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    await press(page.locator('[data-testid="tool-shell-history-toggle"]'));
    await press(page.locator('[data-testid="shell-history-row"]', { hasText: "Αναφορά Δευτέρας" }));
    await page.locator('[data-testid="tool-shell-work"]').waitFor({ timeout: 10000 });
    check("...the automation covers the screen, with a way back", await page.locator('[data-testid="tool-shell-back"]').isVisible());
    await page.locator('[data-testid="flow-limit"]').fill("1");
    await press(page.locator('[data-testid="flow-limit-save"]'));
    await settle(page);
    check("the limit is set by hand", flowNamed("Αναφορά Δευτέρας").cost_limit === 1);
    const before = modelAsked.length;
    await press(page.locator('[data-testid="flow-try"]'));
    await settle(page);
    const limited = runsOf(flowNamed("Αναφορά Δευτέρας")).find((r) => r.started_by === "dry" && r.steps.some((s) => s.note === "over_limit"));
    check("a run that would pass it stops before the AI box, asking nothing", limited?.status === "stopped" && modelAsked.length === before);
    const gone = flowNamed("Αναφορά Δευτέρας").id;
    await press(page.locator('[data-testid="flow-delete"]'));
    await settle(page);
    check("deleted: the automation, its versions and its runs are gone", !store.automation_flows.some((f) => f.id === gone) && !store.automation_flow_versions.some((v) => v.flow_id === gone) && !store.automation_runs.some((r) => r.flow_id === gone));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 5. no switch: the tool is for everybody ==");
  {
    // 2026-10-23: the switch `automations` is gone, so the old "switch off"
    // section has no off to hold. What it protected, that nobody is shut out of
    // the tool or refused by its routes, is held the other way round: an
    // account with no switch set at all gets the shell and an answer.
    setFlags({});
    const { context, page } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    check("with no switch set the page is the automation shell, for everybody", (await page.locator('[data-testid="tool-shell"]').count()) === 1 && (await page.locator("main").count()) === 1);
    const r = await page.request.post(`${ON}/api/automations/flows`, { data: { said: "κάθε πρωί στις 9", timeZone: "Europe/Athens" } });
    check("...and the routes answer instead of refusing", r.status() !== 403 && (await r.json().catch(() => ({}))).code !== "not_enabled", String(r.status()));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 6. «Simple | Pro»: two levels, one automation (directive 55, Κομμάτι 1) ==");
  // =================================================================
  // Pressed for real, on a computer and with a finger, in the built app.
  // A row of its own rather than one left over from a section above, so
  // the count below is a fact about THIS automation and not about what
  // some earlier press happened to leave behind.
  {
    const SIX = [
      { id: "b1", kind: "start", when: "time", every: "day", at: "09:00" },
      { id: "b2", kind: "read", source: "finances_week" },
      { id: "b3", kind: "ai", instruction: "Κάνε σύνοψη των εξόδων της εβδομάδας." },
      { id: "b4", kind: "condition", test: "has_content" },
      { id: "b5", kind: "approval" },
      { id: "b6", kind: "action", do: "save_to_library" },
    ];
    const FLOW = {
      id: "55000000-0000-4000-8000-000000000055",
      user_id: MOCK_USER.id,
      name: "Δύο επίπεδα",
      said: "κάθε μέρα στις 9 σύνοψη των εξόδων στη Βιβλιοθήκη",
      boxes: SIX,
      version: 1,
      is_active: false,
      time_zone: "Europe/Athens",
      next_run_at: null,
      last_run_at: null,
      cost_limit: 50,
      busy_since: null,
      created_at: "2026-11-04T08:00:00Z",
    };
    store.automation_flows.push(FLOW);
    const AT = `${ON}/dashboard/automation?flow=${FLOW.id}`;

    setFlags({ "agents-automations-pro": "everyone" });
    for (const device of [desktop, { viewport: { width: 390, height: 844 }, touch: true }]) {
      const how = device.touch ? "with a finger" : "on a computer";
      const { context, page, press } = await open(ON, device);
      await page.goto(AT, { waitUntil: "networkidle" });
      await page.locator('[data-testid="tool-shell-work"]').waitFor({ timeout: 10000 });

      // THE SWITCH IS IN THE SHELL'S OWN WORK BAR, beside the title — not a
      // bar Automations drew (docs/TOOL-RULES.md). Asserted by where it is
      // in the DOM, not by its existence somewhere on the page.
      const inBar = await page.evaluate(() => {
        const sw = document.querySelector('[data-testid="shell-mode"]');
        const work = document.querySelector('[data-testid="tool-shell-work"]');
        return Boolean(sw && work && work.firstElementChild?.contains(sw));
      });
      check(`${how}: the «Simple | Pro» switch is in the work bar of the shared shell`, inBar);
      check(`${how}: both levels are named, neither shortened`,
        (await page.locator('[data-testid="shell-mode-simple"]').innerText()).trim() === el2.mode.simple &&
        (await page.locator('[data-testid="shell-mode-pro"]').innerText()).trim() === el2.mode.pro);

      // SIMPLE FIRST: every step, in words, nothing to press.
      check(`${how}: Simple opens, and shows every step as a line`,
        (await page.locator('[data-testid="shell-mode"]').getAttribute("data-mode")) === "simple" &&
        (await page.locator('[data-testid="flow-step"]').count()) === SIX.length &&
        (await page.locator('[data-testid="flow-box"]').count()) === 0);
      // NOT `el.kinds.condition.toUpperCase()`: the kind label is uppercased
      // by CSS, and Chromium drops the Greek accent doing it (ΣΥΝΘΗΚΗ) while
      // JS keeps it (ΣΥΝΘΉΚΗ) — the two can never be equal, so a check
      // written that way could never go red. These are both untransformed
      // strings, so this fails if Simple ever starts speaking Pro's words.
      const simpleWords = await page.locator('[data-testid="flow-steps"]').innerText();
      check(`${how}: ...in plain words — one sentence for the condition, not Pro's two halves`,
        simpleWords.includes(el.approval) && simpleWords.includes(el.simple.onlyIf) && !simpleWords.includes(el.conditionElse));

      // PRO: the canvas that was always there, and a box still configurable.
      await press(page.locator('[data-testid="shell-mode-pro"]'));
      await page.locator('[data-testid="flow-box"]').first().waitFor({ timeout: 10000 });
      check(`${how}: Pro draws the same steps as boxes, with the kinds and the else branch`,
        (await page.locator('[data-testid="flow-box"]').count()) === SIX.length &&
        (await page.locator('[data-testid="flow-step"]').count()) === 0 &&
        (await page.locator('[data-testid="flow-branch"]').count()) === 1);
      await press(page.locator('[data-testid="flow-box"]').nth(2));
      await page.waitForTimeout(400);
      check(`${how}: ...and pressing a box still opens its editor, named under the field`,
        (await page.locator('[data-testid="box-chosen"]').count()) === 1 && (await page.locator('[data-testid="flow-box"][aria-pressed="true"]').count()) === 1);

      // BACK TO SIMPLE: the same automation, no step lost either way.
      await press(page.locator('[data-testid="shell-mode-simple"]'));
      await page.locator('[data-testid="flow-step"]').first().waitFor({ timeout: 10000 });
      check(`${how}: back in Simple every step is still there, and the editor is gone`,
        (await page.locator('[data-testid="flow-step"]').count()) === SIX.length &&
        (await page.locator('[data-testid="box-chosen"]').count()) === 0);
      check(`${how}: nothing is stored for the level — the automation is byte-for-byte what it was`,
        JSON.stringify(flowNamed("Δύο επίπεδα").boxes) === JSON.stringify(SIX) && flowNamed("Δύο επίπεδα").version === 1);
      if (device.touch) {
        check("on a phone neither level pushes the screen sideways", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
      }
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }

    // WITHOUT THE SWITCH: the screen as it was. Nobody loses the boxes.
    // "off", not {}: an absent row falls back to "staff" (lib/flags/flags.ts
    // fails towards it on purpose), and ADMIN_EMAILS here is this account,
    // so {} would leave the switch ON and this would be testing the opposite
    // of what it says. It did, on the first run, and said so.
    setFlags({ "agents-automations-pro": "off" });
    {
      const { context, page } = await open(ON, desktop);
      await page.goto(AT, { waitUntil: "networkidle" });
      await page.locator('[data-testid="tool-shell-work"]').waitFor({ timeout: 10000 });
      check("with the switch off there is no switch, and the boxes are what you get",
        (await page.locator('[data-testid="shell-mode"]').count()) === 0 &&
        (await page.locator('[data-testid="flow-box"]').count()) === SIX.length &&
        (await page.locator('[data-testid="flow-step"]').count()) === 0);
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }
  }

  // =================================================================
  console.log("\n== 7. 2026-11-05: «Όταν → Αν → Κάνε», the live canvas, the gallery, time saved ==");
  // =================================================================
  {
    const SHOTS = process.env.SHOT_DIR || "";
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    const LIVE_BOXES = [
      { id: "b1", kind: "start", when: "time", every: "day", at: "09:00" },
      { id: "b2", kind: "read", source: "finances_week" },
      { id: "b3", kind: "ai", instruction: "Κάνε σύνοψη των εξόδων της εβδομάδας." },
      { id: "b4", kind: "condition", test: "has_content" },
      { id: "b5", kind: "action", do: "save_to_library" },
    ];
    const flowRow = (id, name, boxes, extra = {}) => ({
      id, user_id: MOCK_USER.id, name, said: name, boxes, version: 1, is_active: false, time_zone: "Europe/Athens",
      next_run_at: null, last_run_at: null, cost_limit: 100, busy_since: null, created_at: "2026-11-05T07:00:00Z", ...extra,
    });
    const LIVE = flowRow("57000000-0000-4000-8000-000000000057", "Σύνοψη εξόδων", LIVE_BOXES, { minutes_saved: 20 });
    const FAILED = flowRow("58000000-0000-4000-8000-000000000058", "Το πρωινό μου ημερολόγιο", MORNING("08:00"));
    store.automation_flows.push(LIVE, FAILED);
    // Three runs that did the job, and a trial that does not count.
    const doneRun = (i, startedBy) => ({ id: `5700000${i}-0000-4000-8000-000000000000`, flow_id: LIVE.id, user_id: MOCK_USER.id, started_by: startedBy, status: "done", steps: LIVE_BOXES.map((b) => ({ box: b.id, status: "ok", note: "started" })), state: null, credits_charged: 0, error: null, approval_expires_at: null, started_at: `2026-11-0${i}T06:00:00.000Z`, finished_at: `2026-11-0${i}T06:00:09.000Z`, event_ref: null });
    store.automation_runs.push(doneRun(1, "time"), doneRun(2, "manual"), doneRun(3, "event"), { ...doneRun(4, "dry"), id: "57000004-0000-4000-8000-000000000000" });
    store.automation_runs.push({
      id: "58000001-0000-4000-8000-000000000000", flow_id: FAILED.id, user_id: MOCK_USER.id, started_by: "time", status: "failed",
      steps: [{ box: "b1", status: "ok", note: "started" }, { box: "b2", status: "failed", note: "not_connected" }],
      state: null, credits_charged: 0, error: "b2:not_connected", approval_expires_at: null, started_at: "2026-11-05T05:00:00.000Z", finished_at: "2026-11-05T05:00:01.000Z", event_ref: null,
    });
    const ALL_ON = { "agents-automations-pro": "everyone", "automation-templates": "everyone", "automation-time-saved": "everyone" };
    const elM = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.automations;
    const phone = { viewport: { width: 390, height: 844 }, touch: true };

    for (const layout of ["shell", "editor"]) {
      setFlags({ ...ALL_ON, "editor-shell": layout === "editor" ? "everyone" : "off" });
      for (const device of [desktop, phone]) {
        const how = `${layout === "editor" ? "editor layout" : "shell"}, ${device.touch ? "phone" : "computer"}`;
        // The editor layout draws the «Simple | Pro» switch twice, one for a
        // computer's bar and one for a phone's row, and shows one: press that one.
        const shown1 = (page, sel) => page.locator(`${sel}:visible`).first();
        const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${layout}-${device.touch ? "phone" : "desktop"}-${name}.png` });
        const { context, page, press } = await open(ON, device);
        // The achievements check would celebrate this account's finance rows
        // over the work bar in every picture; it has just "run", for this tab.
        if (SHOTS) await context.addInitScript(() => window.sessionStorage.setItem("ionexa:achievements:lastCheck", String(Date.now())));
        await page.goto(`${ON}/dashboard/automation?flow=${LIVE.id}`, { waitUntil: "networkidle" });
        await page.locator('[data-testid="flow-state"]').waitFor({ timeout: 15000 });

        // --- SIMPLE: «Όταν → Αν → Κάνε» -----------------------------------
        await page.locator('[data-testid="flow-step-part"]').first().waitFor({ timeout: 10000 });
        const parts = await page.locator('[data-testid="flow-steps"] [data-testid="flow-step"]').evaluateAll((els) => els.map((e) => `${e.getAttribute("data-part")}:${e.querySelector('[data-testid="flow-step-part"]')?.textContent?.trim()}`));
        check(`${how}: Simple says each step's part of the sentence — Όταν, Κάνε, Κάνε, Αν, Κάνε`,
          parts.join() === [["when", elM.parts.when], ["do", elM.parts.do], ["do", elM.parts.do], ["if", elM.parts.if], ["do", elM.parts.do]].map(([k, w]) => `${k}:${w}`).join(), parts.join());
        check(`${how}: …and nothing stored changed`, JSON.stringify(store.automation_flows.find((f) => f.id === LIVE.id).boxes) === JSON.stringify(LIVE_BOXES));

        // --- TIME SAVED: 3 finished runs (the trial does not count) × 20 minutes
        const savedText = await page.locator('[data-testid="flow-time-saved-result"]').innerText().catch(() => "");
        check(`${how}: «Σου γλίτωσε ~1 ώρα», with both factors under it, the trial left out`,
          savedText.includes("~1 ώρα") && savedText.includes("(3)") && savedText.includes("(20)"), savedText);
        if (!device.touch) await page.locator('[data-testid="flow-time-saved"]').scrollIntoViewIfNeeded();
        await shot(page, "simple");

        // --- PRO, A RUN REALLY GOING -----------------------------------------
        await press(shown1(page, '[data-testid="shell-mode-pro"]'));
        await page.locator('[data-testid="flow-box"]').first().waitFor({ timeout: 10000 });
        check(`${how}: Pro, idle: every line is calm, nothing moves`,
          (await page.locator('[data-testid="flow-line"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))).every((st) => st === "idle") &&
            (await page.locator(".flow-dot").count()) === 0);
        modelDelayMs = 6000;
        await press(page.locator('[data-testid="flow-try"]'));
        const lit = await page.locator('[data-testid="flow-line"][data-state="active"]').first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
        const lines = await page.locator('[data-testid="flow-line"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
        const boxStates = await page.locator('[data-testid="flow-box"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
        const going = store.automation_runs.find((r) => r.flow_id === LIVE.id && r.status === "running");
        check(`${how}: while the run is at its AI box, the line into it moves and the two before are lit`,
          lit && lines.join() === "done,active,idle,idle" && boxStates.join() === "done,done,active,idle,idle", `${lines.join()} | ${boxStates.join()}`);
        check(`${how}: …read from the run's own row, which says it has done the first two boxes`,
          going && going.steps.map((st) => st.box).join() === "b1,b2", JSON.stringify(going?.steps));
        check(`${how}: …two dots travel down the moving line, in the text colour, never the signal`,
          (await page.locator('[data-testid="flow-line"][data-state="active"] .flow-dot').count()) === 2 &&
            (await page.locator(".flow-dot").first().evaluate((e) => getComputedStyle(e).backgroundColor)) === "rgb(245, 247, 251)");
        await page.waitForTimeout(400);
        await page.locator('[data-testid="flow-boxes"]').evaluate((e) => e.scrollIntoView({ block: "start" }));
        await shot(page, "pro-running");
        await page.waitForFunction(() => !document.querySelector('[data-testid="flow-line"][data-state="active"]'), null, { timeout: 20000 }).catch(() => null);
        modelDelayMs = 0;
        await settle(page);
        check(`${how}: the run over, the lines are calm again`,
          (await page.locator('[data-testid="flow-line"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))).every((st) => st === "idle") && (await page.locator(".flow-dot").count()) === 0);

        // --- PRO, THE RUN THAT FAILED -----------------------------------------
        await page.goto(`${ON}/dashboard/automation?flow=${FAILED.id}`, { waitUntil: "networkidle" });
        await page.locator('[data-testid="flow-box"]').first().waitFor({ timeout: 10000 });
        const failedNote = await page.locator('[data-testid="flow-failed"]').innerText().catch(() => "");
        check(`${how}: the box the last run failed at is marked in the danger colour, the reason in words`,
          (await page.locator('[data-testid="flow-box"]').nth(1).getAttribute("data-state")) === "failed" &&
            failedNote === fill(elM.failedHere, { reason: elM.notes.not_connected }) &&
            (await page.locator('[data-testid="flow-failed"]').evaluate((e) => getComputedStyle(e).color)) !== (await page.locator('[data-testid="flow-box"]').first().evaluate((e) => getComputedStyle(e).color)), failedNote);
        await shot(page, "pro-failed");

        // --- THE GALLERY --------------------------------------------------------
        await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
        await press(shown1(page, '[data-testid="flow-templates-open"]'));
        await page.locator('[data-testid="flow-templates"]').waitFor({ timeout: 10000 });
        const cards = await page.locator('[data-testid="flow-template"]').evaluateAll((els) => els.map((e) => `${e.getAttribute("data-template")}:${e.getAttribute("data-ready")}:${e.querySelectorAll("button").length}`));
        check(`${how}: the gallery: the finance assistant's two ready, with one press each; the two «Σύντομα» with nothing to press`,
          cards.join() === "finance_daily:true:1,finance_weekly:true:1,finance_expense_telegram:false:0,instagram_to_telegram:false:0", cards.join());
        const why = await page.locator('[data-testid="flow-template-why"]').allInnerTexts();
        check(`${how}: …each «Σύντομα» says why`, why.join("|") === [elM.templates.finance_expense_telegram.why, elM.templates.instagram_to_telegram.why].join("|"));
        check(`${how}: …a ready card shows the steps it will make, and the price of a run before the press`,
          (await page.locator('[data-testid="flow-template"][data-template="finance_daily"] [data-testid="flow-step"]').count()) === 4 &&
            /\d/.test(await page.locator('[data-testid="flow-template-price"]').first().innerText()));
        // The AI step's whole instruction drowned the card's shape (seen in
        // this test's own pictures, 2026-11-05): two lines on a card, the
        // rest in the automation once made.
        check(`${how}: …a card's AI step is held to two lines, the whole of it one hover away`,
          (await page.locator('[data-testid="flow-template"][data-template="finance_daily"] [data-kind="ai"] span[title]').evaluate((e) => `${getComputedStyle(e).webkitLineClamp}|${e.getAttribute("title").length > 40}`)) === "2|true");
        check(`${how}: …no WhatsApp anywhere`, !/whatsapp/i.test(await page.locator('[data-testid="flow-templates"]').innerText()));
        await shot(page, "gallery");
        if (layout === "shell" && !device.touch) {
          const before = store.automation_flows.length;
          const askedBefore = modelAsked.length;
          await press(page.locator('[data-testid="flow-template"][data-template="finance_daily"] [data-testid="flow-template-start"]'));
          await settle(page);
          const made = store.automation_flows.find((f) => f.name === elM.templates.finance_daily.name);
          check("one press makes the whole automation, off, version 1, the reader's words in its AI box",
            store.automation_flows.length === before + 1 && made && made.is_active === false && made.version === 1 &&
              JSON.stringify(made.boxes) === JSON.stringify([
                { id: "b1", kind: "start", when: "time", every: "day", at: "08:30" },
                { id: "b2", kind: "read", source: "finances_week" },
                { id: "b3", kind: "ai", instruction: elM.templates.finance_daily.instruction },
                { id: "b4", kind: "action", do: "send_telegram" },
              ]) && store.automation_flow_versions.some((v) => v.flow_id === made.id && v.version === 1), JSON.stringify(made));
          check("…nothing was asked of the model and it opened at once, saying so", modelAsked.length === askedBefore && (await thread(page)).includes(fill(elM.templates.made, { name: made?.name })) && (await page.locator('[data-testid="flow-state"]').count()) === 1);
          // From now on it is an ordinary automation: a box changed by hand.
          await press(shown1(page, '[data-testid="shell-mode-pro"]'));
          await press(page.locator('[data-testid="flow-box"]').first());
          await page.locator('[data-testid="flow-box-editor"] input[type="time"]').fill("09:15");
          await press(page.locator('[data-testid="flow-box-save"]'));
          await settle(page);
          const edited = store.automation_flows.find((f) => f.id === made?.id);
          check("…and it is the person's own: a box changed by hand is version 2", edited?.version === 2 && edited.boxes[0].at === "09:15");
          const nobody = await page.request.post(`${ON}/api/automations/templates`, { data: { template: "instagram_to_telegram" } });
          check("…a «Σύντομα» template cannot be made by asking the route either", nobody.status() === 400 && (await nobody.json()).code === "bad_template");
          const boxesIn = await page.request.post(`${ON}/api/automations/templates`, { data: { template: "finance_weekly", boxes: [{ kind: "action", do: "send_email" }] } });
          const weekly = store.automation_flows.find((f) => f.name === elM.templates.finance_weekly.name);
          check("…and boxes sent with a template are not read: the rows are the product's own", boxesIn.status() === 200 && weekly && weekly.boxes.map((b) => b.kind).join() === "start,read,ai,action" && weekly.boxes[1].source === "finances_month");
        }

        // --- TIME SAVED, SET BY THE PERSON --------------------------------------
        if (layout === "shell" && !device.touch) {
          await page.goto(`${ON}/dashboard/automation?flow=${LIVE.id}`, { waitUntil: "networkidle" });
          await page.locator('[data-testid="flow-minutes"]').fill("30");
          await press(page.locator('[data-testid="flow-minutes-save"]'));
          await settle(page);
          const after = await page.locator('[data-testid="flow-time-saved-result"]').innerText().catch(() => "");
          check("the minutes are typed and saved, and the figure follows: 3 runs × 30 = ~1,5 ώρες",
            store.automation_flows.find((f) => f.id === LIVE.id).minutes_saved === 30 && after.includes("~1,5 ώρες") && after.includes("(30)"), after);
          await page.locator('[data-testid="flow-minutes"]').fill("");
          await press(page.locator('[data-testid="flow-minutes-save"]'));
          await settle(page);
          check("…cleared, there is no number at all — not a zero, not a guess",
            store.automation_flows.find((f) => f.id === LIVE.id).minutes_saved === null && (await page.locator('[data-testid="flow-time-saved-result"]').count()) === 0 && (await page.locator('[data-testid="flow-minutes"]').count()) === 1);
          const bad = await page.request.patch(`${ON}/api/automations/flows/${LIVE.id}`, { data: { minutes_saved: 481 } });
          check("…and the route takes 1 to 480 minutes, nothing else", bad.status() === 400 && (await bad.json()).code === "bad_minutes");
          store.automation_flows.find((f) => f.id === LIVE.id).minutes_saved = 20;
        }
        check(`${how}: no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
        await context.close();
      }
    }

    // REDUCED MOTION: the line still says where the run is, by brightness alone; nothing moves.
    setFlags({ ...ALL_ON, "editor-shell": "off" });
    {
      const { context, page, press } = await open(ON, { ...desktop, reducedMotion: "reduce" });
      if (SHOTS) await context.addInitScript(() => window.sessionStorage.setItem("ionexa:achievements:lastCheck", String(Date.now())));
      await page.goto(`${ON}/dashboard/automation?flow=${LIVE.id}`, { waitUntil: "networkidle" });
      await press(page.locator('[data-testid="shell-mode-pro"]'));
      modelDelayMs = 6000;
      await press(page.locator('[data-testid="flow-try"]'));
      await page.locator('[data-testid="flow-line"][data-state="active"]').first().waitFor({ timeout: 10000 }).catch(() => null);
      const look = await page.locator('[data-testid="flow-line"][data-state="active"]').evaluate((e) => ({
        line: getComputedStyle(e).backgroundColor,
        dots: [...e.querySelectorAll(".flow-dot")].map((d) => getComputedStyle(d).display),
      })).catch(() => null);
      check("reduced motion: no dots at all, and the active line at full strength instead",
        look && look.dots.length === 2 && look.dots.every((d) => d === "none") && look.line === "rgb(245, 247, 251)", JSON.stringify(look));
      await page.locator('[data-testid="flow-boxes"]').evaluate((e) => e.scrollIntoView({ block: "start" }));
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/shell-desktop-pro-running-reduced-motion.png` });
      await page.waitForFunction(() => !document.querySelector('[data-testid="flow-line"][data-state="active"]'), null, { timeout: 20000 }).catch(() => null);
      modelDelayMs = 0;
      await settle(page);
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }

    // THE SWITCHES CLOSED, AND A DATABASE WITHOUT THE COLUMN.
    setFlags({ "agents-automations-pro": "off", "automation-templates": "off", "automation-time-saved": "off" });
    {
      const { context, page } = await open(ON, desktop);
      await page.goto(`${ON}/dashboard/automation?flow=${LIVE.id}`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="flow-box"]').first().waitFor({ timeout: 10000 });
      check("switches off: no gallery, no minutes, no figure, and the lines are the old still ones",
        (await page.locator('[data-testid="flow-templates-open"]').count()) === 0 && (await page.locator('[data-testid="flow-time-saved"]').count()) === 0 &&
          (await page.locator('[data-testid="flow-line"]').count()) === 0 && (await page.locator('[data-testid="flow-box"]').count()) === LIVE_BOXES.length);
      const refused = await page.request.post(`${ON}/api/automations/templates`, { data: { template: "finance_daily" } });
      const refusedMinutes = await page.request.patch(`${ON}/api/automations/flows/${LIVE.id}`, { data: { minutes_saved: 15 } });
      check("…and both routes refuse a reader the switches are closed to", refused.status() === 403 && refusedMinutes.status() === 403);
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }
    setFlags(ALL_ON);
    minutesColumnMissing = true;
    {
      const { context, page } = await open(ON, desktop);
      await page.goto(`${ON}/dashboard/automation?flow=${LIVE.id}`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="flow-state"]').waitFor({ timeout: 10000 });
      check("BEFORE THE MIGRATION: the screen opens with every automation, and simply has no minutes field",
        (await page.locator('[data-testid="flow-time-saved"]').count()) === 0 && (await page.locator('[data-testid="flow-step"]').count()) === LIVE_BOXES.length &&
          (await page.request.get(`${ON}/api/automations/flows/${LIVE.id}/runs`)).status() === 200);
      const notReady = await page.request.patch(`${ON}/api/automations/flows/${LIVE.id}`, { data: { minutes_saved: 15 } });
      check("…and a write of minutes says «not ready» rather than failing", notReady.status() === 409 && (await notReady.json()).code === "not_ready");
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }
    minutesColumnMissing = false;
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
