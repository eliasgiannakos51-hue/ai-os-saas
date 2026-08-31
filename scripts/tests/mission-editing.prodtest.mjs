// MISSION CONTROL, IN A REAL BROWSER: delete a step, undo it, delete the
// mission — and check the DATABASE, not the screen.
//
// The report was "there is no way to delete a mission". There wasn't:
// no endpoint, no button. This drives the new ones through real Chromium
// against a real `next build` + `next start`, with a STATEFUL mock
// PostgREST that genuinely applies the writes — so "it left the database"
// is a claim about stored rows, not about a row disappearing from a list.
//
// The mock refuses anything it does not implement (500 + recorded), so a
// call this test does not model fails the run rather than silently
// passing — the harness bug that once let six broken features go green.
//
// Run: node scripts/tests/mission-editing.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const USER_ID = "00000000-0000-4000-8000-000000000001";
const MISSION_ID = "11111111-1111-4111-8111-111111111111";

const user = () => ({
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  user_metadata: { subscription_tier: "ultimate" },
  app_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
});

// THE STATE THIS TEST IS ABOUT. Four steps and two scheduled runs, one of
// which points at the step that gets deleted and one at a later step —
// the pair that makes the index fix-up observable.
let MISSION = {
  id: MISSION_ID,
  user_id: USER_ID,
  goal: "Launch the summer menu",
  status: "in_progress",
  plan_steps_version: 3,
  plan_steps: {
    steps: [
      { text: "Pick six dishes and cost them", status: "pending", effort: "medium" },
      { text: "Photograph every dish", status: "pending", effort: "light" },
      { text: "Print the menus", status: "pending", effort: "light" },
      { text: "Announce it to the mailing list", status: "pending", effort: "medium" },
    ],
  },
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
};
let RUNS = [
  { id: "aaaa1111-1111-4111-8111-111111111111", user_id: USER_ID, mission_id: MISSION_ID, step_index: 1, step_text: "Photograph every dish", agent_role: "general", status: "pending", scheduled_for: "2026-02-10", result: null, executed_at: null, created_at: "2026-02-01T00:00:00Z" },
  { id: "aaaa2222-2222-4222-8222-222222222222", user_id: USER_ID, mission_id: MISSION_ID, step_index: 3, step_text: "Announce it to the mailing list", agent_role: "general", status: "pending", scheduled_for: "2026-02-12", result: null, executed_at: null, created_at: "2026-02-01T00:00:00Z" },
];
let missionDeleted = false;

const unexpected = [];
const recordedErrors = [];

/** `col=eq.value` / `col=in.(a,b)` — enough of PostgREST's filter grammar
 *  for what these routes send, and nothing more: an unrecognised filter
 *  must not silently match every row. */
function matches(row, url) {
  for (const [key, raw] of url.searchParams.entries()) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    const actual = row[key];
    if (op === "eq") {
      if (String(actual) !== value) return false;
    } else if (op === "gte") {
      if (!(Number(actual) >= Number(value))) return false;
    } else if (op === "is") {
      if (value === "null" && actual !== null) return false;
    } else {
      unexpected.push(`filter ${key}=${raw}`);
      return false;
    }
  }
  return true;
}

