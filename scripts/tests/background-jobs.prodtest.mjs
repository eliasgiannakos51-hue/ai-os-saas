// "Start it, close the page, come back — does it continue?"
//
// That is the brief's acceptance test, and it is the only one that can
// actually settle the question. Every static assertion in
// scripts/tests/background-jobs.test.mjs says the work is detached from
// the request; this closes the browser page mid-build and then checks, in
// a NEW page, that the agent was designed anyway.
//
// Nothing about the application is stubbed. The real production build runs
// the real route, the real startJob, the real worker and the real client.
// Two things outside the app stand in:
//
//   * Anthropic, via ANTHROPIC_BASE_URL — the SDK's own documented
//     override. It speaks the real Messages protocol and returns a real
//     tool_use block, so agent-builder's parsing is exercised for real.
//   * Supabase, via a small in-memory PostgREST stand-in that implements
//     the four things this flow needs: insert, CONDITIONAL update (the
//     claim), select, and the two billing RPCs. The conditional update is
//     the one that matters — faking it as an unconditional write would
//     make the exactly-once test meaningless.
//
// Run: node scripts/tests/background-jobs.prodtest.mjs
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
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CRON_SECRET = "test-cron-secret-for-internal-handoff";

const user = () => ({
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: { subscription_tier: "growth", stripe_customer_id: "cus_test" },
  identities: [],
});

// ---------------------------------------------------------------------
// A fake Anthropic that is slow ON PURPOSE.
//
// The build has to still be running when the page closes, or the test
// proves nothing. Six seconds is comfortably longer than the browser needs
// to press the button and be closed.
// ---------------------------------------------------------------------
const BUILD_DELAY_MS = 6000;
let anthropicCalls = 0;

const anthropic = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    anthropicCalls++;
    const parsed = (() => {
      try {
        return JSON.parse(body);
      } catch {
        return {};
      }
    })();
    const toolName = parsed?.tools?.[0]?.name ?? "";

    // The clarifying-questions pre-check runs first and must say "no
    // questions", or the build would stop there and never reach the part
    // this test is about.
    const isClarify = /clarif/i.test(JSON.stringify(parsed?.tools ?? []));
    const payload = isClarify
      ? { needs_clarification: false, questions: [] }
      : {
          // The REAL field names from agent-builder's tool schema. My first
          // version used snake_case and the job completed with
          // reason:"malformed" — the fake was wrong, not the parser, and
          // that is exactly the sort of thing a stub gets to hide if it is
          // never checked against the schema it is imitating.
          name: "Nvidia Daily News",
          description: "The most important Nvidia news, every morning",
          taskPrompt: "Find and summarise the most important Nvidia news from the last 24 hours.",
          scheduleCron: "0 8 * * *",
          needsWebSearch: true,
          outputFormat: "bullets",
          language: "en",
          understood: "A daily briefing on Nvidia news, delivered by email at 08:00.",
        };

    if (!isClarify) await new Promise((r) => setTimeout(r, BUILD_DELAY_MS));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-test",
        content: [{ type: "tool_use", id: "tu_1", name: toolName || "build_agent", input: payload }],
        stop_reason: "tool_use",
        usage: { input_tokens: 1200, output_tokens: 400 },
      })
    );
  });
});
await new Promise((r) => anthropic.listen(54351, "127.0.0.1", r));

// ---------------------------------------------------------------------
// An in-memory PostgREST that honours a conditional update.
// ---------------------------------------------------------------------
const jobs = new Map();
let jobSeq = 0;
let settlements = 0;
let releases = 0;
const reservations = new Map();

