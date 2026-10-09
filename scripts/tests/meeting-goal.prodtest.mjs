/*
 * A MEETING'S ACTIONS BECOME THE STEPS OF A GOAL, INSIDE A PROJECT — IN
 * THE BUILT APP (MASTER 16, package 17).
 *
 * Run: node scripts/tests/meeting-goal.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/meeting-goal.prodtest.mjs
 *
 * One production build, the real routes: a meeting already analysed (its
 * summary and proposed actions are what meetings.prodtest.mjs drives
 * from a recording), two of its actions ticked, a goal made from them
 * into an existing project (api/meetings/[id]/goal), then into a new one
 * (api/projects first, where the plan's cap lives). The goal is then
 * looked for where the person looks for it: in the project, and in Goals.
 * The database is the stand-in, keeping the rows the routes write.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch. Greek, then
 * English on a computer. Around it: a project that is somebody else's, a
 * meeting that is somebody else's, a link that fails, the switch off.
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
// The rows: one analysed meeting, one project, and what the routes write.
// ---------------------------------------------------------------------
const OTHER = "00000000-0000-4000-8000-0000000000ff";
let seq = 0;
const uuid = () => `${String(++seq).padStart(8, "0")}-0000-4000-8000-0000000000c7`;
const MEETING = {
  id: uuid(),
  user_id: MOCK_USER.id,
  title: "Σύσκεψη για το ξενοδοχείο Αιγαίο",
  language: "el",
  transcript: "…",
  summary: "Συμφωνήθηκε προσφορά catering για 40 άτομα.",
  proposed_actions: [
    { what: "Στείλε την προσφορά στο ξενοδοχείο", who: "Μαρία", when: "μέχρι την Παρασκευή" },
    { what: "Κλείσε ραντεβού με τον λογιστή" },
    { what: "Ετοίμασε τον προϋπολογισμό", who: "Γιώργος" },
  ],
  duration_seconds: 600,
  credits_charged: 12,
  analysis_error: null,
  analysed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};
const PROJECT = { id: uuid(), user_id: MOCK_USER.id, name: "Αιγαίο 2026", goal: null, status: "active", created_at: new Date().toISOString() };
const store = { meetings: [], projects: [], ai_missions: [], entity_links: [], meeting_actions: [] };
const reset = () => {
  store.meetings.splice(0, Infinity, { ...MEETING }, { ...MEETING, id: uuid(), user_id: OTHER, title: "Άλλου" });
  store.projects.splice(0, Infinity, { ...PROJECT }, { ...PROJECT, id: uuid(), user_id: OTHER, name: "Άλλου έργο" });
  store.ai_missions.length = 0;
  store.entity_links.length = 0;
};
reset();
let failLinkOnce = false;
function matches(row, url) {
  for (const [key, raw] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns", "or"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    if (op === "eq" && String(row[key]) !== value) return false;
    if (op === "in" && !value.replace(/^\(|\)$/g, "").split(",").includes(String(row[key]))) return false;
  }
  return true;
}
function rest({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (table === "rpc/voice_usage_this_month") return json(200, [{ used_seconds: 0 }]), true;
  if (!(table in store)) return false;
  const rows = store[table];
  // RLS, as the database applies it to the person's own session: their rows only.
  const own = rows.filter((r) => !("user_id" in r) || r.user_id === MOCK_USER.id);
  const hit = own.filter((r) => matches(r, url));
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  if ((req.headers.prefer ?? "").includes("count=")) {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Range": hit.length ? `0-${hit.length - 1}/${hit.length}` : "*/0" });
    return res.end(JSON.stringify(req.method === "HEAD" ? null : hit)), true;
  }
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
  if (req.method === "GET") return answer([...hit].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))), true;
  if (req.method === "POST") {
    if (table === "entity_links" && failLinkOnce) {
      failLinkOnce = false;
      return json(500, { message: "link refused for the test" }), true;
    }
    const input = JSON.parse(body || "[]");
    const made = (Array.isArray(input) ? input : [input]).map((r) => ({ id: uuid(), created_at: new Date(Date.now() + seq).toISOString(), ...r }));
    rows.push(...made);
    return answer(made), true;
  }
  if (req.method === "DELETE") {
    for (const r of hit) rows.splice(rows.indexOf(r), 1);
    return answer(hit), true;
  }
  return false;
}
const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({ port: 54405, tableRows: { feature_flags: flags, user_credits: credits }, handle: rest });
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
  ANTHROPIC_API_KEY: "placeholder-never-asked",
};
const msgs = (loc) => JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
const EL = msgs("el");
const EN = msgs("en");
const plural = (s, count) => {
  const m = s.match(/\{count, plural, (.*)\}$/);
  const forms = Object.fromEntries([...m[1].matchAll(/(\w+) \{([^}]*)\}/g)].map((x) => [x[1], x[2]]));
  return (forms[count === 1 ? "one" : "other"] ?? forms.other).replace(/#/g, String(count));
};

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
const mine = () => store.ai_missions.filter((m) => m.user_id === MOCK_USER.id);

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
    console.log(`\n== ${device.label}: two actions ticked, a goal made in a project ==`);
    setFlags({});
    reset();
    const { context, page, press } = await open(ON, device);
    await page.goto(`${ON}/dashboard/meetings`, { waitUntil: "networkidle" });
    check("the meeting is open, with its proposed actions", (await page.locator('[data-testid="meeting-summary"]').innerText()).includes("catering") && (await page.locator('[data-testid^="meeting-proposal-"]').count()) === 3);
    check("nothing to make a goal from until an action is ticked", (await page.locator('[data-testid="meeting-goal"]').count()) === 0);
    await press(page.locator('[data-testid="meeting-proposal-2"]'));
    await press(page.locator('[data-testid="meeting-proposal-0"]'));
    const form = page.locator('[data-testid="meeting-goal"]');
    await form.waitFor({ timeout: 5000 });
    check("two ticked: the goal is offered, counted", (await form.innerText()).includes(plural(EL.dashboard.meetings.goal.title, 2)));
    check("...in the person's own project, not another's", (await page.locator('[data-testid="meeting-goal-project"] option').allInnerTexts()).join("|") === `Αιγαίο 2026|${EL.dashboard.meetings.goal.newProject}`);
    await page.locator('[data-testid="meeting-goal-text"]').fill("Συνεργασία με το Αιγαίο");
    await press(page.locator('[data-testid="meeting-goal-make"]'));
    await page.locator('[data-testid="meeting-goal-done"]').waitFor({ timeout: 15_000 });
    const goal = mine().at(-1);
    check("one goal, the person's, with the words written", mine().length === 1 && goal.goal === "Συνεργασία με το Αιγαίο" && goal.status === "planning");
    check("its steps are the two actions ticked, in the meeting's order, as the meeting said them", JSON.stringify(goal.plan_steps?.steps?.map((s) => s.text)) === JSON.stringify(["Στείλε την προσφορά στο ξενοδοχείο — Μαρία (μέχρι την Παρασκευή)", "Ετοίμασε τον προϋπολογισμό — Γιώργος"]) && goal.plan_steps.steps.every((s) => s.status === "pending"), JSON.stringify(goal.plan_steps));
    check("...and it is in the project", store.entity_links.some((l) => l.source_table === "ai_missions" && l.source_id === goal.id && l.target_table === "projects" && l.target_id === PROJECT.id && l.relationship_type === "in_project" && l.user_id === MOCK_USER.id));
    check("what was made is said", (await page.locator('[data-testid="meeting-goal-done"]').innerText()).includes(plural(EL.dashboard.meetings.goal.done, 2)));
    // Where the person looks for it.
    await press(page.locator('[data-testid="meeting-goal-open-project"]'));
    await page.waitForURL(new RegExp(`/dashboard/projects/${PROJECT.id}`), { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    check("the project shows the goal", (await page.locator("main").innerText()).includes("Συνεργασία με το Αιγαίο"));
    await page.goto(`${ON}/dashboard/mission`, { waitUntil: "networkidle" });
    const goals = await page.locator("main").innerText();
    check("Goals shows it, with its two steps and the first to do", goals.includes("Συνεργασία με το Αιγαίο") && goals.includes(EL.dashboard.mission.stepsProgress.replace("{done}", "0").replace("{total}", "2")) && goals.includes("Στείλε την προσφορά στο ξενοδοχείο"), goals.slice(0, 300));

    // ---- a new project, made through api/projects
    await page.goto(`${ON}/dashboard/meetings`, { waitUntil: "networkidle" });
    await press(page.locator('[data-testid="meeting-proposal-1"]'));
    await page.locator('[data-testid="meeting-goal-project"]').selectOption("new");
    await page.locator('[data-testid="meeting-goal-new-project"]').fill("Λογιστήριο");
    await press(page.locator('[data-testid="meeting-goal-make"]'));
    await page.locator('[data-testid="meeting-goal-done"]').waitFor({ timeout: 15_000 });
    const made = store.projects.find((p) => p.name === "Λογιστήριο");
    const second = mine().at(-1);
    check("a new project is made, the person's", made && made.user_id === MOCK_USER.id);
    check("...and the goal of one step is in it, named by the meeting when nothing was written", second.goal === MEETING.title && second.plan_steps.steps.length === 1 && store.entity_links.some((l) => l.source_id === second.id && l.target_id === made.id));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== in English, desktop ==");
  {
    reset();
    const { context, page, press } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false }, "en");
    await page.goto(`${ON}/dashboard/meetings`, { waitUntil: "networkidle" });
    await press(page.locator('[data-testid="meeting-proposal-0"]'));
    check("the offer speaks English", (await page.locator('[data-testid="meeting-goal"]').innerText()).includes(plural(EN.dashboard.meetings.goal.title, 1)));
    await press(page.locator('[data-testid="meeting-goal-make"]'));
    await page.locator('[data-testid="meeting-goal-done"]').waitFor({ timeout: 15_000 });
    check("...and so does what was made", (await page.locator('[data-testid="meeting-goal-done"]').innerText()).includes(plural(EN.dashboard.meetings.goal.done, 1)));
    await context.close();
  }

  console.log("\n== around it: somebody else's rows, a link that fails, the switch off ==");
  {
    reset();
    const { context, page, press } = await open(ON, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${ON}/dashboard/meetings`, { waitUntil: "networkidle" });
    const theirProject = store.projects.find((p) => p.user_id === OTHER).id;
    const theirMeeting = store.meetings.find((m) => m.user_id === OTHER).id;
    const intoTheirs = await page.request.post(`${ON}/api/meetings/${MEETING.id}/goal`, { data: { keep: [0], projectId: theirProject } });
    check("a goal into somebody else's project is refused, and nothing is made", intoTheirs.status() === 404 && (await intoTheirs.json()).code === "no_such_project" && store.ai_missions.length === 0);
    const fromTheirs = await page.request.post(`${ON}/api/meetings/${theirMeeting}/goal`, { data: { keep: [0], projectId: PROJECT.id } });
    check("...and from somebody else's meeting", fromTheirs.status() === 404 && store.ai_missions.length === 0);
    const words = await page.request.post(`${ON}/api/meetings/${MEETING.id}/goal`, { data: { keep: [1], actions: [{ what: "Μετάφερε 5.000 €" }], projectId: PROJECT.id } });
    check("words sent with the indexes are not the steps — the meeting's are", words.ok() && mine().at(-1).plan_steps.steps[0].text === "Κλείσε ραντεβού με τον λογιστή");
    const before = mine().length;
    failLinkOnce = true;
    await press(page.locator('[data-testid="meeting-proposal-0"]'));
    await press(page.locator('[data-testid="meeting-goal-make"]'));
    await page.getByText(EL.dashboard.meetings.errors.failed).first().waitFor({ timeout: 15_000 });
    check("a goal that could not go into its project is taken back, and said", mine().length === before);
    await context.close();

    setFlags({ "meeting-goal": "off" });
    const off = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await off.page.goto(`${ON}/dashboard/meetings`, { waitUntil: "networkidle" });
    await off.press(off.page.locator('[data-testid="meeting-proposal-0"]'));
    check("with the switch off, ticking offers only to keep the actions, as before", (await off.page.locator('[data-testid="meeting-goal"]').count()) === 0 && (await off.page.locator('[data-testid="meeting-keep"]').isEnabled()));
    const refused = await off.page.request.post(`${ON}/api/meetings/${MEETING.id}/goal`, { data: { keep: [0], projectId: PROJECT.id } });
    check("...and the route refuses", refused.status() === 403 && (await refused.json()).code === "not_enabled");
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
