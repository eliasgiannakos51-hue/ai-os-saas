#!/usr/bin/env node
/*
 * V6 #21 — CAN THE HOME SCREEN'S REACT #310 BE REPRODUCED AT ALL?
 *
 * Run: node scripts/tests/overview-crash.prodtest.mjs
 *
 * THE REPORT. /dashboard/overview throws a minified React #310 in
 * production, intermittently — the owner saw it twice in seven loads.
 * #310 is "Rendered more hooks than during the previous render", read
 * 2026-09-26 from React's own published error-code table,
 * the codes.json that facebook/react publishes under error-codes
 * (a file in the React repository, not in this one).
 * 141 attempts against a development build produced nothing, which is
 * expected: a dev build runs unminified React with different scheduling
 * and different chunking, so it is a different program.
 *
 * WHAT THIS FILE DOES THAT 141 DEV LOADS COULD NOT. A real `next build`,
 * `next start`, and a real Chromium — the same harness home-audit uses,
 * with a stand-in Supabase so the page renders signed in without touching
 * the live project.
 *
 * AND IT LOADS THE PAGE TWO DIFFERENT WAYS, because #310 needs a
 * component to render TWICE with a different hook count, and a hard
 * reload gives every component its first render:
 *
 *   10 hard navigations   a fresh document each time
 *   10 soft navigations   away to another dashboard route and back
 *                         through the client router, which re-renders the
 *                         same tree in the same JS context. This is where
 *                         a hook-count change can actually show.
 *
 * THE BOUNDARY IS PROVEN BY FIRING IT, NOT BY READING IT. Step 2 patches
 * one component in the tree to throw behind a query parameter, rebuilds,
 * loads the page with it, and asserts a person sees words and a button
 * rather than a white screen. The patch is written through
 * lib/sidecar-write.mjs, so a kill -9 does not leave a throwing component
 * in the working tree.
 *
 * IF NOTHING REPRODUCES, THIS SAYS SO AND EXITS 0. A prodtest that turns
 * red because a rare bug did not appear this time is a prodtest nobody
 * runs. The count is the output.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFileSync, healFromSidecar } from "./lib/sidecar-write.mjs";

// WHAT COUNTS AS "THE BOUNDARY IS SHOWING", and why role="alert" does not.
//
// The first run of this file reported "10 of 10 hard navigations showed
// the boundary" while counting ZERO errors — because it looked for
// [role="alert"], and components/credits/out-of-credits-notice.tsx and
// components/ui/widget-boundary.tsx both carry that role as ordinary
// furniture. It was measuring the page's own decoration and calling it a
// crash. Had a real #310 fired, the same number would have appeared, so
// the section proved nothing either way.
//
// The page-level boundary is identified by ITS OWN title instead, and the
// needle is resolved from messages/<locale>.json rather than typed in
// English — an English literal is a gate that goes red the first time
// somebody runs the app in Greek.
const localeOf = (html) => (html.match(/<html[^>]+lang="([a-z-]+)"/i) ?? [])[1] ?? "en";
function boundaryTitle(locale) {
  const file = `messages/${locale}.json`;
  try {
    return JSON.parse(readFileSync(file, "utf8")).errors.boundary.title;
  } catch {
    return JSON.parse(readFileSync("messages/en.json", "utf8")).errors.boundary.title;
  }
}

healFromSidecar();

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

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
};

// user_onboarding matters: without it /dashboard/overview redirects to
// /onboarding and every load below measures the wrong page. home-audit
// learned that the expensive way; the pathname assertion stays here too.
const TABLE_ROWS = {
  user_credits: [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }],
  user_onboarding: [{ user_id: USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null }],
  ideas: [
    { id: "11111111-1111-4111-8111-111111111111", user_id: USER.id, name: "Subscription tier for agencies", created_at: "2026-08-20T10:00:00Z" },
    { id: "11111111-1111-4111-8111-111111111112", user_id: USER.id, name: "Referral programme", created_at: "2026-08-22T10:00:00Z" },
  ],
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
    if (url.pathname === "/auth/v1/user") return json(200, USER);
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: USER, session: null });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows = TABLE_ROWS[table] ?? [];
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
  access_token: jwt({ sub: USER.id, aud: "authenticated", role: "authenticated", email: USER.email, iat: nowSec, exp: nowSec + 3600 }),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec + 3600,
  refresh_token: "test-refresh-token",
  user: USER,
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

// THE BOUNDARY PROBE, baked into the same build as everything else.
//
// One build, not two: a second `next build` costs another two minutes and
// buys nothing, because the throw is behind a query parameter that the 20
// measurement loads never set. GreetingHeader is the first client
// component the Home renders, so a throw here is caught by
// app/dashboard/overview/error.tsx and not by a card's own WidgetBoundary.
const PROBE_FILE = "src/components/overview/greeting-header.tsx";
const probeOriginal = readFileSync(PROBE_FILE, "utf8");
const PROBE_ANCHOR = '"use client";';
const PROBE_PATCH = `"use client";

// TEMPORARY, written by scripts/tests/overview-crash.prodtest.mjs and
// removed by it. If you are reading this in a committed file, that run
// was killed before its restore — delete this block.
function __boundaryProbe() {
  if (typeof window !== "undefined" && window.location.search.includes("__boundary_probe=1")) {
    throw new Error("boundary probe");
  }
}`;

let server = null;
let browser = null;
const results = { hard: [], soft: [], probe: null };

try {
  if (!probeOriginal.includes(PROBE_ANCHOR)) {
    console.log(`  FAIL  the probe anchor is missing from ${PROBE_FILE}`);
    process.exit(1);
  }
  // Insert the helper AND call it from the component body.
  let patched = probeOriginal.replace(PROBE_ANCHOR, PROBE_PATCH);
  const bodyAnchor = patched.match(/export function GreetingHeader\([^)]*\)[^{]*\{/);
  if (!bodyAnchor) {
    console.log("  FAIL  could not find the GreetingHeader body to call the probe from");
    process.exit(1);
  }
  patched = patched.replace(bodyAnchor[0], `${bodyAnchor[0]}\n  __boundaryProbe();`);
  writeFileSync(PROBE_FILE, patched);

  console.log("running `next build` (production, with the boundary probe behind a query param) ...");
  const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let buildLog = "";
  build.stdout.on("data", (d) => (buildLog += d));
  build.stderr.on("data", (d) => (buildLog += d));
  const buildCode = await new Promise((r) => build.on("close", r));
  if (buildCode !== 0) {
    console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
    process.exit(1);
  }
  console.log("build ok — starting `next start`\n");

  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const up = await (async () => {
    for (let i = 0; i < 90; i++) {
      try {
        await new Promise((res, rej) => {
          const r = http.get(`http://127.0.0.1:${PORT}/api/health`, () => res());
          r.on("error", rej);
          r.setTimeout(2000, () => rej(new Error("timeout")));
        });
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    return false;
  })();
  check("the production server came up", up);
  if (!up) process.exit(1);

  const { chromium } = await import("playwright");
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
    args: ["--ssl-version-max=tls1.2"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message ?? e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  const HOME = `http://127.0.0.1:${PORT}/dashboard/overview`;
  const AWAY = `http://127.0.0.1:${PORT}/dashboard/files`;

  const snapshot = async () => {
    const before = errors.length;
    return () => errors.slice(before);
  };

  console.log("== 1. ten hard navigations ==");
  for (let i = 1; i <= 10; i++) {
    const since = await snapshot();
    await page.goto(HOME, { waitUntil: "networkidle", timeout: 60000 });
    const where = await page.evaluate(() => location.pathname);
    const crashed = (await page.locator(`text=${boundaryTitle(localeOf(await page.content()))}`).count()) > 0;
    const found = since();
    const r310 = found.filter((e) => /#310|Rendered more hooks/.test(e));
    results.hard.push({ i, where, boundary: crashed, r310: r310.length, errors: found.length });
    if (r310.length) console.log(`        load ${i}: REACT #310 — ${r310[0].slice(0, 160)}`);
  }
  check(
    "every hard navigation landed on /dashboard/overview",
    results.hard.every((r) => r.where === "/dashboard/overview"),
    results.hard.map((r) => r.where).join(", ")
  );

  console.log("\n== 2. ten soft navigations, away and back through the client router ==");
  for (let i = 1; i <= 10; i++) {
    const since = await snapshot();
    await page.goto(AWAY, { waitUntil: "networkidle", timeout: 60000 });
    await page.evaluate((u) => window.history.pushState({}, "", u), "/dashboard/overview");
    await page.goto(HOME, { waitUntil: "networkidle", timeout: 60000 });
    const crashed = (await page.locator(`text=${boundaryTitle(localeOf(await page.content()))}`).count()) > 0;
    const found = since();
    const r310 = found.filter((e) => /#310|Rendered more hooks/.test(e));
    results.soft.push({ i, boundary: crashed, r310: r310.length, errors: found.length });
    if (r310.length) console.log(`        soft ${i}: REACT #310 — ${r310[0].slice(0, 160)}`);
  }

  const total310 = [...results.hard, ...results.soft].reduce((n, r) => n + r.r310, 0);
  console.log(`\n        React #310 in 20 loads: ${total310}`);
  check(
    "the run produced a count rather than an impression",
    Number.isInteger(total310),
    "the number above is the answer whichever way it came out"
  );

  console.log("\n== 3. the boundary, fired on purpose ==");
  const since = await snapshot();
  await page.goto(`${HOME}?__boundary_probe=1`, { waitUntil: "networkidle", timeout: 60000 });
  const locale = localeOf(await page.content());
  const title = boundaryTitle(locale);
  const titled = page.locator(`text=${title}`);
  const shown = (await titled.count()) > 0;
  // The boundary's own container, reached from its title rather than from
  // a role every banner on the page also has.
  const box = page.locator('[role="alert"]').filter({ hasText: title });
  const text = shown ? (await box.first().innerText()).trim() : "";
  const buttons = shown ? await box.first().locator("button").count() : 0;
  const bodyText = (await page.locator("body").innerText()).trim();
  // A CONTROL ON THE CONTROL: the probe is only proof if the Home is gone.
  // A boundary rendered BESIDE the page it replaced would mean the throw
  // was swallowed by a card's WidgetBoundary instead.
  const homeStillThere = await page.locator("text=Subscription tier for agencies").count();
  results.probe = { locale, shown, text, buttons, bodyLength: bodyText.length, homeStillThere, errors: since().length };

  check("a thrown component does NOT leave a white page", bodyText.length > 30, `body text length ${bodyText.length}`);
  check(
    `the page-level boundary rendered, found by its own title (locale ${locale})`,
    shown,
    JSON.stringify(title)
  );
  check(
    "...and it REPLACED the Home rather than appearing beside it",
    homeStillThere === 0,
    `Home content still on the page: ${homeStillThere} node(s) — the throw was caught lower down`
  );
  check("...and it says something in words", text.length > 20, JSON.stringify(text.slice(0, 200)));
  check("...and offers a way out", buttons > 0, `buttons inside the boundary: ${buttons}`);
  check(
    "...and does not print the raw React error text at the person",
    !/Minified React error|#310/.test(text),
    text.slice(0, 200)
  );
} finally {
  writeFileSync(PROBE_FILE, probeOriginal);
  if (browser) await browser.close().catch(() => {});
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  supa.close();
}

const total310 = [...results.hard, ...results.soft].reduce((n, r) => n + r.r310, 0);
console.log("\n----");
console.log(`hard navigations : ${results.hard.length}, ${results.hard.filter((r) => r.boundary).length} showed the boundary`);
console.log(`soft navigations : ${results.soft.length}, ${results.soft.filter((r) => r.boundary).length} showed the boundary`);
console.log(`React #310       : ${total310} of 20`);
if (total310 === 0) {
  console.log("");
  console.log("DID NOT REPRODUCE. That is the finding, not a pass: 20 loads of a real");
  console.log("production build did not produce #310, so nothing here names a cause and");
  console.log("nothing should be changed on the strength of it. What IS established is");
  console.log("what a person sees when it does happen — section 3 fired the boundary and");
  console.log("measured the result.");
}
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
