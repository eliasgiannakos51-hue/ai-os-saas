// The whole agent lifecycle, in a real browser, with the AI behind a mock:
// build (watching the four step labels appear) → preview (with the
// delivery channels) → create → counter 1 → delete → counter 0 → create
// again → counter 1. Three reported-and-recurring bugs live on this path:
//
//   "agent build says only 'Designing…', no steps, no indicator" — the
//   step labels ride ai_jobs rows the browser polls; a missing RLS policy
//   made that silently empty in production while the build succeeded.
//   Section 2 watches the REAL labels during a REAL build, and section 6
//   proves the silent case now says so out loud (watch-lost line).
//
//   "no Telegram/Discord/Slack/in-app on the agent — only email" — the
//   DeliveryPicker existed only in the edit panel of an already-created
//   agent. Section 3 requires all five channels at CREATION time.
//
//   "the agents counter" — create→delete→create must count ACTIVE agents.
//   Sections 4-5 walk it and also assert every build was CHARGED
//   (reserve + settle with feature agent_build) — deletion frees the
//   slot, it never refunds the build.
//
// The Anthropic API is a local mock behind ANTHROPIC_BASE_URL (a runtime
// env var the SDK honours), answering the two forced-tool calls the build
// makes. That makes this the first test where the full pipeline — route,
// reservation, job row, worker, step writes, poll, settlement — runs for
// real with no model bill.
//
// Run: node scripts/tests/agent-lifecycle.prodtest.mjs [--out DIR]
import http from "node:http";
import { label } from "./lib/label.mjs";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const outDir = path.resolve(
  process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "agent-shots"
);
mkdirSync(outDir, { recursive: true });

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

const USER_ID = "00000000-0000-4000-8000-000000000001";
const user = () => ({
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { subscription_tier: "growth", stripe_customer_id: "cus_test" },
  identities: [],
});

// ---- stateful stand-in for the Supabase project -----------------------
let idCounter = 0;
const uuid = () => `eeeeeeee-6666-4666-8666-${String(++idCounter).padStart(12, "0")}`;
const tables = {
  ai_jobs: [],
  user_agents: [],
  agent_runs: [],
  rate_limit_log: [],
  user_credits: [{ user_id: USER_ID, credits_remaining: 2500, credits_total: 3000, plan_tier: "growth" }],
};
const rpcs = [];
const jobReads = [];
// Flipped by section 6 to simulate the broken deployment: job rows exist
// (worker writes fine) but the OWNER cannot read them — the exact
// signature of the missing ai_jobs select policy.
let jobsInvisibleToOwner = false;

function applyFilters(rows, params) {
  let out = rows;
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(key)) continue;
    const m = /^(eq|neq|in|is)\.(.*)$/.exec(raw);
    if (!m) continue;
    const [, op, val] = m;
    out = out.filter((r) => {
      const v = r[key];
      if (op === "eq") return String(v) === val;
      if (op === "neq") return String(v) !== val;
      if (op === "is") return val === "null" ? v == null : String(v) === val;
      if (op === "in") {
        const list = val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
        return list.includes(String(v));
      }
      return true;
    });
  }
  return out;
}

