// The chat scroll contract, in a real browser, against a real build.
//
// WHAT WAS REPORTED. "When I send a message the page goes down and DOES
// NOT LET ME scroll up to read the earlier ones. It throws me back down."
// The cause: an effect scrolled to the bottom on EVERY change of the
// streaming text — several times a second during a reply — so scrolling
// up was undone within milliseconds.
//
// The contract this file enforces (exactly the reported specification):
//   1. opening a conversation lands at its latest message;
//   2. a reply arriving while the reader is AT the bottom follows;
//   3. send → scroll up → send again → the view MUST NOT move back down;
//   4. instead a "new message" affordance appears;
//   5. pressing it returns to the bottom and the affordance goes away.
//
// The AI reply is a Playwright route interception producing the same
// NDJSON the real /api/chat streams (meta → delta* → done) — no model
// call, but the full client code path: streamingText updates, message
// append, credit receipt.
//
// MUTATION: make the follow unconditional again (call follow() without
// the at-bottom check, or scroll on every delta) -> step 3 goes red.
//
// Run: node scripts/tests/chat-scroll.prodtest.mjs
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

// Enough history that the thread genuinely overflows its container —
// a scroll contract cannot be tested in a view with no scrollbar.
const MESSAGES = Array.from({ length: 40 }, (_, i) => ({
  id: `dddddddd-2222-4222-8222-${String(i + 1).padStart(12, "0")}`,
  conversation_id: CONVO_ID,
  role: i % 2 === 0 ? "user" : "assistant",
  content: `Message ${i + 1}. ${"Some longer content so each bubble takes real vertical space. ".repeat(3)}`,
  created_at: new Date(Date.UTC(2026, 1, 1, 10, i)).toISOString(),
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

const SUPA_PORT = 54345;
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

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
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

// The reply, as the real route streams it: meta → deltas → done.
let replyCounter = 0;
await page.route("**/api/chat", async (route) => {
  replyCounter++;
  const lines = [
    JSON.stringify({ type: "meta", conversationId: CONVO_ID, isNewConversation: false }),
    ...Array.from({ length: 12 }, (_, i) =>
      JSON.stringify({ type: "delta", text: `chunk ${replyCounter}.${i} of a streamed reply. ` })
    ),
    JSON.stringify({ type: "done", credits: 1 }),
  ];
  await route.fulfill({
    status: 200,
    contentType: "application/x-ndjson",
    body: lines.join("\n") + "\n",
  });
});

const thread = () => page.locator('[data-testid="chat-thread"]');
async function scrollState() {
  return thread().evaluate((el) => ({
    top: el.scrollTop,
    height: el.scrollHeight,
    client: el.clientHeight,
    fromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
  }));
}

try {
  console.log("== 1. opening a conversation lands at the latest message ==");
  await page.goto(`http://127.0.0.1:${PORT}/dashboard/chat?c=${CONVO_ID}`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForSelector('[data-testid="chat-thread"]', { timeout: 15000 });
  // The 40 seeded messages load client-side; wait for the last one.
  await page.waitForSelector("text=Message 40.", { timeout: 15000 });
  await page.waitForTimeout(400);
  let s = await scrollState();
  check(`the thread overflows (${s.height}px in ${s.client}px)`, s.height > s.client * 2);
  check(`and starts at the bottom (${Math.round(s.fromBottom)}px from it)`, s.fromBottom < 120);

  console.log("\n== 2. a reply arriving while AT the bottom follows ==");
  await page.fill("textarea", "First question");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=chunk 1.11", { timeout: 15000 });
  await page.waitForTimeout(400);
  s = await scrollState();
  check(`the view followed the reply (${Math.round(s.fromBottom)}px from bottom)`, s.fromBottom < 120);

  console.log("\n== 3. scrolled up, a new reply MUST NOT drag the view down ==");
  await thread().evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  s = await scrollState();
  check(`the reader is at the top (${Math.round(s.top)}px)`, s.top < 40);
  await page.fill("textarea", "Second question, sent from the top");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=chunk 2.11", { timeout: 15000 });
  await page.waitForTimeout(600);
  s = await scrollState();
  // THE reported bug. If this is red, the reader was dragged down again.
  check(
    `the view stayed up (scrollTop ${Math.round(s.top)}px, ${Math.round(s.fromBottom)}px from bottom)`,
    s.fromBottom > 200
  );

  console.log("\n== 4. instead, a 'new message' affordance appears ==");
  const jump = page.locator('[data-testid="chat-jump-to-latest"]');
  check("the jump button is visible", await jump.isVisible());

  console.log("\n== 5. pressing it returns to the bottom ==");
  await jump.click();
  await page.waitForTimeout(700);
  s = await scrollState();
  check(`the view is at the bottom again (${Math.round(s.fromBottom)}px)`, s.fromBottom < 120);
  check("and the button is gone", !(await jump.isVisible()));
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
