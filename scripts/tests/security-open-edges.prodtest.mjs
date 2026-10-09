/*
 * THE SERIOUS FINDINGS OF docs/SECURITY-AUDIT.md THAT CODE COULD CLOSE,
 * PRESSED IN THE BUILT APP (2026-10-08).
 *
 * Run: node scripts/tests/security-open-edges.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/security-open-edges.prodtest.mjs
 *
 * One production build, three servers on the stand-in Supabase of
 * scripts/lib/mock-supabase.mjs (projects kept as real rows, and every
 * write recorded with WHO wrote it: the account's own token or the
 * server's), and a stand-in Resend that answers in Resend's own shapes —
 * `{ id }` for a sent message, `{ statusCode, message, name }` for a
 * refusal.
 *
 *   CUSTOMER  an ordinary account: no switch open, not an admin.
 *   OWNER     ADMIN_EMAILS is this account; mail is set up.
 *   NOKEY     ADMIN_EMAILS is this account; RESEND_API_KEY is not set.
 *
 * Each part runs on a desktop (1440x900, mouse) and a phone (390x844,
 * real CDP touch), in Greek and in English:
 *
 *   1. ΑΣ-4.11 — a Free account, empty, makes its one project; the write
 *      reaches the database as the SERVER's, with the session's user; the
 *      second is refused in the reader's language and nothing is written.
 *   2. ΑΣ-4.10 — a site flagged before 2026-10-05 still holds "regenerate
 *      it once at no extra charge" in its row. The screen says what
 *      happened in the reader's language, never that sentence; the button
 *      says its price; out of credits, the press is refused and the site
 *      stays as it was. In the tool shell too, and in Chat, where a site
 *      made beside the conversation and held by the review used to be
 *      reported with the stored English sentence (found 2026-10-09).
 *   3. ΑΣ-8.5 — System Health says who gets the alerts and whether mail
 *      can leave; «Send a test alert» goes out to the owner and the
 *      screen says so; a refusal shows what Resend said; too many presses
 *      are refused; without a key nothing is sent and the screen says
 *      why; a stranger gets the not-found page and a 404 for the button.
 *
 * EACH RUN STANDS ALONE: an exception ends that run with a FAIL that names
 * it, and the next run and the next part still go. Run on the tree without
 * the fixes, the first version of this file stopped at the first missing
 * element, and the alerts part never ran at all.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import IntlMessageFormat from "intl-messageformat";
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

const M = { el: JSON.parse(readFileSync("messages/el.json", "utf8")), en: JSON.parse(readFileSync("messages/en.json", "utf8")) };
const fmt = (locale, text, values) => String(new IntlMessageFormat(text, locale).format(values));

// ---------------------------------------------------------------------
// The stand-in database: projects as rows, writes recorded with their
// author, the rate limit and the credits under the test's hand.
// ---------------------------------------------------------------------
const SID = "f1a99ed0-0000-4000-8000-000000000001";
const OLD_FLAG =
  "This website was flagged by our safety review and can't be published as-is: an external script tag; a form posting off-site. You can regenerate it once at no extra charge.";
// The stored halves a screen must never show, cut out of the rows
// themselves rather than typed: an English needle typed here would also
// match the publish dialog's own English wording on an English screen.
const OLD_OPENING = OLD_FLAG.slice(0, OLD_FLAG.indexOf(":"));
const OLD_PROMISE = OLD_FLAG.slice(OLD_FLAG.lastIndexOf(". ") + 2);
const projects = [];
const writes = [];
let rateAllowed = true;
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 0, credits_total: 0 }];
const sites = [
  {
    id: SID, user_id: MOCK_USER.id, name: "Αύρα Νάξος", status: "flagged", error_message: OLD_FLAG,
    description: "Ένα site για μια ταβέρνα στη Νάξο, με μενού και επικοινωνία.", html_content: "<p>x</p>",
    generation_notes: null, pages: null, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z",
  },
];
const roleOf = (req) => {
  const token = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).role ?? "?"; } catch { return "?"; }
};
function rest({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, rateAllowed), true;
  if (req.method !== "GET" && req.method !== "HEAD" && table !== "rpc/consume_rate_limit") {
    writes.push({ table, method: req.method, role: roleOf(req), body: body ? JSON.parse(body) : null });
  }
  if (table !== "projects") return false;
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  if (req.method === "POST") {
    const input = JSON.parse(body || "{}");
    const row = { id: `9e000000-0000-4000-8000-00000000000${projects.length + 1}`, status: "active", goal: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...input };
    projects.push(row);
    return single ? json(201, row) : json(201, [row]), true;
  }
  if ((req.headers.prefer ?? "").includes("count=")) {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Range": projects.length > 0 ? `0-${projects.length - 1}/${projects.length}` : "*/0" });
    return res.end(JSON.stringify(req.method === "HEAD" ? null : projects)), true;
  }
  return single ? (projects[0] ? json(200, projects[0]) : json(406, { message: "no rows" })) : json(200, projects), true;
}
const supa = await startMockSupabase({ port: 54412, tableRows: { user_credits: credits, user_websites: sites }, handle: rest });

