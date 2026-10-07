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
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
function rest({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (!STATEFUL.includes(table)) return false;
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
const supa = await startMockSupabase({
  port: 54381,
  tableRows: { feature_flags: flags, user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }] },
  handle: (ctx) => {
    if (ctx.url.pathname.startsWith("/storage/v1/object/user-files")) {
      ctx.json(200, { Key: ctx.url.pathname.replace("/storage/v1/object/", "") });
      return true;
    }
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
      if (words.includes("Telegram") && !/9|εννιά/.test(words.split("Their time zone")[0].replace(/Telegram/g, ""))) out = tool("set_automation", { name: "", boxes: [], question: "Τι ώρα το πρωί να σου στέλνω;", unsupported: "" });
      else if (words.includes("Telegram")) out = tool("set_automation", { name: "Το πρωινό μου", boxes: MORNING("09:00"), question: "", unsupported: "" });
      else if (words.includes("Δευτέρα")) out = tool("set_automation", { name: "Αναφορά Δευτέρας", boxes: MONDAY, question: "", unsupported: "" });
      else out = tool("set_automation", { name: "Σύνοψη αρχείων", boxes: UPLOAD, question: "", unsupported: "" });
    } else if (asked.tool_choice?.name === "set_box") {
      out = tool("set_box", { box: { id: "b1", kind: "start", when: "time", every: "day", at: "08:00" } });
    } else if (words.includes("Φτιάξε αναφορά")) {
      out = text("Αναφορά εβδομάδας: έσοδα 1.850,00 €, έξοδα 240,00 €, καθαρά 1.610,00 €.");
    } else {
      out = text("Σύνοψη: η σύμβαση μίσθωσης ισχύει ως τις 31/12/2027 με μηνιαίο μίσθωμα 900 €.");
    }
    res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
    res.end(JSON.stringify(out));
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
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

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
  page.on("dialog", (d) => d.accept());
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
async function say(page, press, words) {
  await page.locator("textarea").first().fill(words);
  await press(page.locator('button[type="submit"]').first());
}
async function settle(page) {
  await page.waitForFunction(() => !document.querySelector('[aria-live="polite"]')?.textContent?.trim(), null, { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(300);
}
const thread = (page) => page.locator('[data-testid="tool-shell-thread"]').innerText();
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
  setFlags({ automations: "staff" });

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
      needs.length === 2 && needs[0].includes("Google Calendar") && needs[1].includes("Telegram") && (await page.locator('[data-testid="flow-needs"] a').first().getAttribute("href")) === "/dashboard/integrations");
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
      flowNamed("Το πρωινό μου").is_active === false && (await thread(page)).includes(fill(el.errors.needsConnection, { names: "Google Calendar, Telegram" })));
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
    await press(page.locator('[data-testid="flow-examples-open"]'));
    await press(page.locator('[data-testid="flow-examples"] button').nth(2));
    check("an example fills the field with its sentence", (await page.locator("textarea").first().inputValue()) === el.example.file);
    await press(page.locator('button[type="submit"]').first());
    await settle(page);
    const upload = flowNamed("Σύνοψη αρχείων");
    check("four boxes: a file, read, summarised, into the Library", upload && (await page.locator('[data-testid="flow-box"]').count()) === 4 && (await page.locator('[data-testid="flow-needs"]').count()) === 0);
    await press(page.locator('[data-testid="flow-toggle"]'));
    await settle(page);
    check("switched on: it runs on every file, with no next hour", flowNamed("Σύνοψη αρχείων").is_active === true && flowNamed("Σύνοψη αρχείων").next_run_at === null && (await page.locator('[data-testid="flow-state"]').innerText()).includes(el.status.onFile));
    // Upload on the Files page, as anybody would.
    await page.goto(`${ON}/dashboard/files`, { waitUntil: "networkidle" });
    const dir = mkdtempSync(join(tmpdir(), "automation-file-"));
    const file = join(dir, "σύμβαση.txt");
    writeFileSync(file, "Σύμβαση μίσθωσης. Ισχύει ως τις 31/12/2027. Μίσθωμα 900 € τον μήνα.");
    const kicked = page.waitForResponse((r) => r.url().endsWith("/api/automations/events"), { timeout: 30000 }).catch(() => null);
    await page.locator('input[type="file"]').first().setInputFiles(file);
    const kick = await kicked;
    check("the upload that started an automation asks for it to run, at once", Boolean(kick) && kick.status() === 200 && (await kick.json()).ran === 1);
    const run = runsOf(upload).find((r) => r.started_by === "event");
    const doc = store.user_documents.at(-1);
    check("the file was read, summarised, and the summary is in the Library as the person's document",
      run?.status === "done" && doc?.user_id === MOCK_USER.id && doc.content.html.includes("Σύνοψη: η σύμβαση μίσθωσης ισχύει ως τις 31/12/2027") && doc.title.startsWith("Σύνοψη αρχείων — "), JSON.stringify(run?.steps));
    check("...and what was read was the file, fenced as data", modelAsked.some((m) => JSON.stringify(m.messages).includes("Μίσθωμα 900") && JSON.stringify(m.messages).includes("UNTRUSTED")));
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    await press(page.locator('[data-testid="flow-mine"]'));
    await press(page.locator('[data-testid="flow-list"] button', { hasText: "Σύνοψη αρχείων" }));
    await page.locator('[data-testid="flow-run"]').first().waitFor({ timeout: 10000 }).catch(() => null);
    check("the history shows the run from the file, done", (await page.locator('[data-testid="flow-run"]').first().innerText()).includes(el.by.event) && (await page.locator('[data-testid="flow-run"]').first().innerText()).includes(el.runStatus.done));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 4. the limit, delete, a phone ==");
  {
    const { context, page, press } = await open(ON, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    check("on a phone the field and the options fit the screen", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    await press(page.locator('[data-testid="flow-mine"]'));
    await press(page.locator('[data-testid="flow-list"] button', { hasText: "Αναφορά Δευτέρας" }));
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
  console.log("\n== 5. the switch off ==");
  {
    setFlags({ automations: "off" });
    const { context, page } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    check("with the switch off the page is the one it always was", (await page.locator('[data-testid="tool-shell"]').count()) === 0 && (await page.locator("main").count()) === 1);
    const r = await page.request.post(`${ON}/api/automations/flows`, { data: { said: "κάθε πρωί στις 9", timeZone: "Europe/Athens" } });
    check("...and the routes refuse", r.status() === 403 && (await r.json()).code === "not_enabled");
    const live = flowNamed("Σύνοψη αρχείων");
    live.next_run_at = null;
    const tick = await page.request.get(`${ON}/api/cron/automation-flows`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    check("...and the cron runs nothing for a person the switch is closed for", (await tick.json()).ran === 0);
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