function matches(row, params) {
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const [op, ...rest] = String(raw).split(".");
    const value = rest.join(".");
    if (op === "eq") {
      const want = value === "true" ? true : value === "false" ? false : value;
      if (String(row[key]) !== String(want)) return false;
    } else if (op === "in") {
      const list = value.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
      if (!list.includes(String(row[key]))) return false;
    }
  }
  return true;
}

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const json = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const parsed = (() => {
      try {
        return body ? JSON.parse(body) : null;
      } catch {
        return null;
      }
    })();

    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/admin/users/")) return json(200, user());
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });

    if (url.pathname === "/rest/v1/rpc/reserve_credits") {
      const id = `res_${reservations.size + 1}`;
      reservations.set(id, { released: false });
      return json(200, [{ reservation_id: id, available: 5000 }]);
    }
    if (url.pathname === "/rest/v1/rpc/settle_reservation") {
      settlements++;
      return json(200, [{ credits_charged: 12, settled: true }]);
    }
    if (url.pathname === "/rest/v1/rpc/release_reservation") {
      releases++;
      return json(200, []);
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) return json(200, []);

    if (url.pathname === "/rest/v1/ai_jobs") {
      const params = [...url.searchParams.entries()];
      if (req.method === "POST") {
        const id = `job-${++jobSeq}`;
        const now = new Date().toISOString();
        const row = {
          id,
          user_id: USER_ID,
          status: "queued",
          running: false,
          step: 0,
          step_total: 1,
          step_label: null,
          result: null,
          error: null,
          credits_charged: null,
          attempts: 0,
          usage_entries: [],
          reservation_id: null,
          started_at: null,
          finished_at: null,
          created_at: now,
          updated_at: now,
          ...(parsed ?? {}),
        };
        jobs.set(id, row);
        // .select("id").single() sends Accept: vnd.pgrst.object, and
        // PostgREST answers with the OBJECT, not a one-element array.
        // Returning the array made insert().select().single() throw, which
        // surfaced as "The job could not be started" — the stub being
        // wrong, not startJob.
        const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
        return json(201, wantsObject ? row : [row]);
      }
      if (req.method === "PATCH") {
        // THE CONDITIONAL UPDATE. Only rows matching every filter are
        // touched, and only those are returned — which is exactly what
        // makes claimJob a lock rather than a wish.
        const updated = [];
        for (const row of jobs.values()) {
          if (!matches(row, params)) continue;
          Object.assign(row, parsed ?? {}, { updated_at: new Date().toISOString() });
          updated.push(row);
        }
        return json(200, updated);
      }
      const found = [...jobs.values()].filter((r) => matches(r, params));
      found.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return found[0] ? json(200, found[0]) : json(406, { message: "no rows" });
      return json(200, found);
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows = table === "user_credits" ? [{ user_id: USER_ID, credits_remaining: 5000, credits_total: 6000 }] : [];
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows);
    }
    json(200, {});
  });
});
await new Promise((r) => supa.listen(54352, "127.0.0.1", r));

const PROJECT_REF = "127";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const session = {
  access_token: jwt({ sub: USER_ID, aud: "authenticated", role: "authenticated", email: "owner@example.com", iat: nowSec, exp: nowSec + 3600 }),
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
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54352",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 }),
  SUPABASE_SERVICE_ROLE_KEY: jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 }),
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
  ANTHROPIC_API_KEY: "sk-ant-test",
  ANTHROPIC_BASE_URL: "http://127.0.0.1:54351",
  // Without this there is no authenticated way for the app to call itself,
  // which is precisely the mechanism under test.
  CRON_SECRET,
};

