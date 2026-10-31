/*
 * THE APP BUILDER, IN THE BUILT APP (the owner's "APPS: ΛΕΙΤΟΥΡΓΙΚΟ,
 * ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ", 2026-10-24, κομμάτι 2), behind the switch
 * "apps-tool".
 *
 * Run: node scripts/tests/apps-tool.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/apps-tool.prodtest.mjs
 *
 * The model is a local server answering as Anthropic does
 * (ANTHROPIC_BASE_URL), returning a real plan for a hairdresser and a
 * real slice for one box — so "only that box changed" is checked against
 * the rendered screen, letter for letter, rather than against the
 * parser alone (apps-tool.test.mjs already does that part).
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
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const reserved = [];
const settled = [];
const appRows = [];

function rest({ req, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (table === "rpc/reserve_credits") {
    const args = JSON.parse(body || "{}");
    reserved.push(args);
    return json(200, [{ reservation_id: `r${reserved.length}`, available: credits[0].credits_remaining }]), true;
  }
  if (table === "rpc/settle_reservation") return settled.push(JSON.parse(body || "{}")), json(200, null), true;
  if (table === "rpc/release_reservation") return json(200, null), true;
  if (table === "user_apps") {
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
    const idFilter = url.searchParams.get("id");
    const wanted = idFilter ? appRows.filter((r) => `eq.${r.id}` === idFilter) : appRows;
    if (req.method === "GET") return answer(wanted), true;
    if (req.method === "POST") {
      const row = { id: `app${appRows.length + 1}`, versions: [], updated_at: new Date().toISOString(), ...JSON.parse(body || "{}") };
      appRows.push(row);
      return answer([row]), true;
    }
    if (req.method === "PATCH") {
      const patch = JSON.parse(body || "{}");
      for (const row of wanted) Object.assign(row, patch);
      return answer(wanted), true;
    }
    return false;
  }
  return false;
}

const supa = await startMockSupabase({ port: 54412, tableRows: { feature_flags: flags, user_credits: credits }, handle: rest });
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

// ---------------------------------------------------------------------
// The model: a real plan for a hairdresser, and a real slice for a box.
// ---------------------------------------------------------------------
const PLAN = {
  title: "Κρατήσεις κομμωτηρίου",
  collections: [
    {
      key: "bookings",
      label: "Ραντεβού",
      visibility: "own",
      fields: [
        { key: "name", label: "Όνομα", type: "text", required: true },
        { key: "when", label: "Ημερομηνία", type: "date", required: true },
        { key: "service", label: "Υπηρεσία", type: "choice", required: true, options: ["Κούρεμα", "Βαφή"] },
      ],
    },
    { key: "services", label: "Υπηρεσίες", visibility: "owner", fields: [{ key: "title", label: "Τίτλος", type: "text", required: true }] },
  ],
  screens: [
    { key: "book", label: "Κλείσε ραντεβού", kind: "form", collection: "bookings", role: "customer" },
    { key: "day", label: "Η μέρα μου", kind: "list", collection: "bookings", role: "owner" },
  ],
  notifications: [{ key: "new_booking", label: "Νέο ραντεβού", collection: "bookings", to: "owner" }],
};
const CHANGED_NOTIFICATION = "Ήρθε νέο ραντεβού";

const modelAsked = [];
const model = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const sent = JSON.parse(body || "{}");
    modelAsked.push(sent);
    const toolName = sent.tool_choice?.name ?? "plan_app";
    const input =
      toolName === "rewrite_box"
        ? { notifications: [{ key: "new_booking", label: CHANGED_NOTIFICATION, collection: "bookings", to: "owner" }] }
        : PLAN;
    res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
    res.end(
      JSON.stringify({
        id: "msg",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [{ type: "tool_use", id: "t", name: toolName, input }],
        stop_reason: "tool_use",
        usage: { input_tokens: 500, output_tokens: 400 },
      })
    );
  });
});
await new Promise((r) => model.listen(0, "127.0.0.1", r));

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
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${model.address().port}`,
};
const EL = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.appBuilder;

const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { model.close(); } catch {}
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

const DESCRIPTION = "εφαρμογή κρατήσεων για κομμωτήριο";
const boxTexts = (page) => page.locator('[data-testid="app-box"]').allInnerTexts();

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
    console.log(`\n== ${device.label}: the screen opens from the square, in the common shape ==`);
    setFlags({});
    appRows.length = 0;
    const { context, page, press } = await open(APP, device);
    await page.goto(`${APP}/dashboard/tools`, { waitUntil: "load" });
    const tile = page.locator('[data-testid="tool-tile"][href="/dashboard/app-builder"]').first();
    await tile.waitFor({ timeout: 15_000 });
    await press(tile);
    await page.locator('[data-testid="tool-shell"]').first().waitFor({ timeout: 15_000 });
    check("the real tool opened, not Coming Soon", (await page.locator('[data-testid="tool-shell-empty"]').count()) === 1 && (await page.locator('[data-testid="coming-soon"]').count()) === 0);
    check("the empty landing's heading and three examples are drawn", (await page.locator('[data-testid="tool-shell-example"]').count()) === 3);

    console.log(`\n== ${device.label}: a description becomes a plan in four boxes ==`);
    reserved.length = 0;
    settled.length = 0;
    const askedBefore = modelAsked.length;
    await page.locator("textarea").first().fill(DESCRIPTION);
    await press(page.locator('button[type="submit"]'));
    await page.locator('[data-testid="app-plan"]').waitFor({ timeout: 60_000 });
    const boxes = await boxTexts(page);
    check("four boxes, no more and no fewer", boxes.length === 4);
    check("the data box names the collections the plan has", boxes[0].includes("Ραντεβού") && boxes[0].includes("Υπηρεσίες"));
    check("...and the fields inside them, with their kind", boxes[0].includes("Όνομα") && boxes[0].includes(EL.type.date));
    check("the screens box names both screens", boxes[1].includes("Κλείσε ραντεβού") && boxes[1].includes("Η μέρα μου"));
    check("the access box says a visitor sees only their own bookings", boxes[2].includes(EL.seesOwn));
    check("the notifications box says what gets told", boxes[3].includes("Νέο ραντεβού"));
    check("the model was asked once", modelAsked.length - askedBefore === 1);
    check("one hold, settled once", reserved.length === 1 && settled.length === 1 && settled[0].p_feature === "app_generate");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== desktop: one box changed with words, the other three letter for letter the same ==");
  {
    setFlags({});
    appRows.length = 0;
    reserved.length = 0;
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/app-builder`, { waitUntil: "load" });
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 15_000 });
    await page.locator("textarea").first().fill(DESCRIPTION);
    await press(page.locator('button[type="submit"]'));
    await page.locator('[data-testid="app-plan"]').waitFor({ timeout: 60_000 });
    const before = await boxTexts(page);

    await press(page.locator('[data-testid="app-box"][data-box="notifications"]'));
    check("the chosen box is said under the field", (await page.locator('[data-testid="box-chosen"]').innerText()).includes(EL.box.notifications));
    const askedBefore = modelAsked.length;
    await page.locator("textarea").first().fill("πες το πιο ζεστά");
    await press(page.locator('button[type="submit"]'));
    await page.locator('[data-testid="app-plan"]').locator(`text=${CHANGED_NOTIFICATION}`).waitFor({ timeout: 30_000 });
    const after = await boxTexts(page);
    check("the notifications box changed", after[3] !== before[3] && after[3].includes(CHANGED_NOTIFICATION));
    check("the data box is letter for letter the same", after[0] === before[0]);
    check("the screens box is letter for letter the same", after[1] === before[1]);
    check("the access box is letter for letter the same", after[2] === before[2]);
    check("exactly one more call was made — the box alone, not the whole plan again", modelAsked.length - askedBefore === 1);
    check("the box change took its own hold", reserved.length === 2);
    await context.close();
  }

  console.log("\n== desktop: approving the plan costs nothing ==");
  {
    setFlags({});
    appRows.length = 0;
    reserved.length = 0;
    settled.length = 0;
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/app-builder`, { waitUntil: "load" });
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 15_000 });
    await page.locator("textarea").first().fill(DESCRIPTION);
    await press(page.locator('button[type="submit"]'));
    await page.locator('[data-testid="app-plan"]').waitFor({ timeout: 60_000 });
    const asked = modelAsked.length;
    const held = reserved.length;
    await press(page.locator('[data-testid="app-approve"]'));
    await page.locator('[data-testid="app-approved"]').waitFor({ timeout: 15_000 });
    check("the plan is marked approved", (await page.locator('[data-testid="app-approved"]').innerText()).includes(EL.approvedNote));
    check("...and the approve button is gone", (await page.locator('[data-testid="app-approve"]').count()) === 0);
    check("approving asked the model nothing and held nothing", modelAsked.length === asked && reserved.length === held);
    check("the row says approved", appRows[0]?.status === "approved");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== desktop: with the switch not open to this account, the square still opens Coming Soon ==");
  {
    setFlags({ "apps-tool": "off" });
    const { context, page } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/app-builder`, { waitUntil: "load" });
    check("Coming Soon, not the real tool", (await page.locator('[data-testid="tool-shell"]').count()) === 0 && (await page.locator('[data-testid="coming-soon"]').count()) === 1);
    const direct = await page.request.post(`${APP}/api/apps`, { data: { description: DESCRIPTION, locale: "el" } });
    check("...and the route itself refuses, independently of the page", direct.status() === 403 && (await direct.json()).code === "not_enabled");
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
