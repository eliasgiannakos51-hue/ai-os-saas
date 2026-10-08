/*
 * «ΑΝΟΙΓΩ ΤΗ ΣΕΛΙΔΑ, ΣΥΝΔΕΩ ΜΙΑ ΥΠΗΡΕΣΙΑ ΜΕ ΕΝΑ ΚΟΥΜΠΙ» — IN THE BUILT APP
 * (MASTER 16, package 31), behind the switch "connections".
 *
 * Run: node scripts/tests/google-calendar.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/google-calendar.prodtest.mjs
 *
 * One production build, two servers: the Google client and the token key
 * set to placeholders (never sent anywhere — the redirect to Google is
 * read, not followed), and the same with nothing set. The switch is a row
 * in the stand-in database's feature_flags, changed between runs.
 *
 * WHAT IS THE APP'S OWN: the page, its cards, the button, the consent step
 * and the REAL connect route, up to the address it sends the browser to at
 * Google — the scope, PKCE, the return address and the signed state are
 * read off that address. What is not: Google's window and the callback
 * after it, which need the owner's Google client (NEEDS 10).
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

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

const flags = [];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54374,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    user_integrations: [],
    integration_sync_log: [],
    feature_flags: flags,
  },
});
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

const freePort = () =>
  new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  ADMIN_EMAILS: "",
  TEST_ACCOUNT_EMAILS: MOCK_USER.email,
  GOOGLE_OAUTH_CLIENT_ID: "",
  GOOGLE_OAUTH_CLIENT_SECRET: "",
  SLACK_CLIENT_ID: "",
  SLACK_CLIENT_SECRET: "",
  INTEGRATION_ENCRYPTION_KEY: "",
};

const el = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.integrations;
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));

const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
};
async function start(env) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn("npx", ["next", "start", "-p", String(port)], { env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  servers.push(server);
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${origin}/api/health`, () => res()); r.on("error", rej); });
      return origin;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error("the production server did not start");
}
async function open(origin, device) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: "el", url: origin },
    ].map(({ domain, path, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  const cdp = device.touch ? await context.newCDPSession(page) : null;
  async function press(locator) {
    await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.click();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return { context, page, press };
}

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production) ...");
    const build = spawn("npx", ["next", "build"], { env: base, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + log.slice(-3000));
      cleanup();
      process.exit(1);
    }
  }
  const SET = await start({
    ...base,
    GOOGLE_OAUTH_CLIENT_ID: "placeholder-client.apps.googleusercontent.com",
    GOOGLE_OAUTH_CLIENT_SECRET: "placeholder-never-sent",
    // 64 hex characters: a well-formed key that encrypts nothing here.
    INTEGRATION_ENCRYPTION_KEY: "0123456789abcdef".repeat(4),
  });
  const UNSET = await start(base);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    setFlags({ connections: "staff" });
    const { context, page, press } = await open(SET, device);
    await page.goto(`${SET}/dashboard/integrations`, { waitUntil: "networkidle" });
    const main = await page.locator("main").innerText();
    check("Google Calendar is on the page, saying what it reads before anything is pressed",
      main.includes("Google Calendar") && main.includes(JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.integrations.providers.googleCalendar.sees));
    const buttons = page.locator('[data-testid="integration-connect"]');
    check("every card has its Connect button, on the card (4)", (await buttons.count()) === 4);
    const calendarButton = page.getByRole("button", { name: fill(el.connectTo, { name: "Google Calendar" }) });
    const box = await calendarButton.boundingBox();
    check("...a 44px target", box && box.height >= 44, JSON.stringify(box));
    check("...enabled where the provider is set up", await calendarButton.isEnabled());

    // ---- one press: what it will read
    await press(calendarButton);
    const approve = page.getByRole("link", { name: fill(el.consentApprove, { name: "Google Calendar" }) });
    await approve.waitFor({ timeout: 10000 }).catch(() => null);
    const consent = await page.locator("main").innerText();
    check("one press opens what the AI will read, in its own words and the scope verbatim",
      consent.includes(fill(el.consentTitle, { name: "Google Calendar" })) &&
        consent.includes(JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.integrations.providers.googleCalendar.consent) &&
        consent.includes("https://www.googleapis.com/auth/calendar.events.readonly"));
    check("...and one more is Google's own window", (await approve.getAttribute("href")) === "/api/integrations/google_calendar/connect");

    // ---- the connect route, the app's own, read and not followed
    const connect = await page.request.get(`${SET}/api/integrations/google_calendar/connect`, { maxRedirects: 0 });
    const to = new URL(connect.headers().location ?? "http://x");
    check("the route sends the browser to Google's consent screen", connect.status() === 302 || connect.status() === 307 ? to.origin === "https://accounts.google.com" : false, `${connect.status()} ${to.href}`);
    check("...asking for the events, read-only, and nothing else", to.searchParams.get("scope") === "https://www.googleapis.com/auth/calendar.events.readonly", to.searchParams.get("scope"));
    check("...with PKCE, a signed state, and the way back to this app",
      to.searchParams.get("code_challenge_method") === "S256" && (to.searchParams.get("code_challenge") ?? "").length >= 43 && (to.searchParams.get("state") ?? "").length > 20 &&
        to.searchParams.get("redirect_uri") === `${SET}/api/integrations/google_calendar/callback`);
    check("...for a long-lived read, without the scopes granted before", to.searchParams.get("access_type") === "offline" && to.searchParams.get("include_granted_scopes") === "false");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== nothing set up, phone ==");
  {
    setFlags({ connections: "staff" });
    const { context, page } = await open(UNSET, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${UNSET}/dashboard/integrations`, { waitUntil: "networkidle" });
    const buttons = page.locator('[data-testid="integration-connect"]');
    check("without the Google client the buttons are there and say they cannot yet", (await buttons.count()) === 4 && !(await buttons.first().isEnabled()));
    check("...and the route refuses before anything", (await page.request.get(`${UNSET}/api/integrations/google_calendar/connect`, { maxRedirects: 0 })).status() === 503);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== the switch off, desktop ==");
  {
    setFlags({ connections: "off" });
    const { context, page } = await open(SET, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${SET}/dashboard/integrations`, { waitUntil: "networkidle" });
    const main = await page.locator("main").innerText();
    check("with the switch off: no Calendar, and Connect is back in the menu as before", !main.includes("Google Calendar") && (await page.locator('[data-testid="integration-connect"]').count()) === 0 && main.includes("Gmail"));
    const refused = await page.request.get(`${SET}/api/integrations/google_calendar/connect`, { maxRedirects: 0 });
    check("...and the route does not know the calendar", refused.status() === 404 && (await refused.json()).code === "unknown_provider");
    const gmail = await page.request.get(`${SET}/api/integrations/gmail/connect`, { maxRedirects: 0 });
    check("...while Gmail connects as it always did", (gmail.status() === 302 || gmail.status() === 307) && new URL(gmail.headers().location).searchParams.get("scope") === "https://www.googleapis.com/auth/gmail.readonly");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