const supa = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString();
    const url = new URL(req.url, "http://x");
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
    };
    const json = (code, data, extra = {}) => {
      res.writeHead(code, { "Content-Type": "application/json", ...cors, ...extra });
      res.end(JSON.stringify(data));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);
      let args = {};
      try {
        args = JSON.parse(body);
      } catch {
        /* empty body */
      }
      rpcs.push({ fn, args });
      if (fn === "reserve_credits") return json(200, [{ reservation_id: uuid(), available: 2500 }]);
      return json(200, null);
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const known = table in tables;
      const rows = known ? tables[table] : [];
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");

      // The RLS-broken simulation: reads of ai_jobs through the USER's
      // token see nothing. The service key (the worker) still sees rows.
      const authHeader = req.headers.authorization ?? "";
      const isServiceRole = authHeader.includes(SERVICE_KEY);
      if (table === "ai_jobs" && jobsInvisibleToOwner && !isServiceRole && (req.method === "GET" || req.method === "HEAD")) {
        if (single) return json(406, { code: "PGRST116", message: "no rows" });
        return json(200, []);
      }

      if (req.method === "POST" && known) {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = {};
        }
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const row of list) {
          row.id = row.id ?? uuid();
          row.created_at = row.created_at ?? new Date().toISOString();
          row.updated_at = row.updated_at ?? row.created_at;
          if (table === "ai_jobs") {
            // Column defaults the real schema provides; the worker's
            // conditional claim (.eq("running", false)) depends on them.
            row.running = row.running ?? false;
            row.status = row.status ?? "queued";
            row.step = row.step ?? 0;
            row.step_total = row.step_total ?? 1;
            row.attempts = row.attempts ?? 0;
            row.step_label = row.step_label ?? null;
          }
          if (table === "user_agents") row.status = row.status ?? "active";
          rows.unshift(row);
        }
        return json(201, single ? list[0] : list);
      }
      if (req.method === "PATCH" && known) {
        let patch;
        try {
          patch = JSON.parse(body);
        } catch {
          patch = {};
        }
        const matched = applyFilters(rows, url.searchParams);
        for (const row of matched) Object.assign(row, patch, { updated_at: new Date().toISOString() });
        return json(200, single ? matched[0] ?? null : matched);
      }
      if (req.method === "DELETE" && known) {
        const matched = applyFilters(rows, url.searchParams);
        for (const row of matched) {
          const i = rows.indexOf(row);
          if (i !== -1) rows.splice(i, 1);
        }
        // .delete({ count: "exact" }) reads the affected-row count from
        // Content-Range; without the header the route sees count=null and
        // honestly reports "not found" for a delete that DID happen.
        const extra = (req.headers.prefer ?? "").includes("count=")
          ? { "Content-Range": `*/${matched.length}` }
          : {};
        return json(200, matched, extra);
      }
      if (table === "ai_jobs" && (req.method === "GET" || req.method === "HEAD")) {
        const m = applyFilters(rows, url.searchParams);
        jobReads.push(
          `${Date.now() % 100000} ${isServiceRole ? "svc" : "usr"} -> ${m
            .map((j) => `${j.status}/${j.step}/${j.step_label}`)
            .join(",") || "none"}`
        );
      }
      const matched = applyFilters(rows, url.searchParams);
      if ((req.headers.prefer ?? "").includes("count=")) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Range": matched.length > 0 ? `0-${matched.length - 1}/${matched.length}` : `*/0`,
          ...cors,
        });
        return res.end(JSON.stringify(req.method === "HEAD" ? null : matched));
      }
      if (single) return matched[0] ? json(200, matched[0]) : json(406, { code: "PGRST116", message: "no rows" });
      return json(200, matched);
    }
    json(200, {});
  });
});

// ---- the Anthropic stand-in --------------------------------------------
// Answers the two forced-tool calls agent_build makes. Slowed to ~1.2s per
// call ON PURPOSE: with an instant answer the four step labels flash by
// faster than any human (or this test) can see them.
const modelCalls = [];
const anthropicMock = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      /* empty */
    }
    const toolName = body.tool_choice?.name ?? null;
    modelCalls.push(toolName ?? "(text)");
    let content;
    if (toolName === "evaluate_request_clarity") {
      content = [
        { type: "tool_use", id: "tu_1", name: toolName, input: { needsClarification: false, questions: [], suggestions: [] } },
      ];
    } else if (toolName === "configure_agent") {
      content = [
        {
          type: "tool_use",
          id: "tu_2",
          name: toolName,
          input: {
            name: "Weekly sales summary",
            description: "Summarises last week's sales every Monday.",
            taskPrompt: "Summarise the sales entries from the last 7 days in plain language.",
            scheduleCron: "0 8 * * 1",
            needsWebSearch: false,
            outputFormat: "summary",
            language: "en",
            understood: "Every Monday at 08:00 I will summarise last week's sales.",
            unsupported: "",
          },
        },
      ];
    } else {
      content = [{ type: "text", text: "ok" }];
    }
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: body.model ?? "claude-test",
          content,
          stop_reason: "end_turn",
          usage: { input_tokens: 900, output_tokens: 250 },
        })
      );
    }, 1200);
  });
});

