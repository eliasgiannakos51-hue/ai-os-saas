/*
 * IOWORK, Φάση 1 κομμάτι 2, IN THE BUILT APP (the owner's "IOWORK:
 * ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ", 2026-10-25), behind the switch
 * "iowork-tool".
 *
 * Run: node scripts/tests/iowork-devices.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/iowork-devices.prodtest.mjs
 *
 * THE DESKTOP APP IS NOT WRITTEN YET, so what stands in for it here is a
 * plain fetch with no cookie — which is exactly what the app will be to
 * these two routes: something with no session, holding a claim secret.
 * The round trip is therefore real end to end on the side that exists:
 * the «app» asks for a code, a person types that code into the built
 * page with real presses, the «app» collects its token, the computer
 * appears in the list, and one press disconnects it.
 *
 * The one thing no prodtest can do here is press a button inside a Mac
 * or Windows binary — docs/IOWORK-TECH.md says so plainly rather than
 * leaving the gap to be discovered.
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
const devices = [];
const pairings = [];
let nextId = 1;

/** The filters these routes actually send: eq. and is.null, nothing else. */
function matches(row, url) {
  for (const [key, value] of url.searchParams) {
    if (["select", "order", "limit", "offset", "columns"].includes(key)) continue;
    if (value === "is.null") {
      if (row[key] !== null && row[key] !== undefined) return false;
    } else if (value.startsWith("eq.")) {
      if (String(row[key]) !== value.slice(3)) return false;
    }
  }
  return true;
}

function rest({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  const store = table === "iowork_devices" ? devices : table === "iowork_pairings" ? pairings : null;
  if (!store) return false;

  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const wanted = store.filter((row) => matches(row, url));
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));

  if (req.method === "GET" || req.method === "HEAD") {
    if ((req.headers.prefer ?? "").includes("count=")) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Range": wanted.length > 0 ? `0-${wanted.length - 1}/${wanted.length}` : "*/0",
      });
      return res.end(JSON.stringify(req.method === "HEAD" ? null : wanted)), true;
    }
    return answer(wanted), true;
  }
  if (req.method === "POST") {
    const row = {
      id: `row${nextId++}`,
      user_id: null,
      claimed_at: null,
      collected_at: null,
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      ...JSON.parse(body || "{}"),
    };
    store.push(row);
    return answer([row]), true;
  }
  if (req.method === "PATCH") {
    const patch = JSON.parse(body || "{}");
    for (const row of wanted) Object.assign(row, patch);
    return answer(wanted), true;
  }
  if (req.method === "DELETE") {
    for (const row of wanted) store.splice(store.indexOf(row), 1);
    return answer(wanted), true;
  }
  return false;
}

