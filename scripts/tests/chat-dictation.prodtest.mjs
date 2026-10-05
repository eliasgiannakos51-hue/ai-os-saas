/*
 * DOES THE CHAT MICROPHONE PUT WHAT WAS SAID INTO THE BOX?
 *
 * Run: node scripts/tests/chat-dictation.prodtest.mjs
 *      SKIP_BUILD=1 VOICE_SHOTS=/tmp/shots node scripts/tests/chat-dictation.prodtest.mjs
 *
 * Reported from production on 2026-10-05: "I pressed the microphone in
 * Chat, spoke, and nothing was written in the field." This asks the
 * RUNNING chat page, built for production, with Chromium's fake
 * microphone recording a real clip through the shipped VoiceInput inside
 * the shipped ChatComposer:
 *
 *   1. the microphone is there and live when voice is available;
 *   2. press, allow, speak, stop: the words land in the chat's own box;
 *   3. nothing was sent on the person's behalf (no /api/chat request);
 *   4. WHEN VOICE CANNOT WORK HERE - no provider key, not on the plan, no
 *      minutes left - neither the microphone nor Talk is on the screen.
 *      The owner's rule (the voice brief «ΦΩΝΗ ΣΤΟ CHAT», Μέρος Α): "Κουμπί που δεν
 *      κάνει τίποτα δεν μένει στην οθόνη", and scenario 11: "Χωρίς κλειδί
 *      παρόχου, τα δύο κουμπιά δεν εμφανίζονται". The reason is on the
 *      Voice settings screen (components/settings/voice-settings.tsx).
 *
 * Only the transcription provider's answer (/api/voice/transcribe) and the
 * availability read are faked, as in voice-command.prodtest.mjs. Both
 * devices: 1440x900 with a mouse, 390x844 with Input.dispatchTouchEvent.
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

const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const W = {
  start: el.voice.startListening,
  stop: el.voice.stopListening,
  allow: el.voice.permission?.allow,
  permissionTitle: el.voice.permission?.title,
  draftTitle: el.voice.draft?.title,
  use: el.voice.draft?.use,
  placeholder: el.dashboard.chat.composerPlaceholder,
  talk: el.voice.conversation.start,
};

const SHOT_DIR = process.env.VOICE_SHOTS || "";
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

const PHRASE = "γράψε μου μια πρόταση για τον πελάτη";

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
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e)));
    const cdp = device.touch ? await context.newCDPSession(page) : null;
    async function press(locator) {
      await locator.scrollIntoViewIfNeeded();
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    const there = (locator) => locator.isVisible().catch(() => false);

    // THE ONE FAKE: what OpenAI would have heard. Everything else is real.
    const AVAILABLE = { ok: true, configured: { transcribe: true, speak: false }, limitMinutes: 900, included: true,
      usedSeconds: 0, remainingSeconds: 54000, creditsPerMinute: { transcribe: 4, speak: 40 } };
    let usage = AVAILABLE;
    await page.route("**/api/voice/usage", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(usage) }));
    const transcribes = [];
    await page.route("**/api/voice/transcribe", (r) => {
      transcribes.push(r.request().headers()["content-type"] ?? "");
      return r.fulfill({ contentType: "application/json",
        body: JSON.stringify({ ok: true, text: PHRASE, seconds: 2, creditsUsed: 1 }) });
    });
    const chats = [];
    await page.route("**/api/chat", (r) => {
      chats.push(r.request().postData() || "");
      return r.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    });

    // ---- WHEN VOICE CANNOT WORK, NOTHING TO PRESS. Each of the three
    // states the availability read can answer with, and an answer that
    // never came (a failed read is unavailable, voice-availability.tsx).
    const UNAVAILABLE = [
      ["no transcription key", { ...AVAILABLE, configured: { transcribe: false, speak: false } }],
      ["not on the plan", { ...AVAILABLE, limitMinutes: 0, included: false, remainingSeconds: 0 }],
      ["no minutes left", { ...AVAILABLE, usedSeconds: 54000, remainingSeconds: 0 }],
      ["the read failed", { ok: false, code: "failed" }],
    ];
    for (const [why, answer] of UNAVAILABLE) {
      usage = answer;
      await page.goto(`http://127.0.0.1:${PORT}/dashboard/chat`, { waitUntil: "networkidle" });
      await page.getByPlaceholder(W.placeholder).first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(600);
      const mics = await page.getByRole("button", { name: W.start }).count();
      const talks = await page.getByRole("button", { name: W.talk, exact: true }).count();
      check(`${device.label}, ${why}: no microphone on the screen`, mics === 0, `${mics} microphone button(s)`);
      check(`${device.label}, ${why}: no Talk button either`, talks === 0, `${talks} Talk button(s)`);
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/chat-${device.label}-off-${why.replace(/\W+/g, "-")}.png` });
    }
    usage = AVAILABLE;

    await page.goto(`http://127.0.0.1:${PORT}/dashboard/chat`, { waitUntil: "networkidle" });
    const box = page.getByPlaceholder(W.placeholder).first();
    await box.waitFor({ timeout: 15000 });
    const mic = page.getByRole("button", { name: W.start }).first();
    await mic.waitFor({ timeout: 15000 }).catch(() => {});
    check(`${device.label}: the chat has a live microphone`,
      (await there(mic)) && (await mic.getAttribute("aria-disabled")) !== "true" && (await mic.isEnabled()),
      `visible ${await there(mic)}`);
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/chat-${device.label}-0.png` });

    await press(mic);
    await page.waitForTimeout(500);
    const permission = page.getByRole("dialog", { name: W.permissionTitle });
    const sawPermission = await there(permission);
    check(`${device.label}: the first press explains before the browser asks`, sawPermission);
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/chat-${device.label}-1-permission.png` });
    if (sawPermission) await press(permission.getByRole("button", { name: W.allow }));

    const stop = page.getByRole("button", { name: W.stop }).last();
    const recording = await stop.waitFor({ timeout: 8000 }).then(() => true, () => false);
    check(`${device.label}: it records, and says so`, recording);
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/chat-${device.label}-2-listening.png` });
    if (recording) {
      await page.waitForTimeout(1200);
      await press(stop);
    }
    await page.waitForTimeout(1500);
    check(`${device.label}: the clip reaches /api/voice/transcribe`, transcribes.length === 1, `${transcribes.length} request(s)`);
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/chat-${device.label}-3-after-stop.png` });

    // The editable draft, when this composer uses one; accepted as heard.
    const draft = page.getByRole("dialog", { name: W.draftTitle });
    if (await there(draft)) await press(draft.getByRole("button", { name: W.use }));
    await page.waitForTimeout(600);
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/chat-${device.label}-4-box.png` });

    const value = await box.inputValue().catch(() => "(no box)");
    check(`${device.label}: what was said is in the chat box`, value.includes(PHRASE), `box: ${JSON.stringify(value)}`);
    check(`${device.label}: nothing was sent on the person's behalf`, chats.length === 0, `${chats.length} /api/chat request(s)`);
    check(`${device.label}: no page error on the way`, pageErrors.length === 0, pageErrors.join(" | "));

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
