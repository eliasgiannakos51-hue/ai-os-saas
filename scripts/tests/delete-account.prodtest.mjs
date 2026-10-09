/*
 * ACCOUNT DELETION, PRESSED IN THE BUILT APP.
 *
 * Run: node scripts/tests/delete-account.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/delete-account.prodtest.mjs
 *
 * One production build against a stand-in Supabase that answers the way
 * the hosted one does on 2026-10-08, including the part that broke every
 * deletion: a `delete from storage.objects` is refused with 42501 (the
 * protect_objects_delete trigger, storage migration 0055), so the old SQL
 * function delete_user_storage_objects() fails here exactly as it failed
 * in production. Files are listed and removed through the Storage API's
 * own endpoints, one folder level per listing.
 *
 * The person opens the emailed link on /delete-account/confirm and
 * presses the button, on a computer and on a phone:
 *  - every file of theirs, in every bucket and every folder, is removed,
 *    and nobody else's;
 *  - the account is deleted, after the files, and the page goes home;
 *  - when the Storage API refuses, nothing else is deleted, the link is
 *    given back, and the page says to try again.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase } from "../lib/mock-supabase.mjs";

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

const U = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";
const BUCKETS = ["user-files", "create-attachments", "website-references", "ai-images"];

// ---- the stand-in's state, reset per device
let files = new Map();
let state = {};
function reset({ storageDown = false } = {}) {
  files = new Map(BUCKETS.map((b) => [b, new Set()]));
  for (const who of [U, V]) {
    files.get("user-files").add(`${who}/contract.pdf`);
    files.get("user-files").add(`${who}/2026/october/payroll.pdf`);
    files.get("create-attachments").add(`${who}/chat/a1/photo.jpg`);
    files.get("website-references").add(`${who}/site-1/hero.webp`);
    files.get("ai-images").add(`${who}/img-1/1.png`);
    for (let i = 0; i < 150; i++) files.get("ai-images").add(`${who}/bulk/${String(i).padStart(3, "0")}.png`);
  }
  state = { storageDown, claimed: 0, released: 0, sqlDeleteCalled: 0, deletedUsers: [], forgot: 0, order: [] };
}
const left = (who) => [...files.entries()].flatMap(([b, set]) => [...set].filter((p) => p.startsWith(`${who}/`)).map((p) => `${b}:${p}`));

function handle({ req, url, body, json }) {
  const p = url.pathname;
  const send = (code, data) => { json(code, data); return true; };
  if (p === "/rest/v1/rpc/consume_rate_limit") return send(200, true);
  if (p === "/rest/v1/account_deletion_requests" && req.method === "PATCH") {
    const patch = JSON.parse(body || "{}");
    if (patch.used_at === null) { state.released++; return send(200, []); }
    state.claimed++;
    return send(200, { user_id: U });
  }
  if (p === "/rest/v1/rpc/delete_user_storage_objects") {
    state.sqlDeleteCalled++;
    // What PostgREST answers for the protect_objects_delete trigger.
    return send(403, { code: "42501", details: null, hint: "This prevents accidental data loss from orphaned objects.", message: "Direct deletion from storage tables is not allowed. Use the Storage API instead." });
  }
  if (p === "/rest/v1/rpc/forget_user_in_production_errors") { state.forgot++; state.order.push("forget"); return send(200, null); }
  if (p.startsWith("/storage/v1/object/list/")) {
    const bucket = decodeURIComponent(p.slice("/storage/v1/object/list/".length));
    const { prefix = "", limit = 100, offset = 0 } = JSON.parse(body || "{}");
    const set = files.get(bucket) ?? new Set();
    const pre = prefix ? `${prefix}/` : "";
    const children = new Map();
    for (const key of set) {
      if (!key.startsWith(pre)) continue;
      const rest = key.slice(pre.length);
      const slash = rest.indexOf("/");
      if (slash === -1) children.set(rest, { name: rest, id: `id-${key}`, metadata: { size: 1 } });
      else children.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null, metadata: null });
    }
    const sorted = [...children.values()].sort((a, b) => a.name.localeCompare(b.name));
    return send(200, sorted.slice(offset, offset + limit));
  }
  if (p.startsWith("/storage/v1/object/") && req.method === "DELETE") {
    const bucket = decodeURIComponent(p.slice("/storage/v1/object/".length));
    if (state.storageDown) return send(500, { statusCode: "500", error: "internal", message: "storage is down" });
    const { prefixes = [] } = JSON.parse(body || "{}");
    const set = files.get(bucket) ?? new Set();
    const done = prefixes.filter((x) => set.delete(x)).map((name) => ({ name, bucket_id: bucket }));
    state.order.push(`remove:${bucket}`);
    return send(200, done);
  }
  if (p === `/auth/v1/admin/users/${U}` && req.method === "GET") {
    return send(200, { id: U, aud: "authenticated", email: "leaving@example.com", user_metadata: {}, app_metadata: {} });
  }
  if (p === `/auth/v1/admin/users/${U}` && req.method === "DELETE") {
    state.deletedUsers.push(U);
    state.order.push("deleteUser");
    return send(200, {});
  }
  return false;
}

reset();
const supa = await startMockSupabase({ port: 54371, handle });

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
  // No Stripe on this account; the client is never asked.
  STRIPE_SECRET_KEY: "",
};

const el = JSON.parse(readFileSync("messages/el.json", "utf8")).auth.deleteAccount;
const servers = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) { try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {} }
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
  const APP = await start(base);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
    await context.addCookies([{ name: "NEXT_LOCALE", value: "el", url: APP }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e?.message ?? e)));
    const cdp = device.touch ? await context.newCDPSession(page) : null;
    async function press(locator) {
      await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }

    // ---- the person presses the button
    reset();
    const before = left(V).length;
    await page.goto(`${APP}/delete-account/confirm?token=tok-${device.label}`, { waitUntil: "networkidle" });
    const button = page.getByRole("button", { name: el.confirmButton });
    check("the page offers the button, in Greek", (await button.count()) === 1);
    await press(button);
    await page.waitForURL((u) => u.searchParams.get("deleted") === "success", { timeout: 20000 }).catch(() => null);
    check("the page goes home with «deleted=success»", new URL(page.url()).searchParams.get("deleted") === "success", page.url());
    check("every file of the person is gone, in every bucket and folder", left(U).length === 0, left(U).slice(0, 4).join(", "));
    check(`...and nobody else's: ${before} files of another account are all there`, left(V).length === before);
    check("the files went through the Storage API, not the SQL function Supabase refuses", state.sqlDeleteCalled === 0, JSON.stringify(state));
    check("the account is deleted", state.deletedUsers.length === 1 && state.deletedUsers[0] === U, JSON.stringify(state.deletedUsers));
    check("...after the files, and after the error log is scrubbed", state.order.lastIndexOf("deleteUser") > state.order.lastIndexOf("forget") && state.order.indexOf("forget") > state.order.lastIndexOf("remove:ai-images"), state.order.join(" > "));

    // ---- the Storage API refuses
    reset({ storageDown: true });
    await page.goto(`${APP}/delete-account/confirm?token=tok2-${device.label}`, { waitUntil: "networkidle" });
    await press(page.getByRole("button", { name: el.confirmButton }));
    await page.getByText(el.errors.files_retry).first().waitFor({ timeout: 15000 }).catch(() => null);
    check("when the files cannot be removed, the page says so in Greek, and to try again", (await page.getByText(el.errors.files_retry).count()) === 1, (await page.locator("main").innerText()).slice(0, 300));
    check("...the account is not deleted", state.deletedUsers.length === 0, JSON.stringify(state));
    check("...nothing after the files ran", state.forgot === 0, JSON.stringify(state));
    check("...and the link is given back", state.claimed === 1 && state.released === 1, JSON.stringify(state));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);
    check(`no page threw (${errors.length})`, errors.length === 0, errors.slice(0, 3).join(" | "));
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
