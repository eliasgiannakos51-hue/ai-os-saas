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
import { label } from "./lib/label.mjs";
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

// What the clarifying-questions pre-check comes back with.
//
// Mutable because the two things worth testing about it are opposites: a
// clear request must sail past it (every section before 9), and a vague
// one must stop and ASK — with answers the user can tap. Section 9 flips
// this and drives the real UI against it.
//
// The field names are the tool schema's, not invented ones: needing a
// second look at lib/clarification.ts to write this fake is the point,
// because a stub that agrees with a schema nobody checked is how a parser
// bug survives its own test.
// needsClarification, camelCase — the field name in CLARIFICATION_TOOL's
// input_schema. Written snake_case first, and the symptom was a build that
// completed normally with no questions anywhere: parseClarificationResult
// reads `input.needsClarification`, a snake_case key is simply absent, and
// "absent" parses to "no questions needed". The fake was wrong, not the
// parser — the same trap this file's build payload already documents, and
// the reason a stub is only worth what it was checked against.
let clarifyAnswer = { needsClarification: false, questions: [] };
const CLARIFY_QUESTIONS = [
  { question: "How often should it run?", suggestions: ["Every morning", "Weekly", "Every Monday"] },
  { question: "Where should it look?", suggestions: ["Official sources", "Anywhere reputable"] },
  { question: "What if there is nothing that day?", suggestions: ["Say nothing", "Tell me anyway"] },
];

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
    const toolsText = JSON.stringify(parsed?.tools ?? []);
    const isClarify = /clarif/i.test(toolsText);
    // The Planner's own tool. Named separately because a single generic
    // payload would be "malformed" to whichever parser did not expect it —
    // the mistake this fake already made once with snake_case.
    const isPlan = /create_plan/.test(toolsText);
    const isRouteEntry = /route_entry/.test(toolsText);
    // file_ask sends NO tools at all — it wants prose back. Answering it
    // with a tool_use block would make the handler read an empty answer.
    const isPlainText = !parsed?.tools || parsed.tools.length === 0;
    const payload = isRouteEntry
      ? { module: "ideas", fields: { title: "Χειροποίητα κοσμήματα" }, message: "Καταχωρήθηκε ως ιδέα." }
      : isPlan
      ? {
          steps: [
            { text: "Μάθε τα βασικά της αγοράς και ποιοι είναι οι ανταγωνιστές." },
            { text: "Φτιάξε μια απλή σελίδα προσγείωσης και μέτρα το ενδιαφέρον." },
            { text: "Μίλα με δέκα πιθανούς πελάτες πριν γράψεις κώδικα." },
          ],
        }
      : isClarify
      ? clarifyAnswer
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
    if (isPlainText) {
      res.end(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-test",
          content: [
            {
              type: "text",
              text: "Η σύμβαση επιτρέπει ακύρωση με γραπτή ειδοποίηση 30 ημερών (Symvasi-Enoikiasis.pdf).",
            },
          ],
          stop_reason: "end_turn",
          usage: { input_tokens: 3400, output_tokens: 120 },
        })
      );
      return;
    }
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
const FILES = [
  {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    user_id: USER_ID,
    filename: "Symvasi-Enoikiasis.pdf",
    file_type: "pdf",
    size_bytes: 284312,
    page_count: 12,
    char_count: 240,
    extracted_text:
      "ΑΡΘΡΟ 7 — ΑΚΥΡΩΣΗ. Ο μισθωτής μπορεί να ακυρώσει με γραπτή ειδοποίηση 30 ημερών. " +
      "Σε ακύρωση εντός 30 ημερών από την έναρξη, παρακρατείται η προκαταβολή του ενός μήνα.",
    processing_status: "ready",
    error: null,
    uploaded_at: "2026-02-01T09:00:00Z",
  },
];

