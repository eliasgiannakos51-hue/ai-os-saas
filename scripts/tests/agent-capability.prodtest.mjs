// The capability gate, in a real production build, in a real browser.
//
// scripts/tests/agent-capability.test.mjs proves the logic and the
// wiring. It cannot prove the two things the reported incident was
// actually about:
//
//   1. that the user SEES what an agent can and cannot do, before they
//      describe one — the reported user had no way to know that "runs
//      tests and fixes errors" was outside the product;
//   2. that an impossible request reaches NO reservation and NO job —
//      i.e. that "you were not charged" is a fact about the server and
//      not a sentence on a panel.
//
// (2) is asserted against the stub Supabase's own request log: if the
// route reserved credits or inserted a job row, the stub saw it. That is
// the difference between testing the message and testing the money.
//
// The stub stands in for the DATABASE only. Every route handler, every
// component, the real i18n bundle and the real production build run as
// themselves — same harness as scripts/tests/agents-ui.prodtest.mjs.
//
// Run: node scripts/tests/agent-capability.prodtest.mjs
import http from "node:http";
import { label, labelPattern } from "./lib/label.mjs";
import { spawn } from "node:child_process";

let pass = 0,
  fail = 0;
function checkTrue(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
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
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { subscription_tier: "growth", stripe_customer_id: "cus_test" },
  identities: [],
});

// THE LEDGER. Every write the route could make, recorded so the test can
// assert on absence — the only way to prove "nothing was charged".
const seen = { reserveCredits: 0, jobInserts: 0, rateLimitWrites: 0 };

const JOB_ID = "55555555-5555-4555-8555-555555555555";

// The inserted job is served back as `running`, which is what a real
// worker would leave behind. Without it the client's first poll of
// /api/jobs/<id> 404s — a hole in the stub, not in the app, and one that
// would otherwise be indistinguishable from a real broken request in the
// console-error assertion at the end.
const TABLE_ROWS = {
  user_credits: [{ user_id: USER_ID, credits_remaining: 2500, credits_total: 3000 }],
  user_agents: [],
  agent_runs: [],
  ai_jobs: [],
};
const RUNNING_JOB = {
  id: JOB_ID,
  user_id: USER_ID,
  kind: "agent_build",
  status: "running",
  running: true,
  step: 1,
  step_total: 4,
  step_label: "understanding",
  result: null,
  error: null,
  credits_charged: 0,
  attempts: 1,
  created_at: new Date(nowMs()).toISOString(),
  updated_at: new Date(nowMs()).toISOString(),
};
function nowMs() {
  return Date.now();
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
    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/admin/users/")) return json(200, { user: user() });
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);
      if (fn === "reserve_credits") {
        seen.reserveCredits++;
        return json(200, [{ reservation_id: "44444444-4444-4444-8444-444444444444", available: 2500 }]);
      }
      return json(200, null);
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      // PostgREST returns a bare object, not an array, when the client
      // asked for one — which `.select("id").single()` does. Answering
      // with an array made startJob report "job row was not created" and
      // the route 500, which is a property of this stub, not of the app.
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (req.method === "POST") {
        if (table.startsWith("ai_jobs")) {
          seen.jobInserts++;
          TABLE_ROWS.ai_jobs = [RUNNING_JOB];
          const row = { id: JOB_ID };
          return json(201, single ? row : [row]);
        }
        if (table.startsWith("rate_limit")) seen.rateLimitWrites++;
        return json(201, single ? {} : []);
      }
      const rows = TABLE_ROWS[table.split("?")[0]] ?? [];
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows);
    }
    json(200, {});
  });
});

const SUPA_PORT = 54337;
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
  // A key must be PRESENT or the route 500s before it ever reaches the
  // capability gate. It is never used: every assertion below is about a
  // request that is refused before any Anthropic call, and the one
  // feasible case only has to reach the job insert.
  ANTHROPIC_API_KEY: "sk-ant-test-not-used",
};

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
  detached: true,
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
console.log(`production server up on :${PORT}`);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

