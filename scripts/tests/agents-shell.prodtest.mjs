/*
 * AGENTS IN THE COMMON SHELL, IN THE BUILT APP (the owner's "25. AGENTS:
 * ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΔΙΚΟ ΤΟΥΣ EMAIL", 2026-10-31), ΚΟΜΜΑΤΙ 1 ONLY.
 *
 * Run: node scripts/tests/agents-shell.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/agents-shell.prodtest.mjs
 *      SHOT_DIR=/tmp/ag-shots node scripts/tests/agents-shell.prodtest.mjs
 *
 * WHAT IS REAL HERE. The page, every route it calls, every press and both
 * devices are the built app. The database is answered on this machine and
 * is STATEFUL, so a rename this test performs is written by the real PATCH
 * route and read back out of the row the route wrote.
 *
 * THE ONE THING THIS TEST SETS UP RATHER THAN CAUSING is a run in flight.
 * Starting one for real would reserve credits and call a model; what this
 * piece has to prove instead is that the three states on the plan boxes
 * come from ai_jobs.timeline. So §4 writes an ai_jobs row the way the
 * worker writes one — directly into the store, never through a product
 * backdoor — and then the REAL /api/jobs?kind=agent_run, the REAL
 * /api/jobs/[id] poll and the REAL screen carry it the rest of the way.
 * One step Done with its seconds, one Working with none, one never
 * reported: Done, Working, Waiting, from one row.
 *
 * Both devices: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { statefulTables } from "./lib/stand-in-tables.mjs";
import { chromiumPath } from "./lib/chromium.mjs";

const MSG = JSON.parse(readFileSync("messages/el.json", "utf8"));
const EL = MSG.dashboard.agents;
const SHELL_EL = EL.shell;
const STEPS_EL = MSG.aiSteps.agent_run;

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

const AGENT_A = "11111111-1111-4111-8111-111111111111";
const AGENT_B = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";

const store = {
  feature_flags: [],
  user_credits: [],
  user_onboarding: [],
  user_agents: [],
  agent_runs: [],
  ai_jobs: [],
  integrations: [],
  projects: [],
  entity_links: [],
};
const tables = statefulTables(store, {
  defaults: {
    user_agents: {
      description: null,
      delivery_method: "email",
      delivery_target: null,
      next_run_at: null,
      consecutive_failures: 0,
      config: {},
    },
    agent_runs: { output: null, error: null, would_have_charged_credits: null, credits_charged: 0 },
    ai_jobs: { result: null, error: null, consumed_at: null, finished_at: null, credits_charged: null, attempts: 1 },
  },
});
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({ port: 54531, handle: (ctx) => tables(ctx) });

function agent(id, over = {}) {
  return {
    id,
    user_id: MOCK_USER.id,
    name: over.name ?? "Πρωινά νέα Nvidia",
    description: over.description ?? "Κάθε πρωί τα νέα",
    prompt: over.prompt ?? "Στείλε μου κάθε πρωί τα τελευταία νέα της Nvidia.",
    status: over.status ?? "active",
    schedule_cron: over.schedule_cron ?? "0 8 * * *",
    timezone: "Europe/Athens",
    delivery_method: "email",
    delivery_target: MOCK_USER.email,
    next_run_at: "2026-11-01T06:00:00Z",
    consecutive_failures: 0,
    config: over.config ?? { needsWebSearch: true, depth: "standard" },
    created_at: over.created_at ?? "2026-10-20T10:00:00Z",
  };
}

function reset({ agents = [agent(AGENT_A), agent(AGENT_B, { name: "Εβδομαδιαίοι ανταγωνιστές", schedule_cron: "0 9 * * 1", status: "paused", created_at: "2026-10-19T10:00:00Z" })] } = {}) {
  store.feature_flags.splice(0, Infinity);
  store.user_credits.splice(0, Infinity, { user_id: MOCK_USER.id, credits_remaining: 5000, credits_total: 5000 });
  // Without this row /dashboard/* redirects to /onboarding and anything
  // asserted (or screenshotted) afterwards is the wrong screen.
  store.user_onboarding.splice(0, Infinity, { user_id: MOCK_USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null });
  store.user_agents.splice(0, Infinity, ...agents);
  store.agent_runs.splice(0, Infinity);
  store.ai_jobs.splice(0, Infinity);
  store.integrations.splice(0, Infinity);
}

const freePort = () =>
  new Promise((res) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => res(port));
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
};

const SHOT_DIR = process.env.SHOT_DIR;
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });
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
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
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
    ].map(({ domain, path: p, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  // Rename and delete ask with window.confirm/prompt; an unanswered
  // dialog hangs the run.
  page.on("dialog", (d) => void d.accept());
  // A REAL FINGER, THROUGH PLAYWRIGHT'S OWN tap() rather than a
  // hand-rolled pair of CDP touch events. The CDP version works on the
  // landing and fails inside the work pane, which is `fixed inset-0` on a
  // phone: its coordinates come from boundingBox() in viewport space and
  // the scrollIntoView before it moves the page under them. tap()
  // re-resolves the point itself, which is the whole reason it exists.
  async function press(locator) {
    await locator.scrollIntoViewIfNeeded();
    if (!device.touch) return locator.click();
    await locator.tap();
    // A tap right after another tap can land before React has re-rendered.
    await page.waitForTimeout(150);
  }
  return { context, page, press };
}

const AGENTS = "/dashboard/agents";

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production) ...");
    const build = spawn("npx", ["next", "build"], { env: base, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    const code = await new Promise((r) => build.on("close", r));
    if (code !== 0) {
      console.log(log.slice(-4000));
      throw new Error("next build failed");
    }
  }

  browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox", "--headless=new"] });
  const origin = await start(base);

  for (const device of [
    { name: "computer", viewport: { width: 1440, height: 900 }, touch: false },
    { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n######## ${device.name} ########`);

    // ── 1. the landing: the list of my agents and the one field ──────
    console.log("\n== 1. Αρχική: η λίστα και το πεδίο ==");
    reset();
    {
      const { context, page, press } = await open(origin, device);
      await page.goto(`${origin}${AGENTS}`, { waitUntil: "networkidle" });
      check("the tool shell is the screen", await page.locator('[data-testid="tool-shell"]').count() === 1);
      check("one field, and it is the shared composer's", await page.locator("textarea").count() === 1);
      check("...with the tool's own placeholder",
        (await page.locator("textarea").getAttribute("placeholder")) === EL.requestPlaceholder);
      // The landing only draws while there are no turns and nothing open.
      check("the landing asks the owner's own question",
        (await page.locator('[data-testid="tool-shell-empty"] h2').innerText()).trim() === EL.empty.title);
      check("...with the sentence that says what an agent is for",
        (await page.locator('[data-testid="tool-shell-empty"] p').first().innerText()).includes(EL.empty.why.slice(0, 30)));
      check("...and three pressable examples", await page.locator('[data-testid="tool-shell-example"]').count() === 3);
      // The list: this account's two agents, in the shared [◧] column.
      // On a computer it is open on arrival, beside the landing, which is
      // the owner's Αρχική. On a phone the same column is a drawer over
      // the whole screen, so it starts closed and is opened here.
      check(`the column is ${device.touch ? "a closed drawer" : "open beside the landing"} on arrival`,
        (await page.locator('[data-testid="tool-shell-history"]').getAttribute("data-open")) === String(!device.touch));
      if (device.touch) await press(page.locator('[data-testid="tool-shell-history-toggle"]'));
      const rows = page.locator('[data-testid="shell-history-row"]');
      check(`my agents are the list (${await rows.count()})`, await rows.count() === 2);
      check("each row carries its schedule and its status",
        (await rows.first().innerText()).includes(EL.statusActive));
      check("the field says how many are active, out of the plan's cap",
        (await page.locator('[data-testid="agents-cap-meta"]').innerText()).includes("1"));
      check("and the one honest line about what it does not do",
        (await page.locator('[data-testid="agents-limits"]').innerText()).length > 20);
      check("and the AI disclosure", await page.locator('[data-testid="agents-ai-disclosure"]').count() === 1);
      check("and where the result goes, before anything is built",
        (await page.locator('[data-testid="agents-delivery-note"]').innerText()).includes(MOCK_USER.email));
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${device.name}-1-landing.png`, fullPage: false });
      await context.close();
    }

    // ── 2. sending never spends ──────────────────────────────────────
    console.log("\n== 2. το πεδίο βάζει το αίτημα στο τραπέζι, δεν χρεώνει ==");
    reset();
    {
      const { context, page, press } = await open(origin, device);
      const posted = [];
      page.on("request", (r) => { if (r.method() === "POST") posted.push(new URL(r.url()).pathname); });
      await page.goto(`${origin}${AGENTS}`, { waitUntil: "networkidle" });
      await press(page.locator('[data-testid="tool-shell-example"]').first());
      await page.waitForTimeout(900);
      check("what was said is in the thread", await page.locator('[data-role="user"]').count() >= 1);
      check("what an agent can and cannot do is shown at that moment",
        await page.locator('[data-testid="agents-capability-box"]').count() === 1);
      check("the build button carries its price", (await page.locator("body").innerText()).includes("credits"));
      check("...and nothing was charged: the builder was never called",
        !posted.includes("/api/agents/build") && !posted.includes("/api/agents/templates/adopt"),
        posted.join(", "));
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${device.name}-2-asked.png` });
      await context.close();
    }

    // ── 3. the agent's screen: bar, panel, Inbox ─────────────────────
    console.log("\n== 3. Οθόνη πράκτορα: μπάρα, πάνελ, Inbox ==");
    reset();
    store.agent_runs.push({
      id: "aaaaaaa1-0000-4000-8000-000000000001",
      user_id: MOCK_USER.id,
      agent_id: AGENT_A,
      status: "success",
      output: "Η Nvidia ανακοίνωσε νέα σειρά επεξεργαστών.",
      error: null,
      credits_charged: 6,
      would_have_charged_credits: null,
      trigger_source: "scheduled",
      started_at: "2026-10-30T06:00:00Z",
    });
    {
      const { context, page, press } = await open(origin, device);
      await page.goto(`${origin}${AGENTS}?agent=${AGENT_A}`, { waitUntil: "networkidle" });
      check("the deep link opens that agent's own screen",
        await page.locator('[data-testid="tool-shell-work"]').count() === 1);
      // 280px of column + 60% of work leaves about 200px for the
      // conversation at 1440. The column belongs to the landing.
      check("...and the column stepped aside, so the field has room",
        (await page.locator('[data-testid="tool-shell-history"]').getAttribute("data-open")) === "false");
      if (!device.touch) {
        const box = await page.locator("textarea").boundingBox();
        check(`the field is a field, not a slot (${Math.round(box.width)}px)`, box.width >= 380, String(box.width));
      }
      // THE BAR. Its height first: three labelled controls at 390px left
      // the title about twenty pixels and `break-words` broke it to one
      // letter per line, pushing the bar 340px down the phone.
      {
        const title = await page.locator('[data-testid="tool-shell-work"] p').first().boundingBox();
        check(`the title is one or two lines, not one letter per line (${Math.round(title.height)}px)`,
          title.height <= 60, String(title.height));
      }
      check("the bar says the status", (await page.locator('[data-testid="agents-bar-status"]').innerText()).trim() === EL.statusActive);
      check("...and offers Run now", await page.locator('[data-testid="agents-run-now"]').count() === 1);
      check("...and ONE white button, which is Παύση",
        (await page.locator('[data-testid="agents-toggle"]').getAttribute("aria-label")) === EL.menuPause);
      {
        const filled = await page.locator('[data-testid="tool-shell-work"] button.bg-button, [data-testid="tool-shell-work"] [class*="bg-button"]').count();
        check(`the work area draws exactly one filled button (${filled})`, filled === 1);
      }
      // THE PANEL, in the directive's order
      const panel = page.locator('[data-testid="agents-settings-panel"]');
      check("the panel is beside the work", await panel.count() === 1);
      const panelText = await panel.innerText();
      for (const [what, sentence] of [
        ["its own address", SHELL_EL.ownEmailNone],
        ["a per-agent tool allowlist", SHELL_EL.toolsNone],
        ["a credit limit that stops it", SHELL_EL.capNoHardStop.slice(0, 40)],
        ["approval rules", SHELL_EL.approvalsNone],
      ]) {
        check(`the panel says the gap in ${what}, in words`, panelText.includes(sentence.replace("{max}", "5").slice(0, 36)));
      }
      check("the per-run cost is a real number", /\d/.test(await page.locator('[data-testid="agents-cap-run"]').innerText()));
      check("the monthly figure counts this schedule's own runs (daily -> 30)",
        (await page.locator('[data-testid="agents-cap-month"]').innerText()).includes("30"));
      check("the schedule is editable, through the same editor as before",
        await panel.locator("select").count() >= 1);
      check("web search is a real checkbox", await panel.locator('input[type="checkbox"]').count() === 1);
      check("nothing else on this screen can be typed into", await page.locator("textarea").count() === 1);
      // THE PAST RUNS are still here
      check("the run history is still shown", (await page.locator('[data-testid="agents-history"]').innerText()).includes(EL.runSucceeded));
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${device.name}-3-agent.png` });
      // THE INBOX TAB
      await press(page.locator('[data-testid="agents-tab-inbox"]'));
      await page.waitForTimeout(200);
      const inbox = await page.locator('[data-testid="agents-inbox"]').innerText();
      check("the Inbox tab opens", inbox.length > 0);
      check("...and says why «όσα έλαβε» is empty", inbox.includes(SHELL_EL.inboxReceivedNone.slice(0, 36)));
      check("...and why nothing awaits approval", inbox.includes(SHELL_EL.inboxApprovalsNone.slice(0, 36)));
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${device.name}-4-inbox.png` });
      await context.close();
    }

    // ── 4. the plan boxes, from a real ai_jobs.timeline ──────────────
    console.log("\n== 4. Πλάνο σε κουτιά: Done / Working / Waiting ==");
    reset();
    // The worker's own row shape: one step finished, one still going, the
    // third never reported. Written here because STARTING a run would
    // reserve credits and call a model; everything downstream of this row
    // — /api/jobs?kind=agent_run, /api/jobs/[id], useAiJob, the boxes —
    // is the built app.
    store.ai_jobs.push({
      id: JOB_ID,
      user_id: MOCK_USER.id,
      kind: "agent_run",
      status: "running",
      input: { agentId: AGENT_A },
      result: null,
      error: null,
      step: 2,
      step_total: 3,
      step_label: "working",
      credits_charged: null,
      attempts: 1,
      consumed_at: null,
      started_at: "2026-10-31T10:00:00Z",
      finished_at: null,
      created_at: "2026-10-31T10:00:00Z",
      updated_at: new Date().toISOString(),
      timeline: [
        { at: "2026-10-31T10:00:00.000Z", step: 1, label: "preparing", costUsd: 0, evidence: null },
        { at: "2026-10-31T10:00:20.000Z", step: 2, label: "working", costUsd: 0.01, evidence: null },
      ],
    });
    {
      const { context, page, press } = await open(origin, device);
      await page.goto(`${origin}${AGENTS}?agent=${AGENT_A}`, { waitUntil: "networkidle" });
      // The poll runs every two seconds; one round is enough.
      await page.waitForTimeout(3200);
      const boxes = page.locator('[data-testid="agents-plan-box"]');
      check(`there is one box per step the worker reports (${await boxes.count()})`, await boxes.count() === 3);
      const states = await boxes.evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
      check("the step that finished is Done, the one going is Working, the one not begun is Waiting",
        JSON.stringify(states) === JSON.stringify(["done", "working", "waiting"]), JSON.stringify(states));
      const labels = await boxes.evaluateAll((els) => els.map((e) => e.innerText));
      check("each box is labelled with that step's own existing words",
        labels[0].includes(STEPS_EL.preparing) && labels[1].includes(STEPS_EL.working) && labels[2].includes(STEPS_EL.delivering),
        JSON.stringify(labels));
      check("...and each carries the state as words too", labels[0].includes(SHELL_EL.stateDone) && labels[2].includes(SHELL_EL.stateWaiting));
      check("the first box says whether THIS agent searches the web",
        labels[0].includes(EL.capability.stepSearch.slice(0, 24)));
      check("the last box says where it sends and when",
        labels[2].includes(MOCK_USER.email));
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${device.name}-5-plan.png` });
      // AND THE NARROWING: the other agent's boxes must not be painted by
      // this run. Opening B while A's run is in flight is the exact case.
      // The column is away while an agent's work is open — on both
      // devices now — so it is brought back before the other agent is
      // chosen from it.
      if (device.touch) await press(page.locator('[data-testid="tool-shell-back"]'));
      await press(page.locator('[data-testid="tool-shell-history-toggle"]'));
      await press(page.locator('[data-testid="shell-history-row"]').nth(1));
      await page.waitForTimeout(500);
      const otherStates = await page.locator('[data-testid="agents-plan-box"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
      check("the other agent's plan is untouched by a run that is not its own",
        JSON.stringify(otherStates) === JSON.stringify(["waiting", "waiting", "waiting"]), JSON.stringify(otherStates));
      check("...and it says so in words rather than drawing a state it does not have",
        (await page.locator('[data-testid="tool-shell-work"]').innerText()).includes(SHELL_EL.noRunYet.slice(0, 30)));
      await context.close();
    }

    // ── 5. nothing was lost: rename, pause, and the task by words ────
    console.log("\n== 5. Τίποτα δεν χάθηκε: μετονομασία, παύση, εργασία με λόγια ==");
    reset();
    {
      const { context, page, press } = await open(origin, device);
      await page.goto(`${origin}${AGENTS}?agent=${AGENT_A}`, { waitUntil: "networkidle" });
      // PAUSE, through the real PATCH, read back out of the row it wrote.
      await press(page.locator('[data-testid="agents-toggle"]'));
      await page.waitForTimeout(1200);
      check("the white button really paused the agent, in the row",
        store.user_agents.find((a) => a.id === AGENT_A)?.status === "paused",
        store.user_agents.find((a) => a.id === AGENT_A)?.status);
      // THE TASK, BY WORDS, through the same PATCH the old edit form used.
      const field = page.locator("textarea");
      await field.fill("Στείλε μου κάθε πρωί μόνο τα νέα για τα κέντρα δεδομένων.");
      await field.press("Enter");
      await page.waitForTimeout(1500);
      check("the field wrote the open agent's task",
        (store.user_agents.find((a) => a.id === AGENT_A)?.prompt ?? "").includes("κέντρα δεδομένων"),
        store.user_agents.find((a) => a.id === AGENT_A)?.prompt);
      check("...and said so in the thread", (await page.locator("body").innerText()).includes(SHELL_EL.taskChanged));
      // DESCRIPTION, the other half of the same field. On a phone the
      // work area covers the field, so «back» is pressed first — and the
      // agent has to STAY chosen across that, or there is no state in
      // which a phone can change an agent by words.
      if (!device.touch) {
        await press(page.locator('[data-testid="tool-shell-close"]'));
        await page.waitForTimeout(300);
        check("closing the work brings the list back, so the Αρχική returns",
          (await page.locator('[data-testid="tool-shell-history"]').getAttribute("data-open")) === "true");
        check("...and the agent is still chosen, so the field still reaches it",
          (await page.locator('[data-testid="box-chosen"]').innerText()).includes("Nvidia"));
      }
      if (device.touch) {
        await press(page.locator('[data-testid="tool-shell-back"]'));
        check("closing the work on a phone keeps the agent chosen, and says which",
          (await page.locator('[data-testid="box-chosen"]').innerText()).includes("Nvidia"));
      }
      await press(page.locator('[data-testid="agents-target-description"]'));
      await field.fill("Πρωινό δελτίο για τα κέντρα δεδομένων");
      await field.press("Enter");
      await page.waitForTimeout(1500);
      check("the same field wrote the description when asked to",
        (store.user_agents.find((a) => a.id === AGENT_A)?.description ?? "").includes("Πρωινό δελτίο"),
        store.user_agents.find((a) => a.id === AGENT_A)?.description);
      check("no page error anywhere in this device's run", pageErrors.length === 0, pageErrors.join(" | "));
      await context.close();
    }
  }
} catch (err) {
  console.log(`\nHARNESS ERROR: ${err?.stack ?? err}`);
  failures.push("the harness itself");
} finally {
  try { if (browser) await browser.close(); } catch {}
  cleanup();
}

console.log(
  failures.length === 0
    ? `\nALL PASS: ${pass} passed, 0 failed`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
