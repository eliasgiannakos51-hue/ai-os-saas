// The Autonomous Agents page, in a real production build, in a real
// browser, against the real component tree.
//
// scripts/tests/agents.test.mjs proves the logic. It cannot prove the one
// thing a user cares about: that the page renders their agents. And
// routes-smoke.prodtest.mjs only proves /dashboard/agents returns 200 —
// which it also would if every account saw nothing but the upgrade wall,
// because the stub user it signs in as is on the Free plan and Free owns
// zero agents. That is exactly the "it exists in the code" vs "the user
// would see it" gap.
//
// So this signs in as a GROWTH user who owns an agent with a run history,
// and asserts what is actually on screen — then flips the same account to
// Free and asserts the upgrade wall replaces it.
//
// Run: node scripts/tests/agents-ui.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail !== undefined) console.log(`        ${detail}`);
}

const USER_ID = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "11111111-1111-4111-8111-111111111111";

// Flipped between requests by the test itself, so one server can answer
// for both a paying account and a Free one.
let planTier = "growth";

const user = () => ({
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  // stripe_customer_id short-circuits the beta-expiry path in
  // resolveEffectivePlanSlug, so the tier below is taken at face value.
  user_metadata:
    planTier === "free" ? {} : { subscription_tier: planTier, stripe_customer_id: "cus_test" },
  identities: [],
});

// A real agent with a real history, in the shape the page reads.
const AGENT = {
  id: AGENT_ID,
  user_id: USER_ID,
  name: "Nvidia Daily News",
  description: "The most important Nvidia news, every morning",
  prompt: "Find and summarise the most important Nvidia news from the last 24 hours.",
  schedule_cron: "0 8 * * *",
  timezone: "Europe/Athens",
  delivery_method: "email",
  delivery_target: "owner@example.com",
  status: "active",
  config: { needsWebSearch: true, outputFormat: "bullets", language: "en" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  last_run_at: "2026-01-14T06:00:00Z",
  next_run_at: "2026-01-15T06:00:00Z",
  consecutive_failures: 0,
};

const RUNS = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    agent_id: AGENT_ID,
    user_id: USER_ID,
    started_at: "2026-01-14T06:00:00Z",
    finished_at: "2026-01-14T06:00:42Z",
    status: "success",
    output: "Nvidia announced the RTX 6090 at CES, with shipping in March.",
    error: null,
    credits_charged: 37,
    // NOT omitted: this mock REST server (prod-harness.mjs) returns fixture
    // rows verbatim, unlike real PostgREST's select("*") which always
    // includes every column and serialises an unset nullable one as
    // explicit JSON null. Leaving this key out here made the UI's
    // `=== null` check see `undefined` instead — true against this
    // fixture, false against production — and silently mask whatever this
    // assertion was meant to catch. null here is what a genuinely charged
    // run (not admin/beta bypass) looks like on the wire for real.
    would_have_charged_credits: null,
    tokens_used: 8421,
    trigger_source: "schedule",
    attempts: 1,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    agent_id: AGENT_ID,
    user_id: USER_ID,
    started_at: "2026-01-13T06:00:00Z",
    finished_at: "2026-01-13T06:00:31Z",
    status: "failed",
    output: null,
    error: "The AI service could not be reached.",
    credits_charged: 0,
    // Same reasoning as the run above — a failed run that was never
    // settled (nothing was actually spent) still means "not a bypass
    // account": would_have_charged_credits is about WHO pays, not whether
    // the run succeeded.
    would_have_charged_credits: null,
    tokens_used: 0,
    trigger_source: "schedule",
    attempts: 3,
  },
];

const TABLE_ROWS = {
  user_credits: [{ user_id: USER_ID, credits_remaining: 2500, credits_total: 3000 }],
  user_agents: [AGENT],
  agent_runs: RUNS,
};

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const json = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      // A Free account owns no agents — returning them anyway would let
      // this test "pass" the upgrade-wall case for the wrong reason.
      const rows = planTier === "free" && table.startsWith("user_agent") ? [] : TABLE_ROWS[table] ?? [];
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows);
    }
    json(200, {});
  });
});