console.log("running `next build` (production build, not a dev server) ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
if ((await new Promise((r) => build.on("close", r))) !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  process.exit(1);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
function cleanup() {
  try {
    server.kill("SIGKILL");
  } catch {
    /* already gone */
  }
  anthropic.close();
  supa.close();
}
let up = false;
for (let i = 0; i < 120 && !up; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/login`, { signal: AbortSignal.timeout(2000) });
    up = r.ok;
  } catch {
    /* not up yet */
  }
  if (!up) await new Promise((r) => setTimeout(r, 500));
}
if (!up) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT}\n`);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const newContext = () =>
  browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: { cookies: [{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" }], origins: [] },
  });

try {
  console.log("== 1. the route hands back a job instead of an answer ==");
  const ctx = await newContext();
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/agents`, { waitUntil: "networkidle", timeout: 60000 });

  const started = await page.evaluate(async () => {
    const r = await fetch("/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "Every morning, summarise the most important Nvidia news.", timezone: "Europe/Athens" }),
    });
    return { status: r.status, body: await r.json() };
  });
  check(`it answers 202 Accepted (${started.status})`, started.status === 202);
  check("with a job id", typeof started.body.jobId === "string" && started.body.jobId.length > 0, JSON.stringify(started.body));
  check("and no draft — the work has not happened yet", started.body.draft === undefined);
  const jobId = started.body.jobId;

  // The route must have returned FAST. If it had awaited the build it
  // could not have, because the fake Anthropic sleeps for six seconds.
  console.log("\n== 2. it returned before the work could possibly be done ==");
  const jobAfterStart = await page.evaluate(async (id) => (await (await fetch(`/api/jobs/${id}`)).json()).job, jobId);
  check(
    `the job is still going when the route has already answered (status=${jobAfterStart.status})`,
    jobAfterStart.status === "queued" || jobAfterStart.status === "running"
  );

  console.log("\n== 3. THE PAGE IS CLOSED MID-BUILD ==");
  await ctx.close();
  check("the browser context is gone", true);
  const closedAt = Date.now();

  // Nothing is watching now. If the work were attached to the request it
  // would die here.
  await new Promise((r) => setTimeout(r, BUILD_DELAY_MS + 6000));

  console.log("\n== 4. a NEW page sees a finished agent ==");
  const ctx2 = await newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(`http://127.0.0.1:${PORT}/dashboard/agents`, { waitUntil: "networkidle", timeout: 60000 });

  const finished = await page2.evaluate(async (id) => (await (await fetch(`/api/jobs/${id}`)).json()).job, jobId);
  check(`the job completed with the page closed (status=${finished.status})`, finished.status === "done", JSON.stringify(finished).slice(0, 400));
  check("it produced a draft", Boolean(finished.result?.built), JSON.stringify(finished.result).slice(0, 300));
  check("with the agent the model designed", finished.result?.draft?.name === "Nvidia Daily News", JSON.stringify(finished.result?.draft ?? {}).slice(0, 200));
  check("and it finished after the page closed", Date.parse(finished.finishedAt) >= closedAt - 2000, `${finished.finishedAt} vs ${new Date(closedAt).toISOString()}`);
  check(`Anthropic really was called (${anthropicCalls} calls)`, anthropicCalls >= 1);

  console.log("\n== 5. credits settled exactly once ==");
  check(`settle_reservation was called once (${settlements})`, settlements === 1);
  check("the job records what it charged", typeof finished.creditsCharged === "number");
  check("and it was not run twice", finished.attempts === 1, `attempts=${finished.attempts}`);

  console.log("\n== 6. coming back, the page finds the job by itself ==");
  // The mount query is what makes this work in a new tab, a new browser,
  // or after a cleared cache — none of which a localStorage id survives.
  const recovered = await page2.evaluate(async () => (await (await fetch("/api/jobs?kind=agent_build")).json()));
  check("the 'anything running?' query answers", recovered.ok === true);
  check("and reports nothing running now that it is done", recovered.job === null);
  const done = await page2.evaluate(async () => (await (await fetch("/api/jobs?kind=agent_build&active=0")).json()));
  check("while the finished job is still findable", done.job?.id === jobId);

  console.log("\n== 7. a second worker cannot run the same job ==");
  const raced = await page2.evaluate(async (id) => {
    const [a, b] = await Promise.all([
      fetch(`/api/jobs/${id}/continue`, { method: "POST" }).then((r) => r.json()),
      fetch(`/api/jobs/${id}/continue`, { method: "POST" }).then((r) => r.json()),
    ]);
    return [a, b];
  }, jobId);
  check("both calls are answered", raced.every((r) => r.ok === true), JSON.stringify(raced));
  check("neither re-ran the finished job", raced.every((r) => r.ran === false), JSON.stringify(raced));
  check(`and nothing settled a second time (${settlements})`, settlements === 1);
  await ctx2.close();
} catch (err) {
  failures.push("unhandled error");
  console.log(`  FAIL  unhandled error\n        ${err.stack ?? err.message}`);
} finally {
  await browser.close();
  cleanup();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