// ---------------------------------------------------------------------
// The stand-in Resend, in Resend's own answer shapes.
// ---------------------------------------------------------------------
const mail = [];
let mailMode = "ok";
const REFUSAL = { statusCode: 403, message: "The ionexa.test domain is not verified. Please, add and verify your domain on https://resend.com/domains", name: "validation_error" };
const resend = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/emails") {
      mail.push(JSON.parse(body || "{}"));
      if (mailMode === "refuse") {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(REFUSAL));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ id: `re_${mail.length}` }));
    }
    res.writeHead(404);
    res.end();
  });
});
await new Promise((r) => resend.listen(0, "127.0.0.1", r));
const RESEND_URL = `http://127.0.0.1:${resend.address().port}`;

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
  TEST_ACCOUNT_EMAILS: "",
  RESEND_API_KEY: "",
  RESEND_FROM_EMAIL: "",
};

const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { resend.close(); } catch {}
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

const DEVICES = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
];
const RUNS = DEVICES.flatMap((device) => ["el", "en"].map((locale) => ({ device, locale, label: `${device.name}/${locale}` })));

async function open(origin, { device, locale }) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: locale, url: origin },
    ].map(({ domain, path, ...c }) => c)
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
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
const shows = (page, text, timeout = 15000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true).catch(() => false);
async function each(label, origin, run, body) {
  let opened = null;
  try {
    opened = await open(origin, run);
    await body(opened);
  } catch (err) {
    check(`${label}: ran to its end`, false, String(err?.message ?? err).split("\n")[0]);
  } finally {
    try { await opened?.context.close(); } catch {}
  }
}
const noSideScroll = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);

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
  const CUSTOMER = await start(base);
  const OWNER = await start({ ...base, ADMIN_EMAILS: MOCK_USER.email, RESEND_API_KEY: "re_stand_in_not_a_key", RESEND_FROM_EMAIL: "Ionexa <alerts@ionexa.test>", RESEND_BASE_URL: RESEND_URL });
  const NOKEY = await start({ ...base, ADMIN_EMAILS: MOCK_USER.email, RESEND_BASE_URL: RESEND_URL });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  // =================================================================
  console.log("\n== 1. ΑΣ-4.11: a Free account's one project, made by the server ==");
  for (const run of RUNS) {
    const P = M[run.locale].projects;
    MOCK_USER.user_metadata = {};
    projects.splice(0);
    writes.splice(0);
    await each(run.label, CUSTOMER, run, async ({ page, press }) => {
      await page.goto(`${CUSTOMER}/dashboard/projects`, { waitUntil: "networkidle" });
      check(`${run.label}: a new account sees the empty list, in its language`, (await page.getByText(P.list.empty, { exact: true }).count()) === 1);
      const name = run.locale === "el" ? "Ταβέρνα στη Νάξο" : "Taverna in Naxos";
      await page.locator("#project-name").fill(name);
      await press(page.getByRole("button", { name: P.form.create }));
      const made = await shows(page, name);
      const created = writes.filter((w) => w.table === "projects" && w.method === "POST");
      check(`${run.label}: the project is made and listed`, made && projects.length === 1, JSON.stringify(projects));
      check(
        `${run.label}: ...written by the server, for the session's own account`,
        created.length === 1 && created[0].role === "service_role" && created[0].body?.user_id === MOCK_USER.id,
        JSON.stringify(created)
      );
      await page.locator("#project-name").fill(run.locale === "el" ? "Δεύτερο" : "Second");
      await press(page.getByRole("button", { name: P.form.create }));
      check(`${run.label}: the second is refused with the plan's number, in its language`, await shows(page, fmt(run.locale, P.errors.limitReached, { limit: 1 })));
      check(`${run.label}: ...and nothing more is written`, projects.length === 1 && writes.filter((w) => w.table === "projects").length === 1, JSON.stringify(writes));
      if (run.device.touch) check(`${run.label}: no sideways scroll`, await noSideScroll(page));
    });
  }

  // =================================================================
  console.log("\n== 2. ΑΣ-4.10: a site flagged before the fix promises nothing ==");
  for (const run of RUNS) {
    const W = M[run.locale].dashboard.websiteBuilder;
    MOCK_USER.user_metadata = { subscription_tier: "growth" };
    credits[0].credits_remaining = 0;
    writes.splice(0);
    await each(run.label, CUSTOMER, run, async ({ page, press }) => {
      await page.goto(`${CUSTOMER}/dashboard/website-builder`, { waitUntil: "networkidle" });
      const body = page.locator('[data-testid="flagged-body"]');
      check(`${run.label}: the flagged site says what happened, in its language`, (await body.count()) === 1 && (await body.innerText()).trim() === W.flaggedBody, (await body.count()) ? await body.innerText() : "no panel");
      const text = await page.evaluate(() => document.body.innerText);
      check(`${run.label}: ...and never the stored promise`, !text.includes(OLD_PROMISE), OLD_PROMISE);
      check(`${run.label}: ...nor the stored English sentence`, !text.includes(OLD_OPENING));
      await press(page.getByText(W.flaggedDetails, { exact: true }));
      check(`${run.label}: the findings are one press away`, await shows(page, "an external script tag; a form posting off-site"));
      const button = page.getByRole("button", { name: new RegExp(fmt(run.locale, W.regeneratePaid, { count: 0 }).split("·")[0].trim()) });
      check(`${run.label}: the regenerate button says its price before the press`, (await button.count()) === 1 && /\d/.test(await button.innerText()), (await button.count()) ? await button.innerText() : "no button");
      await press(button);
      const refusal = W.regenerateNoCredits.split("{")[0].trim();
      check(`${run.label}: out of credits, the press is refused in its language`, await shows(page, refusal), refusal);
      check(`${run.label}: ...and the site stays as it was`, writes.filter((w) => w.table === "user_websites").length === 0, JSON.stringify(writes));
      if (run.device.touch) check(`${run.label}: no sideways scroll`, await noSideScroll(page));
    });
  }
  for (const run of RUNS.filter((r) => r.device.name === "desktop")) {
    const W = M[run.locale].dashboard.websiteBuilder;
    await each(`${run.label} tool shell`, OWNER, run, async ({ page, press }) => {
      await page.goto(`${OWNER}/dashboard/website-builder?project=${SID}`, { waitUntil: "networkidle" });
      check(`${run.label}: in the tool shell too, the reader's language and not the row`, (await shows(page, W.flaggedBody)) && !(await page.evaluate(() => document.body.innerText)).includes(OLD_PROMISE));
      await press(page.locator('[data-testid="site-recent"]'));
      check(`${run.label}: ...and the list of sites names it flagged, in its language`, await shows(page, W.flaggedTitle));
    });
  }
  // CHAT: a site made beside the conversation (switch chat-opens-tools, on
  // for the owner) that the review holds. Its record carries the sentence
  // the worker writes TODAY, in English whatever the reader's language.
  for (const run of RUNS) {
    const W = M[run.locale].dashboard.websiteBuilder;
    const NEW_FLAG =
      "This website was flagged by our safety review and can't be published as-is: an inline script that sends form data away. You can regenerate it; the button shows what that costs.";
    const CHAT_SITE = (status) => ({ id: "c2222222-2222-4222-8222-222222222222", user_id: MOCK_USER.id, name: "Camping", status, html_content: status === "flagged" ? "<p>x</p>" : "", error_message: status === "flagged" ? NEW_FLAG : null, created_at: "2026-10-09T09:00:00Z" });
    credits[0].credits_remaining = 3000;
    await each(`${run.label} chat`, OWNER, run, async ({ page, press }) => {
      let polls = 0;
      await page.route("**/api/websites/generate/process", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
      await page.route("**/api/websites/generate", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, generated: true, record: CHAT_SITE("pending") }) }));
      await page.route("**/api/websites/status**", (r) => {
        polls++;
        return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, record: CHAT_SITE(polls < 2 ? "processing" : "flagged") }) });
      });
      await page.goto(`${OWNER}/dashboard/chat`, { waitUntil: "networkidle" });
      const field = page.locator("textarea").first();
      await press(field);
      await field.fill(run.locale === "el" ? "φτιάξε μου site για το camping" : "make me a website for the campsite");
      await field.press("Enter");
      const pane = page.locator('[data-testid="chat-site-pane"]');
      await pane.waitFor();
      await press(page.locator('[data-testid="chat-site-make"]'));
      const said = await shows(page, W.flaggedBody, 20000);
      const text = await pane.innerText();
      check(`${run.label}: Chat says a held site in the reader's language`, said && text.includes(W.flaggedTitle), text.slice(-400));
      check(`${run.label}: ...and not the stored sentence`, !text.includes(NEW_FLAG.slice(0, NEW_FLAG.indexOf(":"))) && !text.includes(NEW_FLAG.slice(NEW_FLAG.lastIndexOf(". ") + 2)), text.slice(0, 400));
      if (run.device.touch) check(`${run.label}: no sideways scroll`, await noSideScroll(page));
    });
  }

  // =================================================================
  console.log("\n== 3. ΑΣ-8.5: do the alerts reach the owner? One press ==");
  for (const run of RUNS) {
    const A = M[run.locale].dashboard.systemHealth.alerts;
    rateAllowed = true;
    mailMode = "ok";
    mail.splice(0);
    await each(run.label, OWNER, run, async ({ page, press }) => {
      await page.goto(`${OWNER}/dashboard/system-health`, { waitUntil: "networkidle" });
      const panel = page.locator('[data-testid="owner-alerts"]');
      check(`${run.label}: System Health shows who gets the alerts`, (await page.locator('[data-testid="owner-alerts-recipients"]').innerText()).trim() === fmt(run.locale, A.recipients, { count: 1 }));
      check(`${run.label}: ...and that mail can leave, from the owner's own address`, (await page.locator('[data-testid="owner-alerts-mailer"]').innerText()).trim() === A.mailerOk);
      check(`${run.label}: ...and no address is on the screen`, !(await panel.innerText()).includes(MOCK_USER.email));
      const send = page.locator('[data-testid="owner-alerts-send"]');
      const box = await send.boundingBox();
      check(`${run.label}: the button is a 44px target`, box && box.height >= 44, JSON.stringify(box));
      await press(send);
      check(`${run.label}: pressed, the test goes out and the screen says so`, await shows(page, fmt(run.locale, A.sent, { count: 1 })));
      check(
        `${run.label}: ...one message, to the owner only, from the owner's sender`,
        mail.length === 1 && JSON.stringify(mail[0].to) === JSON.stringify([MOCK_USER.email]) && mail[0].from === "Ionexa <alerts@ionexa.test>",
        JSON.stringify(mail.map((m) => ({ to: m.to, from: m.from })))
      );
      mailMode = "refuse";
      await press(send);
      check(`${run.label}: Resend refuses: the screen says it was not sent, and what Resend said`, (await shows(page, A.refused)) && (await shows(page, REFUSAL.message)));
      rateAllowed = false;
      const before = mail.length;
      await press(send);
      check(`${run.label}: too many presses: refused in its language, nothing sent`, (await shows(page, A.rateLimited)) && mail.length === before);
      if (run.device.touch) check(`${run.label}: no sideways scroll`, await noSideScroll(page));
    });
  }
  for (const run of RUNS.filter((r) => r.device.name === "phone")) {
    const A = M[run.locale].dashboard.systemHealth.alerts;
    rateAllowed = true;
    mail.splice(0);
    await each(`${run.label} no key`, NOKEY, run, async ({ page, press }) => {
      await page.goto(`${NOKEY}/dashboard/system-health`, { waitUntil: "networkidle" });
      check(`${run.label}: without RESEND_API_KEY the panel says no alert leaves`, (await page.locator('[data-testid="owner-alerts-mailer"]').innerText()).trim() === A.mailerMissing);
      await press(page.locator('[data-testid="owner-alerts-send"]'));
      check(`${run.label}: ...pressed, it says why, and nothing is sent`, (await shows(page, A.notConfigured)) && mail.length === 0);
    });
  }
  mail.splice(0);
  await each("a stranger", CUSTOMER, RUNS[0], async ({ page }) => {
    // The PAGE, not its status: the dashboard streams (src/app/dashboard/
    // loading.tsx), so notFound() arrives after a 200 has been sent and the
    // screen is the not-found page. What matters is that nothing of System
    // Health reaches the stranger, and that is what is checked.
    await page.goto(`${CUSTOMER}/dashboard/system-health`, { waitUntil: "networkidle" });
    check(
      "a stranger: System Health shows the not-found page, and none of its panels",
      (await shows(page, M.el.pageTitle.notFoundBody)) && (await page.locator('[data-testid="owner-alerts"]').count()) === 0
    );
    const post = await page.request.post(`${CUSTOMER}/api/system-health/test-alert`);
    check("a stranger: the test button's route is a 404 too, and nothing is sent", post.status() === 404 && mail.length === 0, String(post.status()));
  });

  check("no error in any page's console", pageErrors.length === 0, pageErrors.slice(0, 5).join("\n        "));
} catch (err) {
  failures.push(String(err?.stack ?? err));
  console.log(`  FAIL  ${String(err?.stack ?? err)}`);
} finally {
  try { await browser?.close(); } catch {}
  cleanup();
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
