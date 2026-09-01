// SIX CREATIONS, SIX CONFIRMATIONS, READ OFF A REAL SCREEN.
//
// V4.6 #11.3. create-destination.test.mjs proves the six branches each
// carry a destination key and that the key resolves in ten languages.
// It does not prove that a user ever sees the word — the label is built
// from three pieces (a namespace declared in one file, a split done in
// another, an ICU placeholder in a third), and every one of them can be
// right on its own while the rendered sentence still says "Open it".
//
// So this drives the actual page: type a description, press Continue,
// press Create, and READ THE LINK. Six times, once per type.
//
// WHAT IS REAL AND WHAT IS A STAND-IN. The React component, the hook, the
// routing, next-intl and the message catalogue are the shipped ones, in a
// production `next build`. Faked: the AI detection call (it would cost
// money and answer differently every run) and each type's creation
// endpoint (they charge credits and write). Everything the confirmation
// is made of is real; only what it is made ABOUT is fixture.
//
// The expected word is read from messages/en.json at the SIDEBAR's key,
// not from a list written here -- the claim under test is that the
// receipt uses the nav's word, so the nav's word is what it is compared
// against.
//
// Run: node scripts/tests/create-destination.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

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

const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const at = (path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), en);
const GENERIC = at("dashboard.createStudio.openCreated");
const MADE_IT_HERE = at("dashboard.createStudio.madeItHere");
if (typeof GENERIC !== "string" || typeof MADE_IT_HERE !== "string") {
  console.log("  FAIL  the two Create Studio labels are not in messages/en.json");
  process.exit(1);
}
// "Made it here → {where}" with the placeholder cut out, so the assertion
// below is about the WORD, not about the sentence around it.
const FRAME = MADE_IT_HERE.split("{where}")[0].trim();

const AGENT_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const WEBSITE_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const DOCUMENT_ID = "cccccccc-3333-4333-8333-333333333333";

// One case per type in CREATE_STUDIO_TYPES. `expectKey` is the sidebar
// key the confirmation must name; `href` is where the link must point.
const CASES = [
  {
    type: "website",
    label: "a website",
    expectKey: "sidebar.items.websiteBuilder",
    href: `/dashboard/website-builder?project=${WEBSITE_ID}`,
  },
  {
    type: "mission",
    label: "a plan",
    expectKey: "sidebar.items.missionControl",
    href: "/dashboard/mission",
  },
  {
    // The one type whose destination is only known at run time, and the
    // one the single real report was about.
    type: "moduleEntry",
    label: "an expense",
    expectKey: "sidebar.items.finance",
    href: "/dashboard/finance",
  },
  {
    type: "automation",
    label: "a weekly report",
    expectKey: "sidebar.items.automation",
    href: "/dashboard/automation",
  },
  {
    type: "document",
    label: "a note",
    expectKey: "sidebar.items.documents",
    href: `/dashboard/documents/${DOCUMENT_ID}`,
  },
  {
    type: "agent",
    label: "an agent",
    expectKey: "sidebar.items.agents",
    href: `/dashboard/agents?agent=${AGENT_ID}`,
  },
];

const missingLabel = CASES.filter((c) => typeof at(c.expectKey) !== "string");
if (missingLabel.length > 0) {
  console.log(`  FAIL  no English sidebar label for ${missingLabel.map((c) => c.expectKey).join(", ")}`);
  process.exit(1);
}

// --- Supabase stand-in -------------------------------------------------
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
const TABLE_ROWS = () => ({
  user_credits: [{ user_id: USER_ID, credits_remaining: 500, credits_total: 500 }],
  // Without this row /dashboard/* bounces to /onboarding and every case
  // below would "fail to find the link" on a page it never opened.
  user_onboarding: [{ user_id: USER_ID, completed_at: "2026-01-02T00:00:00Z", skipped_at: null }],
});

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const json = (code, data, extra = {}) => {
      res.writeHead(code, { "Content-Type": "application/json", ...extra });
      res.end(JSON.stringify(data));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
      });
      return res.end();
    }
    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      if (req.method === "POST") {
        let row = {};
        try {
          row = JSON.parse(body);
        } catch {
          /* fire-and-forget logging rows */
        }
        row.id = row.id ?? "eeeeeeee-5555-4555-8555-000000000001";
        const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
        return json(201, single ? row : [row]);
      }
      const rows = TABLE_ROWS()[table] ?? [];
      if ((req.headers.prefer ?? "").includes("count=")) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : "*/0",
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

// --- the API stand-ins, per type --------------------------------------
// Each returns the SUCCESS shape the branch reads. `moduleTitleKey` on
// the create job is the field the whole module-entry case turns on: the
// server sends it, and the confirmation must end up saying that word.
const JOB_RESULT = {
  "/api/mission/plan": { planned: true, mission: { goal: "Ship the thing" } },
  "/api/create": {
    matched: true,
    module: "finance",
    moduleTitleKey: "sidebar.items.finance",
    href: "/dashboard/finance",
    message: "Filed under Finance.",
  },
  "/api/agents/build": {
    built: true,
    draft: { name: "Weekly digest", description: "d", schedule: "weekly" },
  },
};