const jobs = new Map();
const missions = [];
const moduleRows = [];
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
    } else if (op === "is") {
      // `?consumed_at=is.null` — how PostgREST spells IS NULL, and the
      // filter the "have they seen this yet?" query is built on. Handled
      // as a real null test rather than as a string compare: `eq.null`
      // would match the STRING "null", which is exactly the kind of stub
      // shortcut that makes a broken filter look like a working one.
      const want = value === "null" ? null : value === "true" ? true : value === "false" ? false : value;
      if (want === null) {
        if (row[key] !== null && row[key] !== undefined) return false;
      } else if (row[key] !== want) {
        return false;
      }
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
          // Explicitly null, like the column's default. Leaving it absent
          // would make `consumed_at=is.null` match on "the key is not
          // there", which is not the same question the database answers.
          consumed_at: null,
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

    if (url.pathname === "/rest/v1/create_requests" || url.pathname === "/rest/v1/user_ideas") {
      if (req.method === "POST") {
        const row = { id: `row-${moduleRows.length + 1}`, ...(parsed ?? {}) };
        moduleRows.push(row);
        const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
        return json(201, wantsObject ? row : [row]);
      }
      return json(200, moduleRows);
    }

    if (url.pathname === "/rest/v1/ai_missions") {
      if (req.method === "POST") {
        const row = { id: `mission-${missions.length + 1}`, ...(parsed ?? {}) };
        missions.push(row);
        const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
        return json(201, wantsObject ? row : [row]);
      }
      return json(200, missions);
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows =
        table === "user_credits"
          ? [{ user_id: USER_ID, credits_remaining: 5000, credits_total: 6000 }]
          : table === "user_files"
            ? FILES
            : [];
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

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
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
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
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
  // NOT `check(..., true)`. That asserted a literal: it could not go red,
  // and its label claimed something it never looked at. If `ctx.close()`
  // ever stopped closing the page, section 3 would be testing nothing —
  // the work would still have a live watcher and section 4 would prove
  // nothing about detachment. Ask the page whether it is actually shut.
  check("the browser context is gone", page.isClosed(), `page.isClosed()=${page.isClosed()}`);
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
  //
  // THIS ASSERTION USED TO SAY THE OPPOSITE, and the old wording is the
  // bug. It read "reports nothing running now that it is done" and passed
  // — while the draft the user had just paid for sat in a row no screen in
  // the app could reach. Being unable to see your own finished work is not
  // a neutral outcome: the only move left is to ask for it again, and that
  // second ask is a second real charge.
  // SECTION 4 ALREADY PROVED THE FIRST HALF WITHOUT MEANING TO. It opened
  // /dashboard/agents in this context — and that page found the finished
  // draft, rendered it, and reported it seen. So the honest first
  // assertion here is not "nothing is offered": it is that the draft was
  // offered, shown, and marked, which is the whole mechanism running
  // end-to-end without a single assertion asking it to.
  check(
    "the page opened in section 4 found the finished draft and marked it seen",
    jobs.get(jobId)?.consumed_at != null,
    `consumed_at=${jobs.get(jobId)?.consumed_at}`
  );
  const recovered = await page2.evaluate(async () => (await (await fetch("/api/jobs?kind=agent_build")).json()));
  check("the 'where was I?' query answers", recovered.ok === true);
  check("and having been seen, it is not offered again", recovered.job === null, JSON.stringify(recovered.job ?? null).slice(0, 200));

  // Put the ROW back to never-seen — a database state, not an app action —
  // so the offer itself can be checked rather than the page that consumed
  // it. Nothing else about the job is touched.
  jobs.get(jobId).consumed_at = null;
  const offered = await page2.evaluate(async () => (await (await fetch("/api/jobs?kind=agent_build")).json()));
  check(
    "an unseen finished draft IS handed back",
    offered.job?.id === jobId && offered.job?.status === "done",
    JSON.stringify(offered.job ?? null).slice(0, 200)
  );
  check("with the draft itself in it, ready to render", offered.job?.result?.draft?.name === "Nvidia Daily News");
  check("and the request that was typed, so a resumed page is not blank", typeof offered.job?.input?.request === "string");
  check("marked as never seen", offered.job?.consumedAt === null);

  const marked = await page2.evaluate(
    async (id) => (await (await fetch(`/api/jobs/${id}/consume`, { method: "POST" })).json()),
    jobId
  );
  check("it can be marked seen", marked.ok === true && typeof marked.consumedAt === "string", JSON.stringify(marked));
  const afterSeen = await page2.evaluate(async () => (await (await fetch("/api/jobs?kind=agent_build")).json()));
  check("after which it is NOT offered again", afterSeen.job === null, JSON.stringify(afterSeen.job ?? null).slice(0, 200));
  const markedTwice = await page2.evaluate(
    async (id) => (await (await fetch(`/api/jobs/${id}/consume`, { method: "POST" })).json()),
    jobId
  );
  check("marking it twice is fine, not an error", markedTwice.ok === true && markedTwice.alreadyConsumed === true);

  // It is a mark, not a delete. The row, the result and the credit record
  // are all exactly where they were.
  const done = await page2.evaluate(async () => (await (await fetch("/api/jobs?kind=agent_build&active=0")).json()));
  check("while the finished job is still findable", done.job?.id === jobId);
  check("with its result intact", done.job?.result?.draft?.name === "Nvidia Daily News");

  console.log("\n== 6b. mission_plan: same test, same guarantees ==");
  {
    const ctxM = await newContext();
    const pageM = await ctxM.newPage();
    await pageM.goto(`http://127.0.0.1:${PORT}/dashboard/mission`, { waitUntil: "networkidle", timeout: 60000 });
    const startedM = await pageM.evaluate(async () => {
      const r = await fetch("/api/mission/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: "Θέλω να ξεκινήσω μια μικρή επιχείρηση με χειροποίητα κοσμήματα." }),
      });
      return { status: r.status, body: await r.json() };
    });
    check(`the plan route answers 202 (${startedM.status})`, startedM.status === 202);
    check("with a job id and no mission yet", typeof startedM.body.jobId === "string" && !startedM.body.mission);
    const missionJobId = startedM.body.jobId;

    const closedAtM = Date.now();
    await ctxM.close();
    await new Promise((r) => setTimeout(r, BUILD_DELAY_MS + 6000));

    const ctxM2 = await newContext();
    const pageM2 = await ctxM2.newPage();
    await pageM2.goto(`http://127.0.0.1:${PORT}/dashboard/mission`, { waitUntil: "networkidle", timeout: 60000 });
    const doneM = await pageM2.evaluate(async (id) => (await (await fetch(`/api/jobs/${id}`)).json()).job, missionJobId);
    check(`the plan completed with the page closed (status=${doneM.status})`, doneM.status === "done", JSON.stringify(doneM).slice(0, 300));
    check("a mission was actually saved", doneM.result?.planned === true, JSON.stringify(doneM.result ?? {}).slice(0, 300));
    check("and it finished after the page closed", Date.parse(doneM.finishedAt) >= closedAtM - 2000);
    check(`the mission row exists (${missions.length})`, missions.length === 1);
    check(`and it settled once more, not twice (${settlements})`, settlements === 2);
    await ctxM2.close();
  }

  console.log("\n== 6c. file_ask: same test, same guarantees ==");
  {
    const ctxF = await newContext();
    const pageF = await ctxF.newPage();
    await pageF.goto(`http://127.0.0.1:${PORT}/dashboard/files`, { waitUntil: "networkidle", timeout: 60000 });
    const startedF = await pageF.evaluate(async (fileId) => {
      const r = await fetch("/api/files/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Τι λέει η σύμβαση για την ακύρωση;",
          fileIds: [fileId],
          language: "el",
        }),
      });
      return { status: r.status, body: await r.json() };
    }, FILES[0].id);
    check(`the ask route answers 202 (${startedF.status})`, startedF.status === 202, JSON.stringify(startedF.body).slice(0, 200));
    check("with a job id and no answer", typeof startedF.body.jobId === "string" && !startedF.body.answer);
    const askJobId = startedF.body.jobId;

    const closedAtF = Date.now();
    await ctxF.close();
    await new Promise((r) => setTimeout(r, BUILD_DELAY_MS + 6000));

    const ctxF2 = await newContext();
    const pageF2 = await ctxF2.newPage();
    await pageF2.goto(`http://127.0.0.1:${PORT}/dashboard/files`, { waitUntil: "networkidle", timeout: 60000 });
    const doneF = await pageF2.evaluate(async (id) => (await (await fetch(`/api/jobs/${id}`)).json()).job, askJobId);
    check(`the answer completed with the page closed (status=${doneF.status})`, doneF.status === "done", JSON.stringify(doneF).slice(0, 300));
    check("it answered", doneF.result?.answered === true, JSON.stringify(doneF.result ?? {}).slice(0, 300));
    check("from the documents", doneF.result?.answeredFromDocuments === true);
    check("and it finished after the page closed", Date.parse(doneF.finishedAt) >= closedAtF - 2000);
    await ctxF2.close();
  }

  console.log("\n== 6d. create: same test, same guarantees ==");
  {
    const ctxC = await newContext();
    const pageC = await ctxC.newPage();
    await pageC.goto(`http://127.0.0.1:${PORT}/dashboard/create`, { waitUntil: "networkidle", timeout: 60000 });
    const startedC = await pageC.evaluate(async () => {
      const r = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Ιδέα: χειροποίητα κοσμήματα από ασήμι.", skipClarification: true }),
      });
      return { status: r.status, body: await r.json() };
    });
    check(`the create route answers 202 (${startedC.status})`, startedC.status === 202, JSON.stringify(startedC.body).slice(0, 200));
    check("with a job id and no classification", typeof startedC.body.jobId === "string" && startedC.body.matched === undefined);
    const createJobId = startedC.body.jobId;

    const closedAtC = Date.now();
    await ctxC.close();
    await new Promise((r) => setTimeout(r, BUILD_DELAY_MS + 6000));

    const ctxC2 = await newContext();
    const pageC2 = await ctxC2.newPage();
    await pageC2.goto(`http://127.0.0.1:${PORT}/dashboard/create`, { waitUntil: "networkidle", timeout: 60000 });
    const doneC = await pageC2.evaluate(async (id) => (await (await fetch(`/api/jobs/${id}`)).json()).job, createJobId);
    check(`create completed with the page closed (status=${doneC.status})`, doneC.status === "done", JSON.stringify(doneC).slice(0, 300));
    check("and it finished after the page closed", Date.parse(doneC.finishedAt) >= closedAtC - 2000);
    await ctxC2.close();
  }

  console.log("\n== 7. a second worker cannot run the same job ==");
  // Anchored to the count as it stands NOW, not to the literal 1. The
  // first version asserted 1 and went red the moment the mission section
  // above legitimately settled a second job — the assertion was counting
  // the wrong thing, not catching a double charge.
  const settlementsBeforeRace = settlements;
  const raced = await page2.evaluate(async (id) => {
    const [a, b] = await Promise.all([
      fetch(`/api/jobs/${id}/continue`, { method: "POST" }).then((r) => r.json()),
      fetch(`/api/jobs/${id}/continue`, { method: "POST" }).then((r) => r.json()),
    ]);
    return [a, b];
  }, jobId);
  check("both calls are answered", raced.every((r) => r.ok === true), JSON.stringify(raced));
  check("neither re-ran the finished job", raced.every((r) => r.ran === false), JSON.stringify(raced));
  check(`and nothing settled again (${settlementsBeforeRace} -> ${settlements})`, settlements === settlementsBeforeRace);
  await ctx2.close();

  // -------------------------------------------------------------------
  console.log("\n== 8. THE ACCEPTANCE TEST, in a real browser, on the real UI ==");
  // -------------------------------------------------------------------
  // The four steps from the brief, in order, driven through the same
  // buttons a person presses:
  //
  //   1. start an agent build
  //   2. change page in the middle of it
  //   3. come back — THE PREVIEW MUST BE THERE
  //   4. see it, leave, come back again — IT MUST NOT COME BACK
  //
  // Step 3 is the money. Before consumed_at it failed: the page asked
  // "anything running?", the answer was "no" because the job had
  // finished, and the paid-for draft was unreachable. The user's only
  // option was to press Design again and pay again.
  {
    const ctxA = await newContext();
    const pageA = await ctxA.newPage();
    const AGENTS = `http://127.0.0.1:${PORT}/dashboard/agents`;
    const ELSEWHERE = `http://127.0.0.1:${PORT}/dashboard/mission`;
    const bodyText = () => pageA.evaluate(() => document.body.innerText);

    await pageA.goto(AGENTS, { waitUntil: "networkidle", timeout: 60000 });
    await pageA.getByRole("button", { name: "New agent" }).click();
    await pageA.locator("#agent-request").fill("Every morning, summarise the most important Nvidia news.");
    const jobsBefore = jobs.size;
    await pageA.getByRole("button", { name: label("dashboard.agents.designButton") }).click();

    // Wait for the ROW to exist rather than for a spinner: the row is what
    // the rest of this depends on, and a spinner can be a render away from
    // a request that never left.
    let started = false;
    for (let i = 0; i < 40 && !started; i++) {
      await new Promise((r) => setTimeout(r, 250));
      started = jobs.size > jobsBefore;
    }
    check("1. pressing Design starts a background job", started, `jobs=${jobs.size}, before=${jobsBefore}`);
    const uiJobId = [...jobs.keys()].pop();

    // 2. AWAY, mid-build. The worker is six seconds into a call that has
    //    not returned.
    await pageA.goto(ELSEWHERE, { waitUntil: "networkidle", timeout: 60000 });
    const midFlight = jobs.get(uiJobId)?.status;
    check(`2. the page changed while the build was still going (status=${midFlight})`, midFlight === "queued" || midFlight === "running");

    await new Promise((r) => setTimeout(r, BUILD_DELAY_MS + 8000));
    check(`   the worker finished anyway (status=${jobs.get(uiJobId)?.status})`, jobs.get(uiJobId)?.status === "done");
    check("   and it was never seen", jobs.get(uiJobId)?.consumed_at == null);

    // 3. BACK. This is the step that used to be impossible.
    await pageA.goto(AGENTS, { waitUntil: "networkidle", timeout: 60000 });
    const sawPreview = await pageA
      .waitForFunction(() => document.body.innerText.includes("Here's what I'll build"), { timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    check("3. COMING BACK, THE PREVIEW IS THERE", sawPreview, (await bodyText()).slice(0, 700));
    const previewBody = await bodyText();
    check("   showing the agent that was designed", previewBody.includes("Nvidia Daily News"), previewBody.slice(0, 500));
    check(
      "   and the sentence that was typed, so the panel is not blank",
      (await pageA.locator("#agent-request").inputValue()).includes("Nvidia")
    );

    // Rendering it IS the sighting — nothing was clicked.
    let markedSeen = false;
    for (let i = 0; i < 40 && !markedSeen; i++) {
      await new Promise((r) => setTimeout(r, 250));
      markedSeen = jobs.get(uiJobId)?.consumed_at != null;
    }
    check("   seeing it is what marks it seen — no click required", markedSeen, `consumed_at=${jobs.get(uiJobId)?.consumed_at}`);

    // 4. AWAY AND BACK AGAIN.
    await pageA.goto(ELSEWHERE, { waitUntil: "networkidle", timeout: 60000 });
    await pageA.goto(AGENTS, { waitUntil: "networkidle", timeout: 60000 });
    await pageA.waitForTimeout(5000);
    const secondVisit = await bodyText();
    check("4. IT DOES NOT COME BACK A SECOND TIME", !secondVisit.includes("Here's what I'll build"), secondVisit.slice(0, 500));
    check("   and no draft is on the page at all", !secondVisit.includes("Nvidia Daily News"), secondVisit.slice(0, 500));

    // And nothing was destroyed to achieve it.
    const stillThere = await pageA.evaluate(async () => (await (await fetch("/api/jobs?kind=agent_build&active=0")).json()));
    check("   the job row is untouched — this is a mark, not a delete", stillThere.job?.id === uiJobId, JSON.stringify(stillThere.job ?? null).slice(0, 200));
    check(
      `   and the build ran exactly once for one charge (${jobs.get(uiJobId)?.attempts} attempt)`,
      jobs.get(uiJobId)?.attempts === 1
    );
    await ctxA.close();
  }

  // -------------------------------------------------------------------
  console.log("\n== 9. the clarifying questions actually reach the screen ==");
  // -------------------------------------------------------------------
  // The reported symptom was "needsClarification exists in the build
  // response but never fires". The cause was the system prompt, not the
  // wiring — so this proves the wiring end to end by making the check say
  // yes and then looking at what a real browser renders.
  //
  // Everything after the fake's answer is the real thing: the real
  // handler, the real parser, the real job row, the real component.
  {
    clarifyAnswer = { needsClarification: true, questions: CLARIFY_QUESTIONS };
    const ctxQ = await newContext();
    const pageQ = await ctxQ.newPage();
    const AGENTS = `http://127.0.0.1:${PORT}/dashboard/agents`;
    await pageQ.goto(AGENTS, { waitUntil: "networkidle", timeout: 60000 });
    await pageQ.getByRole("button", { name: "New agent" }).click();
    await pageQ.locator("#agent-request").fill("Keep me updated on my competitors");
    await pageQ.getByRole("button", { name: label("dashboard.agents.designButton") }).click();

    const asked = await pageQ
      .waitForFunction(() => document.body.innerText.includes("How often should it run?"), { timeout: 40000 })
      .then(() => true)
      .catch(() => false);
    const bodyQ = await pageQ.evaluate(() => document.body.innerText);
    // The ROW, not just the pixels. "The questions did not appear" has
    // three very different causes — the job failed, the check said no, or
    // the screen dropped what it was given — and only the row can say
    // which, so it is printed rather than guessed at.
    const askJob = [...jobs.values()].filter((j) => j.kind === "agent_build").pop();
    check(
      "a vague request is asked about instead of guessed at",
      asked,
      `job=${JSON.stringify({ status: askJob?.status, error: askJob?.error, result: askJob?.result })}\n        page=${bodyQ.replace(/\s+/g, " ").slice(-400)}`
    );
    check("   all three questions are shown", /Where should it look\?/.test(bodyQ) && /nothing that day/.test(bodyQ));

    // (γ) the answers are tappable, not an empty box.
    const chip = pageQ.getByRole("button", { name: "Every morning", exact: true });
    check("   the suggested answers are real buttons", (await chip.count()) === 1);
    await chip.click();
    await pageQ.waitForTimeout(200);
    const filled = await pageQ.locator("#clarify-0").inputValue();
    check(`   tapping one fills that answer ("${filled}")`, filled === "Every morning");
    check("   and marks itself chosen", (await chip.getAttribute("aria-pressed")) === "true");
    await chip.click();
    await pageQ.waitForTimeout(200);
    check("   tapping it again clears it", (await pageQ.locator("#clarify-0").inputValue()) === "");
    await chip.click();
    await pageQ.waitForTimeout(200);

    // (γ) Skip is always there.
    check("   Skip is on the screen", (await pageQ.getByRole("button", { name: "Skip, build it anyway" }).count()) === 1);

    // The answer is folded back into the ORIGINAL request and resubmitted
    // with skipClarification, so the second pass is not asked again.
    const jobsBeforeAnswer = jobs.size;
    await pageQ.getByRole("button", { name: "Continue", exact: true }).click();
    let secondJob = null;
    for (let i = 0; i < 60 && !secondJob; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (jobs.size > jobsBeforeAnswer) secondJob = [...jobs.values()].pop();
    }
    check("   answering starts a second, informed build", Boolean(secondJob));
    check(
      "   carrying the original sentence AND the answer",
      /Keep me updated on my competitors/.test(secondJob?.input?.request ?? "") &&
        /Every morning/.test(secondJob?.input?.request ?? ""),
      String(secondJob?.input?.request ?? "").slice(0, 300)
    );
    check("   and it does not ask the same questions again", secondJob?.input?.skipClarification === true);
    // (δ) the check is given what the app already knows, so it cannot ask
    // for it — captured by the route, on the FIRST pass only.
    const firstJob = [...jobs.values()].find((j) => j.kind === "agent_build" && j.input?.skipClarification === false);
    check("   the first pass carried the AI Life Context", typeof firstJob?.input?.knownContext === "string" && firstJob.input.knownContext.length > 0);
    check("   the resubmission did not pay for it again", secondJob?.input?.knownContext == null);

    await ctxQ.close();
    clarifyAnswer = { needsClarification: false, questions: [] };
  }
} catch (err) {
  failures.push("unhandled error");
  console.log(`  FAIL  unhandled error\n        ${err.stack ?? err.message}`);
} finally {
  await browser.close();
  cleanup();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