const supa = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString();
    const url = new URL(req.url, "http://x");
    const json = (code, data, headers = {}) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers": "Content-Range",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
        ...headers,
      });
      res.end(JSON.stringify(data));
    };
    if (req.method === "OPTIONS") return json(200, {});
    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);
      // An error being RECORDED means something else went wrong — so this
      // is answered (the recorder must not itself fail) and remembered.
      if (fn === "record_production_error") {
        recordedErrors.push(body.slice(0, 200));
        return json(200, null);
      }
      unexpected.push(`RPC ${fn}`);
      return json(500, { message: `mock: unimplemented rpc ${fn}` });
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const reply = (rows) => {
        if (single) return rows[0] ? json(200, rows[0]) : json(200, null);
        return json(200, rows, { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
      };

      if (table === "ai_missions") {
        const live = missionDeleted ? [] : [MISSION];
        // HEAD is what `select(..., { head: true, count: "exact" })` sends;
        // the count rides the Content-Range header, not the body.
        if (req.method === "GET" || req.method === "HEAD") return reply(live.filter((r) => matches(r, url)));
        if (req.method === "DELETE") {
          const hit = live.filter((r) => matches(r, url));
          if (hit.length) missionDeleted = true;
          return reply(hit);
        }
        if (req.method === "PATCH") {
          const patch = JSON.parse(body || "{}");
          const hit = live.filter((r) => matches(r, url));
          // The optimistic version guard: a PATCH carrying the wrong
          // plan_steps_version must match no rows, exactly as Postgres
          // would — otherwise the 409 path could never be exercised.
          for (const row of hit) Object.assign(row, patch);
          return reply(hit);
        }
      }

      if (table === "scheduled_agent_runs") {
        if (req.method === "GET" || req.method === "HEAD") return reply(RUNS.filter((r) => matches(r, url)));
        if (req.method === "DELETE") {
          const hit = RUNS.filter((r) => matches(r, url));
          RUNS = RUNS.filter((r) => !hit.includes(r));
          return reply(hit);
        }
        if (req.method === "PATCH") {
          const patch = JSON.parse(body || "{}");
          const hit = RUNS.filter((r) => matches(r, url));
          for (const row of hit) Object.assign(row, patch);
          return reply(hit);
        }
        if (req.method === "POST") {
          const incoming = JSON.parse(body || "[]");
          const rows = Array.isArray(incoming) ? incoming : [incoming];
          for (const [i, row] of rows.entries()) {
            RUNS.push({ id: `bbbb${i}${Date.now()}`.slice(0, 36), result: null, executed_at: null, created_at: new Date().toISOString(), ...row });
          }
          return reply(rows);
        }
      }

      // Everything else the page reads on the way in. Empty is a truthful
      // answer for these; a WRITE to one is not, and is recorded.
      // The dashboard shell counts every module table for its sidebar and
      // its health score. Empty is a truthful answer for an account with
      // one mission and nothing else — but only for READS. A write to any
      // of them is still recorded as unexpected, which is what this mock
      // exists to catch.
      const READ_ONLY_EMPTY = [
        "user_credits", "user_favorites", "user_energy_checkins", "user_notifications",
        "ai_cost_log", "rate_limit_log", "user_onboarding", "entity_links", "user_achievements",
        "team_members", "user_agents", "user_websites", "user_files", "user_documents",
        "chat_conversations", "user_automations", "research_reports", "user_insights",
        "user_imports", "known_devices", "site_analytics", "production_errors",
        // The 13 classifier modules the shell scans.
        "ai_jobs", "security_check_log", "website_versions", "credit_transactions",
        "ideas", "competitors", "research", "finance_entries", "learning_entries", "trades",
        "decisions", "products", "content", "leads", "feedback", "metrics", "automations",
      ];
      if (READ_ONLY_EMPTY.includes(table)) {
        if (req.method === "GET" || req.method === "HEAD") return reply([]);
        // The shell upserts a credits row for an account that has none.
        if (req.method === "POST" && (table === "rate_limit_log" || table === "user_credits")) return json(201, []);
      }
      unexpected.push(`${req.method} ${url.pathname}`);
      return json(500, { message: `mock: unimplemented ${req.method} ${table}` });
    }
    unexpected.push(`${req.method} ${url.pathname}`);
    json(500, { message: `mock: unimplemented path ${url.pathname}` });
  });
});

const SUPA_PORT = 54351;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
const SUPA_URL = `http://127.0.0.1:${SUPA_PORT}`;

const PROJECT_REF = "127";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 });
const session = {
  access_token: jwt({ sub: USER_ID, aud: "authenticated", role: "authenticated", email: "owner@example.com", iat: nowSec, exp: nowSec + 3600 }),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec + 3600,
  refresh_token: "test-refresh-token",
  user: user(),
};
const AUTH_COOKIE = { name: `sb-${PROJECT_REF}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") };

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

console.log("running `next build` (production build, not a dev server) ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
if ((await new Promise((r) => build.on("close", r))) !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  supa.close();
  process.exit(1);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/login`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
function cleanup() {
  // The GROUP, not the handle — see prodtest-hygiene.test.mjs.
  try { process.kill(-server.pid, "SIGKILL"); } catch { try { server.kill("SIGKILL"); } catch { /* gone */ } }
  supa.close();
}
if (!(await waitForServer())) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT}\n`);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  storageState: { cookies: [{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" }], origins: [] },
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
// Every confirm() is accepted — this test is about what the buttons DO.
page.on("dialog", (d) => void d.accept());

async function openMission() {
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/mission`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);
  const card = page.locator(`text=${MISSION.goal}`).first();
  if (await card.count()) await card.click();
  await page.waitForTimeout(600);
}

