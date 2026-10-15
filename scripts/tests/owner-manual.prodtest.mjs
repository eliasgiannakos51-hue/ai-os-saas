/*
 * THE OWNER'S MANUAL, FOLLOWED IN THE BUILT APP (MASTER 16, package 40:
 * «έχω το εγχειρίδιό μου»).
 *
 * Run: node scripts/tests/owner-manual.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/owner-manual.prodtest.mjs
 *
 * owner-manual.test.mjs holds the words: every link names a page that
 * exists, every «label» is somewhere in the catalogue or the code. That is
 * not the question the owner asks when he follows a step. His question is
 * whether «Κανείς» is ON the page the step sends him to, and whether
 * pressing it does what the step says. So, in a production build over the
 * stand-in database, signed in as the owner (ADMIN_EMAILS):
 *
 *   1. Every step of docs/OWNER.md that sends him into the product, read
 *      from the manual itself: the page opens, and every «label» the step
 *      names is on that page — a step that says «στην ίδια σελίδα» means
 *      the page the section last named. /api/health answers with the
 *      fields the manual tells him to read. Desktop, then a phone.
 *   2. One instruction followed to the end, on the phone with real touch:
 *      «Πώς γυρίζω πίσω την τελευταία αλλαγή», step 1 — «Διακόπτες», the
 *      switch of a tool, «Κανείς». It holds at once, without a deploy: a
 *      new account meets the old screen. «Όλοι» opens it to an account
 *      that is not his; «Εσύ και ο λογαριασμός δοκιμής» closes it again.
 *   3. «Οι σελίδες διαχείρισης ανοίγουν μόνο για τα email που είναι στο
 *      ADMIN_EMAILS· για όλους τους άλλους είναι σαν να μην υπάρχουν»:
 *      the same links for an account that is not his.
 *   4. The same pages in English open as well, without an error.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { chromiumPath } from "./lib/chromium.mjs";

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

// ---------------------------------------------------------------------
// THE MANUAL'S STEPS: each numbered or bulleted item with its
// continuation lines, the links into the product it names, and its
// «labels». A step with labels and no link is on the page its section
// named last («στην ίδια σελίδα»).
// ---------------------------------------------------------------------
const SITE = /https:\/\/ai-os-saas-five\.vercel\.app(\/[^\s)»,]*)?/g;
function ownerSteps(doc) {
  const steps = [];
  let section = "";
  let step = null;
  const flush = () => {
    if (step) steps.push(step);
    step = null;
  };
  for (const line of doc.split("\n")) {
    if (line.startsWith("## ")) {
      flush();
      section = line.slice(3).trim();
      continue;
    }
    if (/^\s{0,2}(\d+\.|-)\s/.test(line)) {
      flush();
      step = { section, text: line.trim() };
    } else if (step && line.trim()) step.text += " " + line.trim();
    else flush();
  }
  flush();
  let lastPage = new Map();
  for (const s of steps) {
    s.links = [...s.text.matchAll(SITE)].map((m) => (m[1] ?? "/").replace(/[.;:]$/, ""));
    s.labels = [...s.text.matchAll(/«([^»]+)»/g)].map((m) => m[1].replace(/\s+/g, " ").trim()).filter(Boolean);
    s.page = s.links[0] ?? (s.labels.length ? lastPage.get(s.section) ?? null : null);
    if (s.links.length) lastPage.set(s.section, s.links.at(-1));
  }
  return steps;
}
const steps = ownerSteps(readFileSync("docs/OWNER.md", "utf8"));
/** Page → the labels the manual says are on it. */
const PAGES = new Map();
for (const s of steps) {
  if (!s.page) continue;
  if (!PAGES.has(s.page)) PAGES.set(s.page, new Set());
  for (const l of s.labels) PAGES.get(s.page).add(l);
}
const orphanLabels = steps.filter((s) => !s.page && s.labels.length).map((s) => `${s.section}: ${s.labels.join(", ")}`);
/** The one page the manual sends a CUSTOMER to («Ο χρήστης τα κάνει μόνος του»); every other /dashboard page it names is the owner's. */
const USER_PAGES = new Set(["/dashboard/settings"]);
/** The labels on USER_PAGES that only the owner sees, by the manual's own word «Περιθώριο ανά πλάνο» (components/settings/margin-report.tsx). */
const OWNER_ONLY_LABELS = new Set(["Αναφορά Περιθωρίου"]);

