// A PUBLISHED PAGE, OPENED BY A SIGNED-IN IONEXA USER, IN A REAL BROWSER.
//
// Run: node scripts/tests/published-origin.prodtest.mjs
//      SKIP_BUILD=1 node scripts/tests/published-origin.prodtest.mjs
//
// THE HOLE, found 2026-10-02 (docs/v6-games-2026-10-02.md §3): published
// sites are served at {origin}/s/{subdomain} — the SAME origin as the
// signed-in app — and their CSP allows inline script. Script on that page
// could read the session cookie (@supabase/ssr's browser client keeps it
// in document.cookie, so it is not httpOnly), call any /api route as the
// visitor, and send what it found anywhere as an image URL. The only thing
// in the way was a sentence in the generator's prompt.
//
// THE FIX is the CSP `sandbox` directive on every published response
// (lib/publishing/public-serving.ts). Without allow-same-origin the page
// runs in an opaque origin of its own: no cookie, no storage, and a fetch
// to the app is a cross-site request that carries no credentials.
//
// WHY A BROWSER. Every claim above is about what a browser does with a
// header — whether 'self' still matches inside a sandbox, whether a
// cross-origin form POST still reaches its endpoint. A header check alone
// would pass with a policy that also breaks every contact form.
//
// What the page's own script reports, and what each must be:
//
//   origin        "null"        the page is not the app
//   cookie        not readable  the visitor's session stays theirs
//   api           not readable  /api/credits/balance does not answer it
//   form          200           the contact form still succeeds, and stores
//   image         loaded        img-src 'self' still matches in the sandbox
//
// It drives nothing — no click, no key — so one viewport is the measurement
// (scripts/tests/interaction-coverage.test.mjs makes the same distinction).
import { spawn } from "node:child_process";
import http from "node:http";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};

const SITE_ID = "44444444-4444-4444-8444-444444444444";
// The probe. Everything a hostile page would try, each result written
// into the title so the test reads it without injecting anything itself.
const PROBE = `<!doctype html><html><head><title>probe</title></head><body>
<h1>Acme Cafe</h1><img id="logo" src="/icon.svg" alt="">
<script>
(async () => {
  const r = { origin: String(self.origin) };
  try { r.cookie = document.cookie; } catch (e) { r.cookie = "THREW " + e.name; }
  try { localStorage.setItem("k", "v"); r.storage = "writable"; } catch (e) { r.storage = "THREW " + e.name; }
  try {
    const res = await fetch("/api/credits/balance", { credentials: "include" });
    r.api = res.status + " " + (await res.text()).slice(0, 80);
  } catch (e) { r.api = "THREW " + e.name; }
  try {
    const res = await fetch(new URL("/api/websites/${SITE_ID}/submit-form", location.href), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { name: "Probe" } }),
    });
    r.form = res.status;
  } catch (e) { r.form = "THREW " + e.name; }
  const img = document.getElementById("logo");
  r.image = img.complete && img.naturalWidth > 0 ? "loaded" : "not loaded";
  document.title = "PROBE " + JSON.stringify(r);
})();
</script></body></html>`;

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54347,
  tableRows: {
    published_sites: [
      { id: SITE_ID, user_id: MOCK_USER.id, html_content: PROBE, status: "live", is_active: true, updated_at: "2026-10-02T10:00:00Z", pages: null },
    ],
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 2500, credits_total: 2500 }],
    // The form endpoint looks the website up before it stores anything;
    // without this row it answers 404, which proves the request ARRIVED but
    // not that a lead was kept.
    user_websites: [{ id: SITE_ID, user_id: MOCK_USER.id, name: "Acme Cafe" }],
  },
});

const PORT = await new Promise((resolve) => {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const ORIGIN = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  NEXT_PUBLIC_SITE_URL: ORIGIN,
};

let server = null;
let browser = null;
const cleanup = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
};

try {
  if (!process.env.SKIP_BUILD) {
    console.log("running `next build` ...");
    const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + log.slice(-3000));
      cleanup();
      process.exit(1);
    }
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try {
      const r = await fetch(`${ORIGIN}/login`, { signal: AbortSignal.timeout(2000) });
      up = r.ok;
    } catch {}
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) {
    console.log("  FAIL  the server did not start");
    cleanup();
    process.exit(1);
  }

  // THE CONTROL: the session is real. Without it, "the page could not
  // read the balance" would be true of a visitor who was never signed in.
  const control = await fetch(`${ORIGIN}/api/credits/balance`, {
    headers: { Cookie: `${supa.authCookie.name}=${supa.authCookie.value}` },
  });
  console.log("== 0. the control ==");
  check("the session cookie signs a request in: /api/credits/balance answers it with 200", control.status === 200, `status ${control.status}`);

  const head = await fetch(`${ORIGIN}/s/acme`);
  const csp = head.headers.get("content-security-policy") ?? "";
  console.log("\n== 1. what the response says ==");
  check("the published page is served (200)", head.status === 200, `status ${head.status}`);
  const sandbox = (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("sandbox")) ?? "").split(/\s+/);
  check("its CSP carries a sandbox directive", sandbox[0] === "sandbox", csp);
  check("...WITHOUT allow-same-origin — the one token that would undo it", !sandbox.includes("allow-same-origin"), sandbox.join(" "));
  check("...with allow-scripts, so the page's own scroll-reveal and form handler still run", sandbox.includes("allow-scripts"));

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext();
  await ctx.addCookies([{ ...supa.authCookie, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/s/acme`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.title.startsWith("PROBE "), null, { timeout: 15_000 }).catch(() => {});
  const title = await page.title();
  let r = {};
  try { r = JSON.parse(title.slice("PROBE ".length)); } catch {}
  console.log(`\n        the page's script reported: ${title.slice(0, 400)}`);

  console.log("\n== 2. what the page's own script could reach ==");
  check("the probe ran at all — otherwise every check below is about nothing", typeof r.origin === "string", title);
  check("the page's origin is opaque (\"null\"), not the app's", r.origin === "null", r.origin);
  check(
    "the visitor's session cookie is not readable by the page",
    !String(r.cookie ?? "").includes(supa.authCookie.name),
    String(r.cookie).slice(0, 80),
  );
  check(
    "the page cannot read the app's API as the visitor",
    !/^200\b/.test(String(r.api ?? "")),
    String(r.api),
  );
  check("the page cannot write the app origin's storage", String(r.storage ?? "").startsWith("THREW"), String(r.storage));

  console.log("\n== 3. and what a published page needs still works ==");
  check(
    "the contact form's POST still succeeds from inside the sandbox (200, readable)",
    r.form === 200,
    String(r.form),
  );
  check(
    "...and the lead was stored: the endpoint wrote website_form_submissions",
    supa.hits.some((h) => h.startsWith("POST /rest/v1/website_form_submissions")),
    supa.hits.filter((h) => h.includes("website_form")).join(" | ") || "no write seen",
  );
  check("an image from the app's own origin still loads (img-src 'self' inside the sandbox)", r.image === "loaded", String(r.image));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