function newContext(locale, viewport = { width: 1280, height: 900 }) {
  return browser.newContext({
    viewport,
    storageState: {
      cookies: [
        { ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" },
        { name: "NEXT_LOCALE", value: locale, domain: "127.0.0.1", path: "/" },
      ],
      origins: [],
    },
  });
}

const URL_AGENTS = `http://127.0.0.1:${PORT}/dashboard/agents`;

/** Opens the create panel and submits `text`, returning the page. */
async function openCreate(page) {
  // Each scenario starts from a clean slate. Left set, the previous
  // scenario's "running" job makes the page resume that build on mount
  // and the create panel is already open — correct app behaviour, and
  // state this test has no business inheriting.
  TABLE_ROWS.ai_jobs = [];
  await page.goto(URL_AGENTS, { waitUntil: "networkidle" });
  if (!(await page.locator("#agent-request").isVisible())) {
    // Both locales this test drives. Matched on the real translated
    // labels rather than a test id: a button the user cannot find by its
    // name is a button they cannot find.
    await page.getByRole("button", { name: labelPattern("dashboard.agents.newAgent") }).click();
  }
  await page.locator("#agent-request").waitFor({ state: "visible", timeout: 10000 });
}

async function submit(page, text) {
  await page.locator("#agent-request").fill(text);
  // The button is "Design your agent" while the box is empty and "Build new · N credits" once something is typed — one stable test id for both.
  await page.getByTestId("agent-design").click();
}

// Collected across every page this test opens, not just the first —
// otherwise the Greek and mobile scenarios could throw client errors that
// nothing looks at.
const errors = [];
function watch(page) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // The URL, not just "a resource failed" — a bare console line cannot be
  // acted on, and this test's job is to make a real failure findable.
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
}