// ---------------------------------------------------------------------
// The database: the switches and the onboarding row are kept, so a
// switch the owner turns is what the next page reads.
// ---------------------------------------------------------------------
const flags = new Map();
const onboarding = [];
function rest({ req, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const rows = (input) => {
    const parsed = JSON.parse(input || "{}");
    return Array.isArray(parsed) ? parsed : [parsed];
  };
  if (table === "feature_flags") {
    if (req.method === "GET") return json(200, [...flags.values()]), true;
    for (const row of rows(body)) flags.set(row.key, { key: row.key, audience: row.audience });
    return json(201, []), true;
  }
  if (table === "user_onboarding") {
    const mine = onboarding.filter((r) => r.user_id === MOCK_USER.id);
    if (req.method === "GET") return (single ? (mine[0] ? json(200, mine[0]) : json(406, { message: "no rows" })) : json(200, mine)), true;
    for (const row of rows(body)) {
      const at = onboarding.find((r) => r.user_id === row.user_id);
      if (at) Object.assign(at, row);
      else onboarding.push({ goal: null, completed_at: null, skipped_at: null, activation_used_at: null, ...row });
    }
    return json(201, []), true;
  }
  return false;
}
const supa = await startMockSupabase({ port: 54458, handle: rest });
// A new account, for the switch to be seen working on.
const newAccount = () => onboarding.splice(0);
// An account that has been through it, for every other page.
const settledAccount = () => {
  onboarding.splice(0);
  onboarding.push({ user_id: MOCK_USER.id, goal: null, completed_at: "2026-01-02T00:00:00Z", skipped_at: null, activation_used_at: null });
};

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
  TEST_ACCOUNT_EMAILS: "",
};

const servers = [];
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
async function open(origin, device, locale = "el") {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: locale, url: origin },
    ].map(({ domain, path, ...c }) => c)
  );
  const page = await context.newPage();
  const pageErrors = [];
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
  return { context, page, press, pageErrors };
}
const flat = (s) => s.replace(/\s+/g, " ");
/** Opens a page of the manual and says what it found: the status, the visible text. */
async function visit(page, origin, path) {
  const res = await page.goto(origin + path, { waitUntil: "load" });
  await page.waitForTimeout(300);
  return { status: res?.status() ?? 0, text: flat(await page.locator("body").innerText()), width: await page.evaluate(() => document.documentElement.scrollWidth) };
}