const SUPA_PORT = 54331;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
const SUPA_URL = `http://127.0.0.1:${SUPA_PORT}`;

const PROJECT_REF = "127";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 });
const session = {
  access_token: jwt({
    sub: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    iat: nowSec,
    exp: nowSec + 3600,
  }),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec + 3600,
  refresh_token: "test-refresh-token",
  user: user(),
};
const AUTH_COOKIE = {
  name: `sb-${PROJECT_REF}-auth-token`,
  value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
};

const PORT = await new Promise((resolve) => {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: SUPA_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
};

// NEXT_PUBLIC_* values are inlined at build time, so this builds against
// the stand-in rather than reusing an existing .next — same reasoning as
// routes-smoke.prodtest.mjs, recorded there in full.
console.log("running `next build` (production build, not a dev server) ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
const buildCode = await new Promise((r) => build.on("close", r));
if (buildCode !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  supa.close();
  process.exit(1);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/login`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
function cleanup() {
  try {
    server.kill("SIGKILL");
  } catch {
    /* already gone */
  }
  supa.close();
}

const up = await waitForServer();
if (!up) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT}`);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  storageState: { cookies: [{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" }], origins: [] },
});
const errors = [];
context.on("weberror", (e) => errors.push(e.error().message));

const URL_AGENTS = `http://127.0.0.1:${PORT}/dashboard/agents`;

try {
  // -------------------------------------------------------------------
  console.log("\n== a paying account sees its agents ==");
  // -------------------------------------------------------------------
  planTier = "growth";
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  const res = await page.goto(URL_AGENTS, { waitUntil: "networkidle", timeout: 30000 });
  check("the page loads", res?.status(), 200);
  check("...and did not bounce to /login", new URL(page.url()).pathname, "/dashboard/agents");

  const text = () => page.evaluate(() => document.body.innerText);
  let body = await text();

  checkTrue("the agent's name is on screen", body.includes("Nvidia Daily News"), body.slice(0, 400));
  checkTrue("...with its description", body.includes("The most important Nvidia news"));
  // The schedule is stored as "0 8 * * *". A user must never be shown a
  // cron expression — this is the whole point of describeSchedule.
  checkTrue("the schedule reads as a sentence, not a cron string", body.includes("Every day at 08:00"));
  checkTrue("...and the raw expression is NOT shown", !body.includes("0 8 * * *"), body.slice(0, 600));
  // next_run_at is 06:00Z; the agent's zone is Europe/Athens (UTC+2 in
  // January), so the user must see 08:00 — their clock, not the server's.
  checkTrue("the next run is shown in the AGENT'S timezone", /8:00/.test(body), body.slice(0, 600));
  checkTrue("the status is shown", body.includes("Active"));
  checkTrue("the plan allowance is shown", body.includes("1 of 5 agents"), body.slice(0, 600));
  checkTrue("the EU AI Act notice is on the page", /AI systems/i.test(body));
  checkTrue("the upgrade wall is NOT shown", !body.includes("Upgrade Required"));

  // No unresolved i18n keys anywhere on the page.
  const keys = await page.evaluate(() => {
    const re = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){2,}$/;
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent?.trim() ?? "";
      if (t && re.test(t)) out.push(t);
    }
    return [...new Set(out)];
  });
  check("no unresolved i18n keys", keys, []);

  // -------------------------------------------------------------------
  console.log("\n== the run history opens and shows real outcomes ==");
  // -------------------------------------------------------------------
  // exact:true — the card's "..." menu is also a button whose accessible
  // name CONTAINS the agent name ("Actions for Nvidia Daily News").
  await page.getByRole("button", { name: "Nvidia Daily News", exact: true }).click();
  await page.waitForTimeout(400);
  body = await text();
  checkTrue("the history section appears", body.includes("Run history"), body.slice(-800));
  checkTrue("a successful run is listed", body.includes("Succeeded"));
  checkTrue("a failed run is listed too", body.includes("Failed"));
  checkTrue("the failure reason is readable", body.includes("The AI service could not be reached."));
  checkTrue("what the run cost is shown", body.includes("37 credits"), body.slice(-1200));
  checkTrue("the task itself is shown", body.includes("Find and summarise the most important Nvidia news"));

  // The output is behind a disclosure, so it is present but collapsed.
  await page.getByText("See the result").first().click();
  await page.waitForTimeout(250);
  body = await text();
  checkTrue("the run's output is readable", body.includes("Nvidia announced the RTX 6090"), body.slice(-800));

  // -------------------------------------------------------------------
  console.log("\n== the create flow opens ==");
  // -------------------------------------------------------------------
  await page.getByRole("button", { name: "New agent" }).click();
  await page.waitForTimeout(300);
  const textarea = page.locator("#agent-request");
  check("the one-sentence input appears", await textarea.count(), 1);
  const designButton = page.getByRole("button", { name: "Design my agent" });
  check("the design button appears", await designButton.count(), 1);
  checkTrue("...and is disabled until something is typed", await designButton.isDisabled());
  await textarea.fill("Every morning, send me the latest news about Nvidia");
  await page.waitForTimeout(150);
  checkTrue("...and enabled once it is", !(await designButton.isDisabled()));
  body = await text();
  checkTrue(
    "the destination address is stated before anything is created",
    body.includes("owner@example.com"),
    body.slice(0, 900)
  );

  // -------------------------------------------------------------------
  console.log("\n== 375px: the whole page fits on a phone ==");
  // -------------------------------------------------------------------
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 375, height: 812 });
  await phone.goto(URL_AGENTS, { waitUntil: "networkidle", timeout: 30000 });
  const overflow = await phone.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  checkTrue(
    `no horizontal overflow (${overflow.scrollWidth}/${overflow.clientWidth})`,
    overflow.scrollWidth <= overflow.clientWidth + 1,
    JSON.stringify(overflow)
  );
  // Selecting an agent on a phone must not push the detail panel off-screen.
  await phone.getByRole("button", { name: "Nvidia Daily News", exact: true }).click();
  await phone.waitForTimeout(400);
  const overflowOpen = await phone.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  checkTrue(
    `...with the detail panel open either (${overflowOpen.scrollWidth}/${overflowOpen.clientWidth})`,
    overflowOpen.scrollWidth <= overflowOpen.clientWidth + 1,
    JSON.stringify(overflowOpen)
  );
  await phone.close();

  // -------------------------------------------------------------------
  console.log("\n== a Free account is refused, not silently shown an empty list ==");
  // -------------------------------------------------------------------
  planTier = "free";
  const freePage = await context.newPage();
  await freePage.goto(URL_AGENTS, { waitUntil: "networkidle", timeout: 30000 });
  const freeBody = await freePage.evaluate(() => document.body.innerText);
  checkTrue("the upgrade wall is shown", freeBody.includes("Upgrade Required"), freeBody.slice(0, 500));
  checkTrue("...naming the plan that unlocks it", freeBody.includes("Starter"));
  checkTrue("...and no create control is offered", !freeBody.includes("New agent"));
  await freePage.close();

  // -------------------------------------------------------------------
  console.log("\n== the API refuses an unauthenticated caller ==");
  // -------------------------------------------------------------------
  for (const [method, path] of [
    ["POST", "/api/agents"],
    ["POST", "/api/agents/build"],
    ["POST", `/api/agents/${AGENT_ID}/run`],
    ["PATCH", `/api/agents/${AGENT_ID}`],
    ["DELETE", `/api/agents/${AGENT_ID}`],
  ]) {
    const r = await fetch(`http://127.0.0.1:${PORT}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : "{}",
    });
    check(`${method} ${path} without a session`, r.status, 401);
  }
  // The engine is fail-closed without CRON_SECRET, and never 200 to an
  // anonymous caller.
  {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/cron/agent-runs`);
    checkTrue(`GET /api/cron/agent-runs unauthenticated -> ${r.status}`, r.status === 401 || r.status === 503);
  }

  check("no console errors across the whole run", errors, []);
} catch (err) {
  fail++;
  console.log(`  FAIL  unhandled: ${err.message}\n${err.stack ?? ""}`);
} finally {
  await browser.close();
  cleanup();
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
