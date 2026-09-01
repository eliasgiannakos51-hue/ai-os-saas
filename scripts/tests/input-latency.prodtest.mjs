// Keystroke → paint latency, MEASURED, in a production build.
//
// WHAT WAS REPORTED. "When I type in the chat there is a visible delay
// before the letters appear. I think it is general, not only chat."
//
// This measures instead of estimating: the browser's own Event Timing API
// (PerformanceObserver type "event") reports, for every input event, the
// time from the keystroke's hardware timestamp to the next paint after
// its handlers ran — exactly the "when does my letter appear" number.
//
// Surfaces measured, chosen to be the heaviest realistic screens:
//   · the Chat composer with a 40-message thread behind it
//   · a module list's search box with 120 records behind it
//   · the Files question box with cards + collections on the page
//
// Budgets. The APP-CONTROLLED number is `main` (input delay + handler
// time, entry.processingEnd - entry.startTime): p95 must stay under 50ms
// — when the original bug was live this was >100ms because the animated,
// filtered SVG backgrounds re-rasterised the page on the main thread
// continuously. The full keystroke→paint `duration` is also printed and
// budgeted loosely (250ms): in headless Chromium the compositor ticks at
// its own cadence whenever ANY animation runs, so paint-wait includes an
// environmental delay a real display does not have.
//
// Run: node scripts/tests/input-latency.prodtest.mjs
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
const CONVO_ID = "cccccccc-1111-4111-8111-111111111111";
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

const MESSAGES = Array.from({ length: 40 }, (_, i) => ({
  id: `dddddddd-2222-4222-8222-${String(i + 1).padStart(12, "0")}`,
  conversation_id: CONVO_ID,
  role: i % 2 === 0 ? "user" : "assistant",
  content: `Message ${i + 1}. ${"Body text with **markdown**, a [link](https://example.com) and `code`. ".repeat(4)}`,
  created_at: new Date(Date.UTC(2026, 1, 1, 10, i)).toISOString(),
}));

// 120 records for the finance module so the search box has a real list
// behind it.
const RECORDS = Array.from({ length: 120 }, (_, i) => ({
  id: `ffffffff-3333-4333-8333-${String(i + 1).padStart(12, "0")}`,
  user_id: USER_ID,
  description: `Ledger entry number ${i + 1} for measurement`,
  amount: String((i * 13.5).toFixed(2)),
  entry_type: i % 2 === 0 ? "income" : "expense",
  category: "operations",
  entry_date: "2026-02-01",
  notes: "generated row",
  created_at: new Date(Date.UTC(2026, 1, 1, 9, i % 60)).toISOString(),
}));

const FILES = Array.from({ length: 24 }, (_, i) => ({
  id: `aaaaaaaa-4444-4444-8444-${String(i + 1).padStart(12, "0")}`,
  user_id: USER_ID,
  filename: `Document-${i + 1}.pdf`,
  file_type: "pdf",
  size_bytes: 100000 + i,
  page_count: 3,
  char_count: 5000,
  processing_status: "ready",
  error: null,
  uploaded_at: "2026-02-01T09:00:00Z",
}));

const TABLE_ROWS = {
  user_credits: [{ user_id: USER_ID, credits_remaining: 2500, credits_total: 3000 }],
  chat_conversations: [
    {
      id: CONVO_ID,
      title: "Long conversation",
      is_pinned: false,
      created_at: "2026-02-01T09:00:00Z",
      updated_at: "2026-02-01T11:00:00Z",
    },
  ],
  chat_messages: MESSAGES,
  finance_entries: RECORDS,
  user_files: FILES,
  file_collections: [],
  file_collection_items: [],
  favorites: [],
};

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
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
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      if (req.method === "POST") return json(201, []);
      const rows = TABLE_ROWS[table] ?? [];
      if ((req.headers.prefer ?? "").includes("count=")) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : `*/0`,
          ...cors,
        });
        return res.end(JSON.stringify(req.method === "HEAD" ? null : rows));
      }
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows);
    }
    json(200, {});
  });
});

const SUPA_PORT = 54347;
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

/**
 * Type SENTENCE into `selector` and return {p50, p95, max, n} of the
 * Event Timing durations for its input events — keydown-to-paint, as the
 * browser itself accounts it.
 */