const supa = await startMockSupabase({ port: 54414, tableRows: { feature_flags: flags }, handle: rest });
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
};
const EL = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.iowork;

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
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  servers.push(server);
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${origin}/api/health`, () => res()); r.on("error", rej); });
      return origin;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error("the production server did not start");
}
async function open(origin, device, locale = "el") {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: locale, url: origin },
    ].map(({ domain, path: p, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  page.on("dialog", (d) => d.accept());
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

/**
 * Screenshots, for the round's report. SHOT_DIR is where they land; with
 * it unset nothing is written, so a CI run does not accumulate images.
 */
const SHOT_DIR = process.env.SHOT_DIR || "";
const shot = async (page, name) => {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
};

/** The desktop app: no cookie, no session, exactly what the real one will be. */
const asApp = (origin, path, data) =>
  fetch(`${origin}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(
    async (r) => ({ status: r.status, body: await r.json().catch(() => null) })
  );

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
  const APP = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    setFlags({});
    devices.length = 0;
    pairings.length = 0;

    console.log(`\n== ${device.label}: the square opens the real screen, and it says what is missing ==`);
    const { context, page, press } = await open(APP, device);
    await page.goto(`${APP}/dashboard/tools`, { waitUntil: "load" });
    const tile = page.locator('[data-testid="tool-tile"][href="/dashboard/iowork"]').first();
    await tile.waitFor({ timeout: 15_000 });
    await press(tile);
    await page.locator('[data-testid="iowork-empty"]').waitFor({ timeout: 15_000 });
    check("the real screen opened, not Coming Soon", (await page.locator('[data-testid="coming-soon"]').count()) === 0);
    const body = await page.locator("body").innerText();
    check("it says the app for the computer is not out yet", body.includes(EL.noAppYet.slice(0, 40)));
    check("it says what a connected computer never reaches", body.includes(EL.safetyLine.slice(0, 40)));
    check("no computer is listed yet", (await page.locator('[data-testid="iowork-device"]').count()) === 0);
    await shot(page, `iowork-${device.label}-empty`);

    console.log(`\n== ${device.label}: the app asks for a code, with no session at all ==`);
    const started = await asApp(APP, "/api/iowork/pair", { platform: "mac", label: "Το MacBook" });
    check("the app got a code without signing in", started.status === 200 && typeof started.body?.code === "string");
    check("the code is eight characters", started.body?.code?.length === 8);
    check("the code is also given in the shape the screen shows", started.body?.display === `${started.body?.code?.slice(0, 4)}-${started.body?.code?.slice(4)}`);
    check("a claim secret came with it, and it is not the code", typeof started.body?.claimSecret === "string" && started.body.claimSecret.length >= 40);
    check("the pairing is stored as a hash, never as the secret itself", pairings[0]?.claim_secret_hash !== started.body?.claimSecret && !JSON.stringify(pairings[0]).includes(started.body.claimSecret));

    console.log(`\n== ${device.label}: the person types that code, with real presses ==`);
    await page.locator("#iowork-code").fill(started.body.display);
    await press(page.locator('[data-testid="iowork-connect"]'));
    await page.waitForTimeout(1500);
    check("the pairing is now claimed by this account", pairings[0]?.user_id === MOCK_USER.id);
    // THE HALF THAT MATTERS: typing the code does NOT create the computer.
    // The app has to come back for its token first, which is what stops a
    // typed code alone from attaching anything.
    check("typing the code alone connected no computer", devices.length === 0 && (await page.locator('[data-testid="iowork-device"]').count()) === 0);
    // ...and the screen says exactly that much and no more. A toast reading
    // «συνδέθηκε» here would be ahead of the line above it.
    check("...and the message says the code was accepted, not that it is connected", (await page.locator("body").innerText()).includes(EL.codeAccepted.split("{name}")[1].slice(0, 30)));

    console.log(`\n== ${device.label}: the app collects its token, once ==`);
    const collected = await asApp(APP, "/api/iowork/pair/token", { claimSecret: started.body.claimSecret });
    check("the app got a token", collected.status === 200 && collected.body?.status === "paired" && typeof collected.body?.token === "string");
    check("the answer names the account, so a wrong one is visible", collected.body?.account === MOCK_USER.email);
    check("one computer now exists", devices.length === 1 && devices[0].label === "Το MacBook" && devices[0].platform === "mac");
    check("the token is stored as a hash, never in the clear", devices[0].token_hash !== collected.body.token && !JSON.stringify(devices[0]).includes(collected.body.token));
    const again = await asApp(APP, "/api/iowork/pair/token", { claimSecret: started.body.claimSecret });
    check("the same secret cannot collect a second token", again.status === 409 && devices.length === 1);

    console.log(`\n== ${device.label}: the computer appears on its own, and one press disconnects it ==`);
    // NO RELOAD HERE, ON PURPOSE. An earlier version of this file called
    // page.reload() at this point and passed while the screen was in fact
    // broken: the shell seeded its list from a prop with useState, so
    // router.refresh() re-rendered the server component and changed
    // nothing the person could see. Waiting without a reload is what
    // makes this line worth having.
    await page.locator('[data-testid="iowork-device"]').first().waitFor({ timeout: 45_000 });
    check("the computer is listed by the name it gave", (await page.locator('[data-testid="iowork-device"]').innerText()).includes("Το MacBook"));
    await shot(page, `iowork-${device.label}-connected`);
    const target = page.locator('[data-testid="iowork-disconnect"]').first();
    const box = await target.boundingBox();
    check(`the disconnect target is at least 44px (${Math.round(box?.height ?? 0)}px)`, (box?.height ?? 0) >= 44 && (box?.width ?? 0) >= 44);
    await press(target);
    await page.waitForTimeout(1500);
    check("the row is gone from the table, not merely flagged", devices.length === 0);
    check("and gone from the screen", (await page.locator('[data-testid="iowork-device"]').count()) === 0);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== desktop: a code that belongs to nobody is refused, in Greek ==");
  {
    setFlags({});
    devices.length = 0;
    pairings.length = 0;
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/iowork`, { waitUntil: "load" });
    await page.locator("#iowork-code").waitFor({ timeout: 15_000 });
    await page.locator("#iowork-code").fill("ABCD-2345");
    await press(page.locator('[data-testid="iowork-connect"]'));
    await page.waitForTimeout(1500);
    const body = await page.locator("body").innerText();
    check("the refusal is the Greek sentence, not a code", body.includes(EL.errors.not_found.slice(0, 25)));
    check("nothing was connected", devices.length === 0);

    console.log("\n== desktop: a code already claimed answers exactly like one that never existed ==");
    const started = await asApp(APP, "/api/iowork/pair", { platform: "windows", label: "Το PC" });
    const first = await page.request.post(`${APP}/api/iowork/devices`, { data: { code: started.body.code } });
    const second = await page.request.post(`${APP}/api/iowork/devices`, { data: { code: started.body.code } });
    check("the first claim works", first.status() === 200);
    check("the second is a plain not_found, which tells a guesser nothing", second.status() === 404 && (await second.json()).code === "not_found");
    await context.close();
  }

  console.log("\n== desktop: with the switch not open to this account, the square opens Coming Soon ==");
  {
    setFlags({ "iowork-tool": "off" });
    const { context, page } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/iowork`, { waitUntil: "load" });
    check("Coming Soon, not the real screen", (await page.locator('[data-testid="coming-soon"]').count()) === 1 && (await page.locator("#iowork-code").count()) === 0);
    await shot(page, "iowork-desktop-coming-soon");
    const list = await page.request.get(`${APP}/api/iowork/devices`);
    check("...and the route refuses too, independently of the page", list.status() === 403 && (await list.json()).code === "not_enabled");
    const gone = await page.request.delete(`${APP}/api/iowork/devices/whatever`);
    check("...and so does disconnecting", gone.status() === 403);
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
