// The worked example on EVERY empty screen, pressed, in a real browser.
//
// WHAT WAS REPORTED — TWICE. "The example shows in quotes but is NOT a
// button. It cannot be pressed." The 201 source-level checks all passed
// while the user saw plain text, because none of them ever OPENED an
// empty module and pressed the thing. This file is that press.
//
// For each surface that owns a create form, with an empty account:
//   1. the example renders as a <button> (not a <p> — the exact
//      regression reported),
//   2. clicking it puts the example text into a real form field on the
//      page (or, for Documents, creates the document outright).
//
// The expected text is read from the button itself, so the test needs no
// copy of the i18n catalogue and a reworded example cannot break it.
//
// MUTATION: remove `onExample` from any surface -> its example renders
// as <p> -> the tagName assertion here goes red. That is the exact
// mutation this file exists to catch.
//
// Run: node scripts/tests/empty-state-click.prodtest.mjs
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

// The 12 generic modules, read from the registry SOURCE so a new module
// joins this test by existing rather than by someone remembering to add
// it here.
const moduleSource = readFileSync("src/lib/modules.ts", "utf8");
const MODULE_SLUGS = [...moduleSource.matchAll(/^\s+slug: "([a-z-]+)",$/gm)].map((m) => m[1]);
if (MODULE_SLUGS.length < 10) {
  console.log(`  FAIL  could not parse module slugs from src/lib/modules.ts (got ${MODULE_SLUGS.length})`);
  process.exit(1);
}

// Every surface with a create form. kind "fill": the press writes the
// example into a field. kind "create": Documents creates the document
// directly, so the assertion is the INSERT, not a field.
const SURFACES = [
  { path: "/dashboard", label: "ideas (dashboard home)", kind: "fill" },
  ...MODULE_SLUGS.map((slug) => ({ path: `/dashboard/${slug}`, label: `module: ${slug}`, kind: "fill" })),
  { path: "/dashboard/agents", label: "agents", kind: "fill" },
  { path: "/dashboard/mission", label: "mission", kind: "fill" },
  { path: "/dashboard/deep-research", label: "deep research", kind: "fill" },
  { path: "/dashboard/website-builder", label: "website builder", kind: "fill" },
  { path: "/dashboard/documents", label: "documents", kind: "create" },
];

const USER_ID = "00000000-0000-4000-8000-000000000001";
const user = () => ({
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  // Growth: the lowest tier that can reach every surface here (agents and
  // deep research are plan-gated; an upgrade wall has no example button).
  user_metadata: { subscription_tier: "growth", stripe_customer_id: "cus_test" },
  identities: [],
});

// Stateful ONLY for documents: the create press inserts a row and opens
// the editor on it, and both calls have to see the same row.
const documents = [];
const inserts = [];

const TABLE_ROWS = () => ({
  user_credits: [{ user_id: USER_ID, credits_remaining: 500, credits_total: 500 }],
  user_documents: documents,
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
          /* e.g. rate_limit_log fire-and-forget */
        }
        row.id = row.id ?? `eeeeeeee-5555-4555-8555-${String(inserts.length + 1).padStart(12, "0")}`;
        row.created_at = row.created_at ?? new Date().toISOString();
        row.updated_at = row.updated_at ?? row.created_at;
        inserts.push({ table, row });
        if (table === "user_documents") documents.unshift(row);
        const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
        return json(201, single ? row : [row]);
      }
      const rows = TABLE_ROWS()[table] ?? [];
      if ((req.headers.prefer ?? "").includes("count=")) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : `*/0`,
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

const SUPA_PORT = 54343;
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

try {
  for (const surface of SURFACES) {
    console.log(`== ${surface.label} (${surface.path}) ==`);
    const page = await context.newPage();
    try {
      await page.goto(`http://127.0.0.1:${PORT}${surface.path}`, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      const example = page.locator('[data-testid="empty-example"]');
      const count = await example.count();
      check("the worked example is on the page", count === 1, `count=${count}`);
      if (count !== 1) {
        await page.close();
        continue;
      }
      const tag = await example.evaluate((el) => el.tagName);
      // THE reported bug: quotes, but not pressable.
      check(`it is a BUTTON, not text (got <${tag.toLowerCase()}>)`, tag === "BUTTON");
      // The button text is “example” in typographic quotes; strip them.
      const text = (await example.innerText()).trim().replace(/^[“"]/, "").replace(/[”"]$/, "");
      const insertsBefore = inserts.length;
      await example.click();

      if (surface.kind === "fill") {
        // The press must land the text in a real, visible form control.
        const landed = await page
          .waitForFunction(
            (expected) => {
              const fields = [
                ...document.querySelectorAll("input, textarea"),
              ];
              return fields.some((f) => f.value === expected && f.offsetParent !== null);
            },
            text,
            { timeout: 5000 }
          )
          .then(() => true)
          .catch(() => false);
        check(
          `clicking put "${text.slice(0, 40)}..." into a visible field`,
          landed,
          landed
            ? undefined
            : `field values: ${await page
                .locator("input, textarea")
                .evaluateAll((els) => els.map((e) => e.value).filter(Boolean).join(" | "))}`
        );
      } else {
        // Documents: the press CREATES the document with that title.
        await page.waitForTimeout(1500);
        const created = inserts
          .slice(insertsBefore)
          .find((i) => i.table === "user_documents" && i.row.title === text);
        check(
          `clicking created a document titled "${text.slice(0, 40)}..."`,
          Boolean(created),
          `inserts seen: ${JSON.stringify(inserts.slice(insertsBefore).map((i) => i.table))}`
        );
      }
    } catch (err) {
      failures.push(`${surface.label}: unhandled`);
      console.log(`  FAIL  unhandled on ${surface.label}\n        ${err.message}`);
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