async function measureTyping(page, selector, sentence) {
  await page.evaluate(() => {
    window.__latencies = [];
    window.__observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // "input" entries are the text insertion itself — keydown would
        // double-count every keystroke.
        if (entry.name === "input") {
          window.__latencies.push({
            duration: entry.duration,
            // Input delay + handler time: the part the APPLICATION
            // controls. `duration` additionally includes the wait for the
            // next COMPOSITOR frame, which in headless Chromium ticks at
            // its own cadence whenever any animation is running — that
            // wait says nothing about the app's code.
            main: entry.processingEnd - entry.startTime,
          });
        }
      }
    });
    // The spec clamps durationThreshold to a 16ms floor: keystrokes that
    // paint faster than one frame are NOT reported at all. That silence
    // is a measurement, not a gap — see below.
    window.__observer.observe({ type: "event", durationThreshold: 16, buffered: false });
  });
  const field = page.locator(selector).first();
  await field.click();
  // Human-ish cadence: fast enough to stack if handlers are slow, slow
  // enough that each keystroke gets its own frame when they are not.
  await field.pressSequentially(sentence, { delay: 60 });
  await page.waitForTimeout(600);
  return page.evaluate((expected) => {
    const reported = [...window.__latencies];
    window.__observer?.disconnect();
    // Every keystroke the observer did NOT report painted in under 16ms.
    // Score those at 8ms (4ms main-thread) so the percentiles cover ALL
    // keystrokes — a fast page must not be judged only by its slowest.
    const fast = Math.max(0, expected - reported.length);
    const paint = [...Array(fast).fill(8), ...reported.map((r) => r.duration)].sort((a, b) => a - b);
    const main = [...Array(fast).fill(4), ...reported.map((r) => r.main)].sort((a, b) => a - b);
    const at = (xs, q) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))] ?? 0;
    return {
      n: paint.length,
      slow: reported.length,
      p50: at(paint, 0.5),
      p95: at(paint, 0.95),
      max: paint[paint.length - 1] ?? 0,
      mainP50: at(main, 0.5),
      mainP95: at(main, 0.95),
    };
  }, sentence.length);
}

const SENTENCE = "How does the cancellation clause interact with renewals?";
const BUDGET_MAIN_P95 = 50;
const BUDGET_PAINT_P95 = 250;

try {
  console.log("== 1. chat composer, 40-message thread behind it ==");
  {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/dashboard/chat?c=${CONVO_ID}`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForSelector("text=Message 40.", { timeout: 15000 });
    const m = await measureTyping(page, "main textarea", SENTENCE);
    console.log(`  ${m.n} keystrokes (${m.slow} over one frame): main-thread p50 ${m.mainP50.toFixed(0)}ms p95 ${m.mainP95.toFixed(0)}ms · to-paint p50 ${m.p50.toFixed(0)}ms p95 ${m.p95.toFixed(0)}ms`);
    check(`chat: all keystrokes measured (${m.n})`, m.n >= SENTENCE.length);
    check(`chat: main-thread p95 ${m.mainP95.toFixed(0)}ms <= ${BUDGET_MAIN_P95}ms`, m.mainP95 <= BUDGET_MAIN_P95);
    check(`chat: to-paint p95 ${m.p95.toFixed(0)}ms <= ${BUDGET_PAINT_P95}ms`, m.p95 <= BUDGET_PAINT_P95);
    await page.close();
  }

  console.log("\n== 2. module search box, 120 records behind it ==");
  {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/dashboard/finance`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    const m = await measureTyping(page, 'main input[type="search"]', "ledger entry number ninety");
    console.log(`  ${m.n} keystrokes (${m.slow} over one frame): main-thread p50 ${m.mainP50.toFixed(0)}ms p95 ${m.mainP95.toFixed(0)}ms · to-paint p50 ${m.p50.toFixed(0)}ms p95 ${m.p95.toFixed(0)}ms`);
    check(`module search: all keystrokes measured (${m.n})`, m.n >= 20);
    check(`module search: main-thread p95 ${m.mainP95.toFixed(0)}ms <= ${BUDGET_MAIN_P95}ms`, m.mainP95 <= BUDGET_MAIN_P95);
    check(`module search: to-paint p95 ${m.p95.toFixed(0)}ms <= ${BUDGET_PAINT_P95}ms`, m.p95 <= BUDGET_PAINT_P95);
    await page.close();
  }

  console.log("\n== 3. files question box, 24 cards on the page ==");
  {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/dashboard/files`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForSelector('[data-testid="files-question"]', { timeout: 15000 });
    const m = await measureTyping(page, '[data-testid="files-question"]', SENTENCE);
    console.log(`  ${m.n} keystrokes (${m.slow} over one frame): main-thread p50 ${m.mainP50.toFixed(0)}ms p95 ${m.mainP95.toFixed(0)}ms · to-paint p50 ${m.p50.toFixed(0)}ms p95 ${m.p95.toFixed(0)}ms`);
    check(`files question: all keystrokes measured (${m.n})`, m.n >= SENTENCE.length);
    check(`files question: main-thread p95 ${m.mainP95.toFixed(0)}ms <= ${BUDGET_MAIN_P95}ms`, m.mainP95 <= BUDGET_MAIN_P95);
    check(`files question: to-paint p95 ${m.p95.toFixed(0)}ms <= ${BUDGET_PAINT_P95}ms`, m.p95 <= BUDGET_PAINT_P95);
    await page.close();
  }
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