try {
  console.log("== 1. the plan is on screen, with its four steps ==");
  await openMission();
  const opened = await page.locator('[data-testid="step-delete"]').first().isVisible().catch(() => false);
  check("the mission opened", opened, opened ? "" : `page text: ${(await page.innerText("body")).slice(0, 400).replace(/\n+/g, " | ")}`);
  if (!opened) {
    console.log("        unexpected backend calls so far: " + (unexpected.join(", ") || "none"));
  }
  eq("four steps are editable", await page.locator('[data-testid="step-delete"]').count(), 4);

  console.log("\n== 2. a step can be REWRITTEN, and the scheduled run follows ==");
  await page.locator('[data-testid="step-edit"]').nth(1).click();
  await page.locator('[data-testid="step-edit-input"]').fill("Photograph all six dishes in daylight");
  await page.locator('[data-testid="step-edit-save"]').click();
  await page.waitForTimeout(900);
  eq("the stored step text changed", MISSION.plan_steps.steps[1].text, "Photograph all six dishes in daylight");
  eq(
    "and the run's copy of it changed with it",
    RUNS.find((r) => r.step_index === 1)?.step_text,
    "Photograph all six dishes in daylight"
  );
  eq("the version was bumped, so a concurrent write loses", MISSION.plan_steps_version, 4);

  console.log("\n== 3. a step can be MOVED, taking its scheduled run along ==");
  await openMission();
  await page.locator('[data-testid="step-move-down"]').nth(1).click();
  await page.waitForTimeout(900);
  eq("the steps swapped", MISSION.plan_steps.steps.map((s) => s.text[0]).join(""), "PPPA");
  eq(
    "the run that pointed at the moved step moved with it",
    RUNS.find((r) => r.step_text.startsWith("Photograph"))?.step_index,
    2
  );

  console.log("\n== 4. a step can be DELETED — and the runs are re-pointed ==");
  await openMission();
  const before = MISSION.plan_steps.steps.length;
  // Delete step 0, which has NO run of its own; every run after it must
  // shift down one or the cron executes the wrong step tomorrow.
  await page.locator('[data-testid="step-delete"]').first().click();
  await page.waitForTimeout(900);
  eq("the step is gone from the stored plan", MISSION.plan_steps.steps.length, before - 1);
  eq(
    "the later runs shifted down exactly one",
    RUNS.filter((r) => r.status === "pending").map((r) => r.step_index).sort((a, b) => a - b),
    [1, 2]
  );
  check("and the undo is offered", await page.locator('[data-testid="step-undo-button"]').isVisible().catch(() => false));

  console.log("\n== 5. UNDO puts the step AND its runs back ==");
  await page.locator('[data-testid="step-undo-button"]').click();
  await page.waitForTimeout(1000);
  eq("the step is back", MISSION.plan_steps.steps.length, before);
  eq("in its old position", MISSION.plan_steps.steps[0].text.startsWith("Pick six dishes"), true);
  eq(
    "and the runs point where they did before",
    RUNS.filter((r) => r.status === "pending").map((r) => r.step_index).sort((a, b) => a - b),
    [2, 3]
  );

  console.log("\n== 6. deleting a step that HAS a run removes that run ==");
  await openMission();
  const runsBefore = RUNS.length;
  const targetIndex = RUNS.find((r) => r.status === "pending").step_index;
  await page.locator('[data-testid="step-delete"]').nth(targetIndex).click();
  await page.waitForTimeout(900);
  check(`the run that pointed at it is gone (${runsBefore} -> ${RUNS.length})`, RUNS.length === runsBefore - 1);
  await page.locator('[data-testid="step-undo-button"]').click();
  await page.waitForTimeout(1000);
  check(`and the undo re-creates it (${RUNS.length})`, RUNS.length === runsBefore);

  console.log("\n== 7. the MISSION can be deleted, and it leaves the database ==");
  await openMission();
  await page.locator('[data-testid="mission-delete"]').first().click();
  await page.waitForTimeout(1200);
  check("the row is gone from the database", missionDeleted === true);
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/mission`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(500);
  check(
    "and the page no longer shows it",
    (await page.locator(`text=${MISSION.goal}`).count()) === 0
  );
  await page.screenshot({ path: "/tmp/mission-after-delete.png" });

  console.log("\n== 8. the mock saw nothing it does not implement ==");
  check(`no unexpected backend calls (${unexpected.length})`, unexpected.length === 0, unexpected.slice(0, 6).join("\n        "));
  check(
    `nothing recorded a production error (${recordedErrors.length})`,
    recordedErrors.length === 0,
    recordedErrors.slice(0, 3).join("\n        ")
  );
  check(
    `no console errors (${consoleErrors.length})`,
    consoleErrors.filter((e) => !/favicon|Download the React DevTools/i.test(e)).length === 0,
    consoleErrors.slice(0, 3).join("\n        ")
  );
} finally {
  await browser.close();
  cleanup();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