const desktop = { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false };
const phone = { label: "phone", viewport: { width: 390, height: 844 }, touch: true };
const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const FLAG_WORDS = el.dashboard.systemHealth.flags.audience;

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
  // The owner, and an account that is not his: one build, the same database.
  const OWNER = await start({ ...base, ADMIN_EMAILS: MOCK_USER.email });
  const CUSTOMER = await start({ ...base, ADMIN_EMAILS: "" });
  browser = await chromium.launch({ executablePath: chromiumPath() });

  console.log("\n== the manual's steps ==");
  check(`steps that send the owner into the product (${PAGES.size} pages, ${[...PAGES.values()].reduce((n, s) => n + s.size, 0)} labels)`, PAGES.size >= 7 && [...PAGES.values()].some((s) => s.size >= 4));
  check("every «label» belongs to a page a step names", orphanLabels.length === 0, orphanLabels.join(" | "));

  // =================================================================
  // 1. Every page and every label, desktop then phone.
  // =================================================================
  for (const device of [desktop, phone]) {
    console.log(`\n== 1. every page the manual names, as the owner (${device.label}) ==`);
    settledAccount();
    const { context, page, pageErrors } = await open(OWNER, device);
    for (const [path, labels] of PAGES) {
      if (path.startsWith("/api/")) {
        const res = await page.request.get(OWNER + path);
        const body = await res.json().catch(() => null);
        check(`${path}: answers with "ok", and "schema" to read what is missing`, body !== null && typeof body.ok === "boolean" && "schema" in body, JSON.stringify(body)?.slice(0, 300));
        check(`${path}: ...and with "ok": false it says why, in "reason"`, body?.ok === true || typeof body?.reason === "string", JSON.stringify(body)?.slice(0, 300));
        continue;
      }
      const seen = await visit(page, OWNER, path);
      check(`${path} opens (${seen.status})`, seen.status === 200);
      const missing = [...labels].filter((l) => !seen.text.includes(l));
      if (labels.size) check(`${path}: ${[...labels].map((l) => `«${l}»`).join(" ")} on the screen`, missing.length === 0, `missing: ${missing.join(" | ")}`);
      if (device.touch) check(`${path}: fits the phone`, seen.width <= 390, String(seen.width));
    }
    // «Provider keys» → «Check keys»: the press answers, key by key.
    if (!device.touch && PAGES.get("/dashboard/system-health")?.has("Check keys")) {
      await page.goto(`${OWNER}/dashboard/system-health`, { waitUntil: "load" });
      const answered = page.waitForResponse((r) => r.url().endsWith("/api/system-health/keys"), { timeout: 30000 }).catch(() => null);
      await page.getByRole("button", { name: "Check keys", exact: true }).click();
      const res = await answered;
      const body = res ? await res.json().catch(() => null) : null;
      await page.getByText("Last checked", { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => null);
      check("«Check keys» answers for every key it lists, and says when it checked", res?.ok() === true && Array.isArray(body?.results) && body.results.length > 0 && (await page.getByText("Last checked", { exact: false }).count()) > 0, JSON.stringify(body)?.slice(0, 300));
    }
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  // 2. «Πώς γυρίζω πίσω», step 1, followed on the phone.
  // =================================================================
  console.log("\n== 2. «Διακόπτες» → «Κανείς», followed on a phone ==");
  {
    const back = steps.find((s) => s.section === "Πώς γυρίζω πίσω την τελευταία αλλαγή" && s.labels.includes(FLAG_WORDS.off));
    check("the step is in the manual, with the page and the three choices", back?.page === "/dashboard/system-health" && [FLAG_WORDS.off, FLAG_WORDS.staff, FLAG_WORDS.everyone].every((w) => back.labels.includes(w)), JSON.stringify(back));
    const { context, page, press, pageErrors } = await open(OWNER, phone);
    const choose = async (word) => {
      settledAccount();
      await page.goto(`${OWNER}/dashboard/system-health`, { waitUntil: "load" });
      const group = page.getByRole("radiogroup", { name: "first-task" });
      await group.waitFor({ timeout: 30000 });
      const choice = group.getByRole("radio", { name: word, exact: true });
      const saved = page.waitForResponse((r) => r.url().endsWith("/api/system-health/flags") && r.request().method() === "POST", { timeout: 15000 });
      await press(choice);
      const res = await saved.catch(() => null);
      return { ok: res?.ok() === true, checked: (await choice.getAttribute("aria-checked")) === "true" };
    };
    const firstTaskShown = async (origin, ctxPage) => {
      newAccount();
      await ctxPage.goto(`${origin}/dashboard/overview`, { waitUntil: "load" });
      await ctxPage.waitForTimeout(300);
      return { path: new URL(ctxPage.url()).pathname, firstTask: (await ctxPage.locator('[data-testid="first-task"]').count()) === 1 };
    };

    let turned = await choose(FLAG_WORDS.off);
    check(`«${FLAG_WORDS.off}», pressed with a finger on the switch "first-task": saved, and shown as chosen`, turned.ok && turned.checked && flags.get("first-task")?.audience === "off", JSON.stringify([turned, flags.get("first-task")]));
    let shown = await firstTaskShown(OWNER, page);
    check("...it holds at once, without a deploy: a new account meets the questionnaire, not the first task", shown.path === "/onboarding" && !shown.firstTask, JSON.stringify(shown));

    turned = await choose(FLAG_WORDS.everyone);
    check(`«${FLAG_WORDS.everyone}»: saved`, turned.ok && flags.get("first-task")?.audience === "everyone");
    const customer = await open(CUSTOMER, desktop);
    shown = await firstTaskShown(CUSTOMER, customer.page);
    check("...and an account that is not his meets the first task", shown.path === "/onboarding" && shown.firstTask, JSON.stringify(shown));

    turned = await choose(FLAG_WORDS.staff);
    check(`«${FLAG_WORDS.staff}»: saved`, turned.ok && flags.get("first-task")?.audience === "staff");
    shown = await firstTaskShown(CUSTOMER, customer.page);
    check("...and that account no longer does", shown.path === "/onboarding" && !shown.firstTask, JSON.stringify(shown));
    shown = await firstTaskShown(OWNER, page);
    check("...while he still does", shown.path === "/onboarding" && shown.firstTask, JSON.stringify(shown));
    check(`no page threw (${pageErrors.length + customer.pageErrors.length})`, pageErrors.length + customer.pageErrors.length === 0, [...pageErrors, ...customer.pageErrors].slice(0, 3).join(" | "));
    await customer.context.close();
    await context.close();
  }

  // =================================================================
  // 3. The same links, for an account that is not his.
  // =================================================================
  console.log("\n== 3. «για όλους τους άλλους είναι σαν να μην υπάρχουν» ==");
  {
    settledAccount();
    const { context, page, pageErrors } = await open(CUSTOMER, desktop);
    // "As if it did not exist" is measured against a page that does not:
    // the same answer and the same screen. (Both are HTTP 200 with the
    // not-found screen: app/dashboard/loading.tsx starts the response
    // before the page can say 404.)
    const nowhere = await visit(page, CUSTOMER, "/dashboard/no-such-page-anywhere");
    check(`a page that does not exist shows the not-found screen (${nowhere.status})`, nowhere.text.includes(el.pageTitle.notFoundBody), nowhere.text.slice(0, 300));
    for (const [path, labels] of PAGES) {
      if (!path.startsWith("/dashboard/")) continue;
      const seen = await visit(page, CUSTOMER, path);
      if (USER_PAGES.has(path)) {
        const leaked = [...labels].filter((l) => OWNER_ONLY_LABELS.has(l) && seen.text.includes(l));
        const kept = [...labels].filter((l) => !OWNER_ONLY_LABELS.has(l) && !seen.text.includes(l));
        check(`${path}: a customer's own page opens for him (${seen.status}), with what the manual tells him to press`, seen.status === 200 && kept.length === 0, kept.join(" | "));
        check(`${path}: ...and without the owner's ${[...OWNER_ONLY_LABELS].map((l) => `«${l}»`).join(" ")}`, leaked.length === 0, leaked.join(" | "));
      } else {
        const shown = [...labels].filter((l) => seen.text.includes(l));
        check(`${path}: the same as a page that does not exist (${seen.status}, the not-found screen)`, seen.status === nowhere.status && seen.text.includes(el.pageTitle.notFoundBody) && shown.length === 0, `${shown.join(" | ")} ${seen.text.slice(0, 200)}`);
      }
    }
    const res = await page.request.post(`${CUSTOMER}/api/system-health/flags`, { data: { key: "first-task", audience: "everyone" } });
    check(`...and the switches cannot be turned by him (${res.status()})`, res.status() === 404 && flags.get("first-task")?.audience === "staff");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  // 4. In English.
  // =================================================================
  console.log("\n== 4. the same pages in English ==");
  {
    settledAccount();
    const { context, page, pageErrors } = await open(OWNER, desktop, "en");
    for (const path of PAGES.keys()) {
      if (path.startsWith("/api/")) continue;
      const seen = await visit(page, OWNER, path);
      check(`${path} opens in English (${seen.status})`, seen.status === 200 && (await page.evaluate(() => document.documentElement.lang)) === "en");
    }
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