try {
  // -------------------------------------------------------------------
  console.log("\n== 1. the user SEES what an agent can and cannot do, before describing one ==");
  // -------------------------------------------------------------------
  const ctxEn = await newContext("en");
  const page = await ctxEn.newPage();
  watch(page);
  await openCreate(page);

  const body = await page.locator("body").innerText();
  checkTrue("the CAN heading is on screen", /An agent can/i.test(body), body.slice(0, 400));
  checkTrue("the CANNOT heading is on screen", /An agent cannot/i.test(body));
  checkTrue(
    "…and it names code explicitly — the thing the reported user asked for",
    /Write or run code/i.test(body)
  );
  checkTrue("…system access", /Reach your computer/i.test(body));
  checkTrue("…other platforms", /Act on other platforms/i.test(body));
  checkTrue("…physical acts", /physical world/i.test(body));
  checkTrue("…money", /Move money/i.test(body));
  checkTrue("…phone calls", /Make phone calls/i.test(body));
  checkTrue(
    "no raw i18n key path leaked to the screen",
    !/dashboard\.agents\.capability/.test(body),
    body.match(/dashboard\.agents\.[\w.]+/)?.[0]
  );

  // -------------------------------------------------------------------
  console.log("\n== 2. the reported request is refused, and NOTHING is charged ==");
  // -------------------------------------------------------------------
  const before = { ...seen };
  await submit(page, "Θέλω agent που φτιάχνει MVP, τρέχει tests, διορθώνει errors");
  await page.getByText(/An agent can't do this one/i).waitFor({ state: "visible", timeout: 15000 });

  const refusalText = await page.locator("body").innerText();
  checkTrue("the refusal panel is shown", /An agent can't do this one/i.test(refusalText));
  checkTrue(
    "it names the category that blocked it",
    /Write or run code, build software/i.test(refusalText)
  );
  checkTrue("it quotes the words it matched", /Found in what you wrote/i.test(refusalText));
  checkTrue("it states that nothing was charged", /You have not been charged/i.test(refusalText));
  checkTrue("it suggests what to ask for instead", /Try asking for research/i.test(refusalText));

  // THE MONEY ASSERTION.
  checkTrue(
    "NO credits were reserved",
    seen.reserveCredits === before.reserveCredits,
    `reserve_credits called ${seen.reserveCredits - before.reserveCredits} time(s)`
  );
  checkTrue(
    "NO job row was created (so no AI call could have happened)",
    seen.jobInserts === before.jobInserts,
    `ai_jobs inserted ${seen.jobInserts - before.jobInserts} time(s)`
  );

  // -------------------------------------------------------------------
  console.log("\n== 3. a partial request gets a counter-offer, still free ==");
  // -------------------------------------------------------------------
  const beforePartial = { ...seen };
  // Labels come from the catalogue, not from memory: this said "Rewrite my request" while the button says "Rewrite your request".
  await page.getByRole("button", { name: labelPattern("dashboard.agents.capability.rephrase") }).click();
  await submit(
    page,
    "Κάθε πρωί στείλε μου τα νέα για τη Nvidia και φτιάξε μου ένα script που τα αποθηκεύει"
  );
  await page.getByText(/Part of this can't be done/i).waitFor({ state: "visible", timeout: 15000 });

  const partialText = await page.locator("body").innerText();
  checkTrue("the partial panel is shown", /Part of this can't be done/i.test(partialText));
  checkTrue(
    "it says what the agent WOULD do instead",
    /The agent would do this instead/i.test(partialText)
  );
  checkTrue("and quotes the doable part", /nvidia/i.test(partialText));
  checkTrue("it says nothing has been charged yet", /Nothing has been charged yet/i.test(partialText));
  checkTrue(
    "there is a button to build the part that works",
    (await page.getByRole("button", { name: labelPattern("dashboard.agents.capability.partialContinue") }).count()) === 1
  );
  checkTrue(
    "…and still nothing reserved while the question is on screen",
    seen.reserveCredits === beforePartial.reserveCredits && seen.jobInserts === beforePartial.jobInserts
  );

  // -------------------------------------------------------------------
  console.log("\n== 4. accepting the counter-offer DOES proceed ==");
  // -------------------------------------------------------------------
  const beforeAccept = { ...seen };
  await page.getByRole("button", { name: labelPattern("dashboard.agents.capability.partialContinue") }).click();
  // The job insert is the observable: the route got past the gate.
  for (let i = 0; i < 40 && seen.jobInserts === beforeAccept.jobInserts; i++) {
    await page.waitForTimeout(250);
  }
  checkTrue(
    "acknowledging the limits lets the build start",
    seen.jobInserts > beforeAccept.jobInserts,
    "the gate must be passable, or a partial request is just a slower refusal"
  );

  // Closed before the next scenario resets the stub's job table: this
  // page is still polling /api/jobs/<id> for the build it just started,
  // and a poll for a row the stub has forgotten 404s. That is the
  // harness contradicting itself, and it would land in `errors` looking
  // exactly like a real broken request.
  await ctxEn.close();

  // -------------------------------------------------------------------
  console.log("\n== 5. a feasible request is NOT blocked ==");
  // -------------------------------------------------------------------
  const ctxEn2 = await newContext("en");
  const page2 = await ctxEn2.newPage();
  watch(page2);
  await openCreate(page2);
  const beforeGood = { ...seen };
  await submit(page2, "Every Monday summarise the latest AI research papers and email me a report");
  for (let i = 0; i < 40 && seen.jobInserts === beforeGood.jobInserts; i++) {
    await page2.waitForTimeout(250);
  }
  checkTrue(
    "a legitimate agent still reaches the builder",
    seen.jobInserts > beforeGood.jobInserts,
    "over-blocking is the failure mode with no later layer to catch it"
  );
  const goodText = await page2.locator("body").innerText();
  checkTrue("…and no refusal panel appeared", !/An agent can't do this one/i.test(goodText));
  await ctxEn2.close();

  // -------------------------------------------------------------------
  console.log("\n== 6. the same screen in Greek ==");
  // -------------------------------------------------------------------
  const ctxEl = await newContext("el");
  const pageEl = await ctxEl.newPage();
  watch(pageEl);
  await openCreate(pageEl);
  const elBody = await pageEl.locator("body").innerText();
  checkTrue("the CAN list is in Greek", /Ένας agent μπορεί/.test(elBody), elBody.slice(0, 300));
  checkTrue("the CANNOT list is in Greek", /Ένας agent δεν μπορεί/.test(elBody));
  checkTrue("…naming code in Greek", /Να γράφει ή να εκτελεί κώδικα/.test(elBody));
  checkTrue("no English leaked into the Greek lists", !/An agent cannot/.test(elBody));

  await submit(pageEl, "Θέλω agent που φτιάχνει MVP, τρέχει tests, διορθώνει errors");
  await pageEl
    .getByText(/Αυτό δεν μπορεί να το κάνει ένας agent/)
    .waitFor({ state: "visible", timeout: 15000 });
  const elRefusal = await pageEl.locator("body").innerText();
  checkTrue("the refusal is in Greek", /Αυτό δεν μπορεί να το κάνει ένας agent/.test(elRefusal));
  checkTrue("…including the no-charge line", /Δεν χρεώθηκες/.test(elRefusal));
  checkTrue(
    "no raw key path in Greek either",
    !/dashboard\.agents\.capability/.test(elRefusal)
  );
  await ctxEl.close();

  // -------------------------------------------------------------------
  console.log("\n== 7. mobile, 375px ==");
  // -------------------------------------------------------------------
  const ctxMobile = await newContext("en", { width: 375, height: 812 });
  const pageM = await ctxMobile.newPage();
  watch(pageM);
  await openCreate(pageM);
  const mobileBody = await pageM.locator("body").innerText();
  checkTrue("the CAN list renders at 375px", /An agent can/i.test(mobileBody));
  checkTrue("the CANNOT list renders at 375px", /An agent cannot/i.test(mobileBody));
  const overflow = await pageM.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  checkTrue(`no horizontal overflow at 375px (${overflow}px)`, overflow <= 1, `${overflow}px`);
  await ctxMobile.close();

  // -------------------------------------------------------------------
  checkTrue(
    "no uncaught client errors across the whole flow",
    errors.length === 0,
    errors.slice(0, 3).join(" | ")
  );
} catch (err) {
  fail++;
  console.log(`  FAIL  the flow threw: ${err instanceof Error ? err.message : String(err)}`);
  console.log(serverLog.slice(-1500));
} finally {
  await browser.close();
  cleanup();
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
