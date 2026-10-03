/*
 * DOES A SPOKEN SENTENCE REALLY WAIT FOR YES, IN THE BUILT APP?
 *
 * Run: node scripts/tests/voice-command.prodtest.mjs
 *      SKIP_BUILD=1 VOICE_SHOTS=/tmp/shots node scripts/tests/voice-command.prodtest.mjs
 *
 * voice-command.test.mjs holds the rule in the source: the state machine,
 * and the handler read with its comments stripped. That is not the
 * question a person has. This asks the RUNNING page, built for
 * production, with Chromium's fake microphone recording a real clip
 * through the real VoiceInput:
 *
 *   1. "φτιάξε μου ένα σάιτ για την καφετέρια μου" becomes a card that
 *      says what it heard and that this goes to the Website Builder - and
 *      until Yes, the address does not change and /api/create is not
 *      called. Yes opens the builder with the sentence carried.
 *   2. "πρόσθεσε έξοδο 50 ευρώ για καύσιμα" - a WRITE, by voice - becomes
 *      the card that names the cost of Yes, and nothing reaches
 *      /api/create while it waits. "Fix the text" leaves the words in the
 *      box and still sends nothing. Yes sends exactly once.
 *   3. Typed text is unchanged: Send on a sentence that names no tool goes
 *      to /api/create at once, because Send is the person's decision.
 *
 * Only the transcription provider is faked (the network call to OpenAI),
 * and /api/create answers from a stub so no model is called. Everything
 * between the microphone and the request is the shipped code.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with Input.dispatchTouchEvent.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

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
  user_metadata: { subscription_tier: "ultimate" },
  identities: [],
};

const TABLE_ROWS = {
  user_credits: [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }],
  user_onboarding: [{ user_id: USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null }],
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
const SUPA_PORT = 54339;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));

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
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
};

// The words a Greek speaker sees, read from the shipped messages so a
// rewording changes the test's needles rather than breaking them.
const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const W = {
  start: el.voice.startListening,
  stop: el.voice.stopListening,
  allow: el.voice.permission?.allow,
  permissionTitle: el.voice.permission?.title,
  draftTitle: el.voice.draft?.title,
  heardPrefix: el.dashboard.goal.heard.split("{heard}")[0].replace(/«$/, "").trim(),
  confirmOpen: el.dashboard.goal.confirm,
  sendIt: el.dashboard.goal.sendIt,
  fix: el.dashboard.goal.fix,
  send: el.dashboard.createAnything?.send,
};

const SHOT_DIR = process.env.VOICE_SHOTS || "";
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

const OPEN_PHRASE = "φτιάξε μου ένα σάιτ για την καφετέρια μου";
const WRITE_PHRASE = "πρόσθεσε έξοδο 50 ευρώ για καύσιμα";
const TYPED_PHRASE = "πρόσθεσε έξοδο 20 ευρώ για καφέ";

let server = null;
let browser = null;
const cleanup = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
};

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production, not a dev server) ...");
    const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let buildLog = "";
    build.stdout.on("data", (d) => (buildLog += d));
    build.stderr.on("data", (d) => (buildLog += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
      cleanup();
      process.exit(1);
    }
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const up = await (async () => {
    for (let i = 0; i < 90; i++) {
      try {
        await new Promise((res, rej) => { const r = http.get(`http://127.0.0.1:${PORT}/api/health`, () => res()); r.on("error", rej); });
        return true;
      } catch { await new Promise((r) => setTimeout(r, 1000)); }
    }
    return false;
  })();
  if (!up) { console.log("  FAIL  the production server did not start"); cleanup(); process.exit(1); }

  browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const DEVICES = [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ];

  for (const device of DEVICES) {
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const context = await browser.newContext({
      viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch,
      deviceScaleFactor: device.touch ? 3 : 1, permissions: ["microphone"],
    });
    await context.addCookies([
      { ...AUTH_COOKIE, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: "el", domain: "127.0.0.1", path: "/" },
    ]);
    const page = await context.newPage();
    const cdp = device.touch ? await context.newCDPSession(page) : null;

    // A real finger on the phone, a mouse on the desktop.
    async function press(locator) {
      await locator.scrollIntoViewIfNeeded();
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }

    // THE ONE FAKE: what OpenAI would have heard. Everything else is real.
    let nextTranscript = "";
    await page.route("**/api/voice/usage", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({
      ok: true, configured: { transcribe: true, speak: false }, limitMinutes: 900, included: true,
      usedSeconds: 0, remainingSeconds: 54000, creditsPerMinute: { transcribe: 4, speak: 40 } }) }));
    await page.route("**/api/voice/transcribe", (r) => r.fulfill({ contentType: "application/json",
      body: JSON.stringify({ ok: true, text: nextTranscript, seconds: 2, creditsUsed: 1 }) }));
    const creates = [];
    await page.route("**/api/create", (r) => {
      creates.push(r.request().postData() || "");
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, type: "answer", answer: "ok" }) });
    });

    async function speak(sentence) {
      nextTranscript = sentence;
      await press(page.getByRole("button", { name: W.start }).first());
      await page.waitForTimeout(500);
      const permission = page.getByRole("dialog", { name: W.permissionTitle });
      if (W.allow && await permission.isVisible().catch(() => false)) {
        await press(permission.getByRole("button", { name: W.allow }));
      }
      // While it records, a full-screen listening view covers the page and
      // carries its own Stop; the small button under it is renamed Stop too
      // but cannot be reached. The last one in the document is the view's.
      const stop = page.getByRole("button", { name: W.stop }).last();
      await stop.waitFor({ timeout: 8000 });
      await page.waitForTimeout(900);
      await press(stop);
      // Not a throw when the card never comes: a microphone that acted on
      // its own would leave no card, and the run must then fail on the
      // checks that NAME that ("nothing was sent", "has not moved"), not
      // on a timeout that names nothing.
      await page.getByText(W.heardPrefix, { exact: false }).first().waitFor({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
    const there = (locator) => locator.isVisible().catch(() => false);

    // ---- 1. a spoken request that names a tool
    await page.goto(`http://127.0.0.1:${PORT}/dashboard/overview`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: W.start }).first().waitFor({ timeout: 15000 });
    await speak(OPEN_PHRASE);
    const heard1 = await page.getByText(W.heardPrefix, { exact: false }).first().innerText({ timeout: 2000 }).catch(() => "(no card)");
    check(`${device.label}: the card says what it heard`, heard1.includes(OPEN_PHRASE), heard1);
    check(`${device.label}: no second dialog asks the same thing`,
      !(await page.getByRole("dialog", { name: W.draftTitle }).isVisible().catch(() => false)));
    await page.waitForTimeout(1200);
    check(`${device.label}: before Yes, the page has not moved`, new URL(page.url()).pathname === "/dashboard/overview", page.url());
    check(`${device.label}: before Yes, nothing was sent`, creates.length === 0, `${creates.length} request(s)`);
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${device.label}-1-heard-open.png` });
    if (await there(page.getByRole("button", { name: W.confirmOpen }))) await press(page.getByRole("button", { name: W.confirmOpen }));
    await page.waitForURL(/\/dashboard\/website-builder/, { timeout: 15000 }).catch(() => {});
    const landed = new URL(page.url());
    check(`${device.label}: Yes opens the Website Builder with the sentence carried`,
      landed.pathname === "/dashboard/website-builder" && [...landed.searchParams.values()].some((v) => v.includes("σάιτ")), page.url());
    check(`${device.label}: opening it spent nothing`, creates.length === 0, `${creates.length} request(s)`);

    // ---- 2. a spoken WRITE that names no tool
    await page.goto(`http://127.0.0.1:${PORT}/dashboard/overview`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: W.start }).first().waitFor({ timeout: 15000 });
    await speak(WRITE_PHRASE);
    await page.waitForTimeout(2000);
    check(`${device.label}: a spoken write waits - nothing reaches /api/create`, creates.length === 0, `${creates.length} request(s)`);
    check(`${device.label}: the card offers Yes, and says Yes is what costs`,
      await page.getByRole("button", { name: W.sendIt }).isVisible().catch(() => false));
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${device.label}-2-heard-write.png` });
    if (await there(page.getByRole("button", { name: W.fix }))) await press(page.getByRole("button", { name: W.fix }));
    await page.waitForTimeout(400);
    const box = page.locator("form textarea").first();
    check(`${device.label}: "fix the text" leaves the words in the box and sends nothing`,
      (await box.inputValue()) === WRITE_PHRASE && creates.length === 0 &&
        !(await page.getByRole("button", { name: W.sendIt }).isVisible().catch(() => false)),
      `box: ${await box.inputValue()} | ${creates.length} request(s)`);
    await box.fill("");
    await speak(WRITE_PHRASE);
    const sentBeforeYes = creates.length;
    if (await there(page.getByRole("button", { name: W.sendIt }))) await press(page.getByRole("button", { name: W.sendIt }));
    await page.waitForTimeout(1500);
    check(`${device.label}: the second time, too, nothing went before Yes`, sentBeforeYes === 0, `${sentBeforeYes} request(s) before Yes`);
    check(`${device.label}: Yes sends it, exactly once`,
      creates.length === 1 && creates[0].includes("50 ευρώ"), `${creates.length} request(s): ${creates[0]?.slice(0, 120)}`);

    // ---- 3. typed text is unchanged
    await page.goto(`http://127.0.0.1:${PORT}/dashboard/overview`, { waitUntil: "networkidle" });
    const before = creates.length;
    await page.locator("form textarea").first().fill(TYPED_PHRASE);
    await press(page.getByRole("button", { name: W.send }).first());
    await page.waitForTimeout(1500);
    check(`${device.label}: typed Send still goes straight to /api/create`,
      creates.length === before + 1 && creates[creates.length - 1].includes("20 ευρώ"), `${creates.length - before} new request(s)`);

    await context.close();
  }
} catch (e) {
  failures.push("the run threw: " + (e?.message ?? e));
  console.log("  FAIL  the run threw: " + (e?.stack ?? e));
} finally {
  try { await browser?.close(); } catch {}
  cleanup();
}

console.log(failures.length === 0
  ? `\nALL PASS: ${pass} passed, 0 failed`
  : `\n${failures.length} FAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