const SUPA_PORT = 54349;
const ANTHROPIC_PORT = 54351;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
await new Promise((r) => anthropicMock.listen(ANTHROPIC_PORT, "127.0.0.1", r));
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
  ANTHROPIC_API_KEY: "sk-ant-test",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${ANTHROPIC_PORT}`,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
};
// The model mock is local; a proxy would swallow it.
delete env.HTTPS_PROXY;
delete env.HTTP_PROXY;
delete env.https_proxy;
delete env.http_proxy;

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
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
function cleanup() {
  try {
    // KILL THE GROUP, NOT THE HANDLE. `npx next start` is npx -> sh ->
    // next-server. SIGKILL to the npx handle leaves the grandchild alive,
    // reparented to init, still holding its port and serving its build.
    // Measured across one full survey of the suite: thirteen orphaned
    // next-server processes, the oldest 41 minutes old. `detached: true`
    // on the spawn puts the whole tree in its own group so this reaches
    // all of it. Enforced by scripts/tests/prodtest-hygiene.test.mjs.
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
  } catch {
    /* already gone */
  }
  supa.close();
  anthropicMock.close();
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
  viewport: { width: 1280, height: 950 },
  storageState: { cookies: [{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" }], origins: [] },
});
const page = await context.newPage();

const counter = () => page.locator("text=/\\d+ of \\d+ agents/").first();

/** Drive one build through the real UI and return the step labels seen.
 *  The label collector runs INSIDE the browser (a MutationObserver-free
 *  poll per animation frame) — a Node-side poll over CDP proved too
 *  coarse to catch labels that live for a second or two. */
async function buildOnce(requestText) {
  await page.locator("button", { hasText: "New agent" }).first().click();
  await page.fill("#agent-request", requestText);
  await page.evaluate(() => {
    window.__stepsSeen = [];
    // WHEN each label was on screen, not merely THAT it was. The third
    // "I don't see the steps" report was about duration: the labels were
    // real and rendered, and some of them lived for less than one frame.
    window.__stepTiming = {};
    const labels = [
      "Working out what you need…",
      "Writing the agent…",
      "Checking it over…",
      "Saving it…",
      "Getting started…",
    ];
    const tick = () => {
      const now = performance.now();
      const text = document.body.innerText;
      for (const label of labels) {
        if (!text.includes(label)) continue;
        if (!window.__stepsSeen.includes(label)) {
          window.__stepsSeen.push(label);
          window.__stepTiming[label] = { first: now, last: now };
        } else {
          window.__stepTiming[label].last = now;
        }
      }
      if (!window.__stepsDone) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator("button", { hasText: label("dashboard.agents.designButton") }).first().click();
  // The moment a step is visibly on screen — photographed, not asserted
  // from state. Best-effort: a very fast build can outrun this.
  void page
    .waitForSelector('[data-testid="ai-progress-step"]', { timeout: 30000 })
    .then(() => page.screenshot({ path: path.join(outDir, "build-steps.png") }))
    .catch(() => {});
  await page
    .waitForSelector("text=what I'll build", { timeout: 60000 })
    .catch(() => {});
  const collected = await page.evaluate(() => {
    window.__stepsDone = true;
    return { seen: window.__stepsSeen ?? [], timing: window.__stepTiming ?? {} };
  });
  return { seen: new Set(collected.seen), timing: collected.timing };
}

try {
  // -------------------------------------------------------------------
  console.log("== 1. an empty account reads 0 of N ==");
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/agents`, { waitUntil: "networkidle", timeout: 60000 });
  check(`the counter is visible ("${await counter().innerText().catch(() => "?")}")`, /0 of \d+ agents/.test(await counter().innerText().catch(() => "")));

  console.log("\n== 2. the build shows its REAL steps, not a static word ==");
  const { seen, timing } = await buildOnce("Every Monday morning summarise last week's sales and email them to me");
  check(
    `step labels appeared during the build (${[...seen].join(" · ") || "none"})`,
    seen.size >= 2,
    `ai_jobs reads timeline:\n        ${jobReads.slice(-25).join("\n        ")}`
  );
  // EVERY step, not merely two of them: the client narrates the steps the
  // polling jumped over (lib/jobs/use-ai-job.ts useSmoothedJob), so a
  // build that crosses two steps between polls still shows both.
  const BUILD_STEPS = [
    "Working out what you need…",
    "Writing the agent…",
    "Checking it over…",
    "Saving it…",
  ];
  check(
    `all four build steps were shown (${BUILD_STEPS.filter((l) => seen.has(l)).length}/4)`,
    BUILD_STEPS.every((l) => seen.has(l)),
    `missing: ${BUILD_STEPS.filter((l) => !seen.has(l)).join(", ") || "none"}`
  );
  // AND LONG ENOUGH TO READ. Measured from the in-page collector, in
  // milliseconds — the report was "it finished correctly but I saw
  // nothing", which is what a 30ms label looks like. The floor is 500ms
  // against a MIN_STEP_VISIBLE_MS of 800: frame jitter and the final
  // swap-to-result both shave the tail of the last one.
  const durations = Object.fromEntries(
    Object.entries(timing).map(([label, t]) => [label, Math.round(t.last - t.first)])
  );
  const tooFast = Object.entries(durations).filter(([, ms]) => ms < 500);
  check(
    `every visible step lasted >= 500ms (${Object.entries(durations).map(([l, ms]) => `${l.slice(0, 14)}=${ms}ms`).join(" · ")})`,
    tooFast.length === 0,
    `too fast to read: ${tooFast.map(([l, ms]) => `${l} ${ms}ms`).join(", ")}`
  );
  check("the preview arrived", await page.locator("text=what I'll build").first().isVisible().catch(() => false));
  check(
    "the ThinkingIndicator rendered during the run",
    // The watcher can't grab a live screenshot of the moment, but the
    // indicator and the label are one component (AiJobProgress) — the
    // labels above ARE the indicator's accompaniment. Belt: the job row
    // must have really moved through steps.
    tables.ai_jobs.some((j) => j.status === "done" && j.step >= 4)
  );
  check(
    `the model was actually called (${modelCalls.join(", ")})`,
    modelCalls.includes("evaluate_request_clarity") && modelCalls.includes("configure_agent")
  );

  console.log("\n== 3. delivery channels are offered AT CREATION ==");
  await page.screenshot({ path: path.join(outDir, "preview-channels.png"), fullPage: true });
  const previewText = await page.locator("main").innerText();
  for (const channel of ["Email", "Slack", "Telegram", "Discord", "In the app"]) {
    check(`the ${channel} option is on the create screen`, previewText.includes(channel));
  }

  console.log("\n== 4. create charges the build and counts 1 ==");
  await page.locator("button", { hasText: "Create agent" }).first().click();
  await page.waitForFunction(() => document.body.innerText.includes("1 of"), null, { timeout: 15000 }).catch(() => {});
  check(`the counter reads 1 ("${await counter().innerText().catch(() => "?")}")`, /1 of \d+ agents/.test(await counter().innerText().catch(() => "")));
  check("the agent row exists", tables.user_agents.length === 1);
  const reserves = rpcs.filter((r) => r.fn === "reserve_credits" && r.args.p_action === "agent_build");
  const settles = rpcs.filter((r) => r.fn === "settle_reservation" && r.args.p_feature === "agent_build");
  check(`the build was reserved (${reserves.length}) and settled (${settles.length}) as agent_build`, reserves.length >= 1 && settles.length >= 1);

  console.log("\n== 5. delete frees the slot; the next build is charged again ==");
  const agentId = tables.user_agents[0].id;
  const delStatus = await page.evaluate(
    (id) => fetch(`/api/agents/${id}`, { method: "DELETE" }).then((r) => r.status),
    agentId
  );
  check(`DELETE /api/agents/:id answered 200 (${delStatus})`, delStatus === 200);
  check("the row is gone (hard delete — capacity means ACTIVE agents)", tables.user_agents.length === 0);
  await page.reload({ waitUntil: "networkidle" });
  check(`the counter reads 0 again ("${await counter().innerText().catch(() => "?")}")`, /0 of \d+ agents/.test(await counter().innerText().catch(() => "")));

  const settlesBefore = rpcs.filter((r) => r.fn === "settle_reservation" && r.args.p_feature === "agent_build").length;
  await buildOnce("Every Friday, list this week's customer feedback");
  await page.locator("button", { hasText: "Create agent" }).first().click();
  await page.waitForFunction(() => document.body.innerText.includes("1 of"), null, { timeout: 15000 }).catch(() => {});
  check(`create→delete→create lands on 1 ("${await counter().innerText().catch(() => "?")}")`, /1 of \d+ agents/.test(await counter().innerText().catch(() => "")));
  const settlesAfter = rpcs.filter((r) => r.fn === "settle_reservation" && r.args.p_feature === "agent_build").length;
  check(
    `the second build was charged too (settlements ${settlesBefore} -> ${settlesAfter})`,
    settlesAfter === settlesBefore + 1
  );

  console.log("\n== 6. when the job row is INVISIBLE, the UI says so instead of nothing ==");
  // The production failure mode: worker writes fine (service role), the
  // owner's poll sees nothing (missing RLS select policy). Before the fix
  // the UI rendered NOTHING for the whole build. It must now say so.
  jobsInvisibleToOwner = true;
  await page.locator("button", { hasText: "New agent" }).first().click();
  await page.fill("#agent-request", "Every day at nine, check my metrics");
  await page.locator("button", { hasText: label("dashboard.agents.designButton") }).first().click();
  const watchLost = await page
    .waitForSelector('[data-testid="ai-progress-watch-lost"]', { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check("the watch-lost line appears (silent-nothing is fixed)", watchLost);
  jobsInvisibleToOwner = false;
} catch (err) {
  failures.push("unhandled error");
  console.log(`  FAIL  unhandled error\n        ${err.stack ?? err.message}`);
} finally {
  await context.close();
  await browser.close();
  cleanup();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