async function installRoutes(page, testCase) {
  let jobFor = null;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const ok = (data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });

    if (path === "/api/create-studio/detect") {
      return ok({
        ok: true,
        detection: {
          type: testCase.type,
          title: testCase.label,
          understanding: `You want ${testCase.label}.`,
          moduleSlug: testCase.type === "moduleEntry" ? "finance" : null,
          frequency: testCase.type === "automation" ? "weekly" : null,
        },
      });
    }
    // Job-backed creations: 202 with an id, then one poll that is done.
    if (JOB_RESULT[path] && req.method() === "POST") {
      jobFor = path;
      return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ ok: true, jobId: "job-1" }) });
    }
    if (path.startsWith("/api/jobs/")) {
      if (path.endsWith("/continue")) return ok({ ok: true });
      return ok({ ok: true, job: { status: "done", result: JOB_RESULT[jobFor] ?? {}, creditsCharged: 1 } });
    }
    if (path === "/api/websites/generate") {
      return ok({ ok: true, generated: true, duplicateSuppressed: true, record: { id: WEBSITE_ID, name: testCase.label, status: "generating" } });
    }
    if (path === "/api/websites/status") return ok({ ok: true, website: { id: WEBSITE_ID, status: "generating" } });
    if (path === "/api/automations/create") return ok({ ok: true, message: "Scheduled weekly." });
    if (path === "/api/agents" && req.method() === "POST") return ok({ ok: true, agent: { id: AGENT_ID } });
    if (path === "/api/documents" && req.method() === "POST") return ok({ ok: true, id: DOCUMENT_ID });
    if (path.startsWith("/api/documents/")) return ok({ ok: true });
    return ok({ ok: true });
  });
}

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  storageState: { cookies: [{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" }], origins: [] },
});

try {
  for (const testCase of CASES) {
    const where = at(testCase.expectKey);
    console.log(`\n== ${testCase.type} -> ${where} ==`);
    const page = await context.newPage();
    try {
      await installRoutes(page, testCase);
      await page.goto(`http://127.0.0.1:${PORT}/dashboard/create`, { waitUntil: "networkidle", timeout: 60000 });
      // ASSERT THE PAGE, not the intention to open it. A redirect to
      // /onboarding renders a form with a textarea too.
      const path = await page.evaluate(() => location.pathname);
      check("the create page opened", path === "/dashboard/create", path);
      if (path !== "/dashboard/create") {
        await page.close();
        continue;
      }

      await page.locator("textarea").first().fill(`Please make me ${testCase.label}`);
      await page.locator('form button[type="submit"]').first().click();
      // The restatement screen, then Create.
      const createButton = page.getByRole("button", { name: at("dashboard.createStudio.create"), exact: true });
      await createButton.waitFor({ state: "visible", timeout: 20000 });
      await createButton.click();

      // THE CONFIRMATION LINK, BY ITS OWN HANDLE.
      //
      // The first version of this file located it as
      // `a[href="${testCase.href}"]` and the mission case matched the
      // SIDEBAR's "Goals & Plans" link, which points at /dashboard/mission
      // too. Two of that case's three assertions passed while reading a
      // nav item -- a destination name found in the nav is exactly what
      // this test cannot use as evidence. Hence a testid, and hence the
      // count assertion below: an ambiguous match must fail loudly rather
      // than be resolved by .first().
      const link = page.locator('[data-testid="studio-destination-link"]');
      const appeared = await link
        .first()
        .waitFor({ state: "visible", timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      check(
        "the confirmation link appeared",
        appeared,
        appeared ? undefined : await page.locator("main").innerText().catch(() => "(no main)")
      );
      if (!appeared) {
        await page.close();
        continue;
      }
      const matches = await link.count();
      check("exactly one element carries the handle", matches === 1, `count=${matches}`);

      const href = await link.first().getAttribute("href");
      check(`it points at ${testCase.href}`, href === testCase.href, String(href));

      const text = (await link.first().innerText()).trim();
      // THE THREE THINGS THE USER COMPLAINED ABOUT, one assertion each.
      check(`it names the place ("${where}")`, text.includes(where), `link text: "${text}"`);
      check("it is not the generic label", text !== GENERIC, `link text: "${text}"`);
      check("the sentence around it is rendered, not the raw key", text.includes(FRAME) && !text.includes("madeItHere"), `link text: "${text}"`);
    } catch (err) {
      failures.push(`${testCase.type}: unhandled`);
      console.log(`  FAIL  unhandled on ${testCase.type}\n        ${err.message}`);
    }
    await page.close();
  }
} finally {
  await context.close();
  await browser.close();
  cleanup();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
