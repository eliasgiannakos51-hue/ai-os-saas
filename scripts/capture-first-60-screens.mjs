// Screenshot capture for the First-60-Seconds report. Reuses the .next
// build produced by e2e-flows.prodtest.mjs (baked against the stand-in
// on 54329) and walks every step of the flow at desktop and 375px.
// Run AFTER a prodtest build (the .next must be baked against the
// stand-in on 54329): SHOT_DIR=/tmp/shots node scripts/capture-first-60-screens.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const OUT = process.env.SHOT_DIR ?? "/tmp/shots";
mkdirSync(OUT, { recursive: true });

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated", role: "authenticated", email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {}, identities: [],
};
const TABLE_ROWS = { user_credits: [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }] };
const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const json = (code, data) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname === "/auth/v1/user") return json(200, USER);
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: USER, session: null });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows = TABLE_ROWS[table] ?? [];
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      if (/count=/.test(req.headers.prefer ?? "")) {
        res.writeHead(200, { "Content-Type": "application/json", "Content-Range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" });
        return res.end(JSON.stringify(rows));
      }
      return json(200, rows);
    }
    json(200, {});
  });
});
const SUPA_PORT = 54329;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: "127", role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: "127", role: "service_role", iat: 1, exp: 2000000000 });
const session = {
  access_token: jwt({ sub: USER.id, aud: "authenticated", role: "authenticated", email: USER.email, iat: nowSec, exp: nowSec + 3600 }),
  token_type: "bearer", expires_in: 3600, expires_at: nowSec + 3600, refresh_token: "r", user: USER,
};

const PORT = 3888;
const env = { ...process.env, NODE_ENV: "production", PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}` };
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/login`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
const page = await ctx.newPage();

async function shot(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log("shot", name, page.url());
}

// 1. Fresh account -> overview bounces to the action question.
await page.goto(`http://127.0.0.1:${PORT}/dashboard/overview`, { waitUntil: "networkidle" });
await shot("01-action-question-desktop");
await page.setViewportSize({ width: 375, height: 800 });
await shot("02-action-question-375");
await page.setViewportSize({ width: 1280, height: 900 });

// 2. Chat door.
await page.getByRole("button", { name: "Just ask something" }).click();
await page.waitForURL("**/dashboard/chat", { timeout: 20000 });
await shot("03-chat-door-input-ready");

// 3. Website door with the pre-filled brief.
TABLE_ROWS.user_onboarding = [];
await page.goto(`http://127.0.0.1:${PORT}/onboarding`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Build a website" }).click();
await page.waitForURL("**/dashboard/website-builder?example=1", { timeout: 20000 });
await shot("04-website-door-prefilled");

// 4. Mission door.
TABLE_ROWS.user_onboarding = [];
await page.goto(`http://127.0.0.1:${PORT}/onboarding`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Set a goal" }).click();
await page.waitForURL("**/dashboard/mission", { timeout: 20000 });
await shot("05-mission-door-goal-focused");

// 5. Data door -> goal step (with privacy notice), then source step resume.
TABLE_ROWS.user_onboarding = [];
await page.goto(`http://127.0.0.1:${PORT}/onboarding`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Organise my data" }).click();
await shot("06-data-door-goal-step");
TABLE_ROWS.user_onboarding = [{ user_id: USER.id, goal: "trading", first_action: "data", completed_at: null, skipped_at: null }];
await page.goto(`http://127.0.0.1:${PORT}/onboarding`, { waitUntil: "networkidle" });
await shot("07-refresh-resumes-source-step");
await page.setViewportSize({ width: 375, height: 800 });
await shot("08-source-step-375");
await page.setViewportSize({ width: 1280, height: 900 });

// 6. Completed -> direct /onboarding bounces to the dashboard.
TABLE_ROWS.user_onboarding = [{ user_id: USER.id, goal: null, first_action: "chat", completed_at: "2026-08-07T10:00:00Z", skipped_at: null }];
await page.goto(`http://127.0.0.1:${PORT}/onboarding`, { waitUntil: "networkidle" });
await shot("09-completed-direct-url-bounces");

// 7. The on-demand tour.
await page.goto(`http://127.0.0.1:${PORT}/dashboard/tour`, { waitUntil: "networkidle" });
await shot("10-tour-desktop");
await page.setViewportSize({ width: 375, height: 800 });
await shot("11-tour-375");

// 8. Greek locale: the action question in Greek.
await ctx.addCookies([{ name: "NEXT_LOCALE", value: "el", domain: "127.0.0.1", path: "/" }]);
TABLE_ROWS.user_onboarding = [];
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`http://127.0.0.1:${PORT}/onboarding`, { waitUntil: "networkidle" });
await shot("12-action-question-greek");

await browser.close();
server.kill("SIGKILL");
supa.close();
console.log("done");
process.exit(0);
