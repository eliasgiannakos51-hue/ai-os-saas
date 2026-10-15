/*
 * «ΕΞΑΓΩΓΗ ΟΛΩΝ», PRESSED IN THE BUILT APP (MASTER Μέρος 18 §2.4, docs/ACCEPTANCE.md Α49).
 *
 * Run: node scripts/tests/export-all.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/export-all.prodtest.mjs
 *
 * One production build against a stand-in Supabase that answers the
 * Storage API's listing (one folder level at a time) and download, beside
 * the account's rows. The person opens Settings, on a computer and on a
 * phone, in Greek, and presses the export button:
 *  - with the switch `export-all` on, the download is one .zip: the data,
 *    every file of theirs from every bucket (and nobody else's), each site
 *    as a page that opens, each game sealed as it is served, and a file
 *    Storage would not read named in the data file;
 *  - Settings says so above the button;
 *  - with the switch off, it is the JSON export it always was.
 * The archive is read back with the repository's own zip reader
 * (src/lib/files/zip.ts) — scripts/tests/export-archive.test.mjs holds
 * the builder; this holds the button, the route and the browser.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { loadTs } from "./load-ts.mjs";

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

const { readZipEntries, readZipEntryText } = await loadTs("src/lib/files/zip.ts");
const U = MOCK_USER.id;
const V = "22222222-2222-4222-8222-222222222222";
const BUCKETS = ["user-files", "create-attachments", "website-references", "ai-images"];

// ---- the stand-in's storage: path -> bytes, per bucket
const files = new Map(BUCKETS.map((b) => [b, new Map()]));
const put = (bucket, path, text) => files.get(bucket).set(path, Buffer.from(text, "utf8"));
for (const who of [U, V]) {
  put("user-files", `${who}/contract.pdf`, `${who} contract`);
  put("user-files", `${who}/2026/october/payroll.pdf`, `${who} payroll`);
  put("create-attachments", `${who}/chat/a1/photo.jpg`, `${who} photo`);
  put("website-references", `${who}/site-1/hero.webp`, `${who} hero`);
  put("ai-images", `${who}/img-1/1.png`, `${who} image`);
}
put("user-files", `${U}/gone.bin`, "missing");
const unreadable = new Set([`user-files/${U}/gone.bin`]);
const downloaded = [];

function storage({ req, url, body, json, res }) {
  const p = url.pathname;
  if (p.startsWith("/storage/v1/object/list/")) {
    const bucket = decodeURIComponent(p.slice("/storage/v1/object/list/".length));
    const { prefix = "", limit = 100, offset = 0 } = JSON.parse(body || "{}");
    const set = files.get(bucket) ?? new Map();
    const pre = prefix ? `${prefix}/` : "";
    const children = new Map();
    for (const key of set.keys()) {
      if (!key.startsWith(pre)) continue;
      const rest = key.slice(pre.length);
      const slash = rest.indexOf("/");
      if (slash === -1) children.set(rest, { name: rest, id: `id-${key}`, metadata: { size: set.get(key).length } });
      else children.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null, metadata: null });
    }
    json(200, [...children.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit));
    return true;
  }
  const m = /^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(p);
  if (m && req.method === "GET") {
    const [, bucket, key] = [m[0], decodeURIComponent(m[1]), decodeURIComponent(m[2])];
    downloaded.push(`${bucket}/${key}`);
    const body = files.get(bucket)?.get(key);
    if (!body || unreadable.has(`${bucket}/${key}`)) {
      json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(body);
    return true;
  }
  // The limiter's own answer, as public.consume_rate_limit gives it: true
  // while under the limit. `limited` stands for the sixth export of an hour.
  if (p === "/rest/v1/rpc/consume_rate_limit") {
    let scope = "";
    try { scope = JSON.parse(body || "{}").p_scope ?? ""; } catch {}
    json(200, !(limited && scope === "account_export"));
    return true;
  }
  return false;
}

const flags = [];
let limited = false;
const supa = await startMockSupabase({
  port: 54561,
  handle: storage,
  tableRows: {
    feature_flags: flags,
    user_websites: [
      { id: "w1", user_id: U, name: "Camping Αύρα", html_content: "<html><body><h1>Αύρα</h1></body></html>", pages: [] },
      { id: "w2", user_id: U, name: "Five pages", html_content: '<html><body><a href="about">About</a></body></html>', pages: [{ slug: "about", title: "About", html: "<html><body>about</body></html>" }] },
    ],
    user_games: [{ id: "g1", user_id: U, title: "Πουλί", html: "<!doctype html><html><head></head><body><script>let x = 1;</script></body></html>" }],
    ideas: [{ id: "n1", user_id: U, title: "Σημείωση", description: "κείμενο" }],
  },
});
// Only the three settings the app accepts (src/lib/flags/audience.ts): any
// other word is ignored there and reads as staff, so a test that wrote
// "none" for off kept the switch on and failed for the wrong reason.
const setFlag = (audience) => {
  if (!["off", "staff", "everyone"].includes(audience)) throw new Error(`not a switch setting: ${audience}`);
  flags.splice(0, flags.length, { key: "export-all", audience });
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
  ADMIN_EMAILS: "",
  TEST_ACCOUNT_EMAILS: MOCK_USER.email,
};
const el = JSON.parse(readFileSync("messages/el.json", "utf8")).settings.exportData;

let server = null;
let browser = null;
const cleanup = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
};

async function start(env) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn("npx", ["next", "start", "-p", String(port)], { env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin }, stdio: ["ignore", "pipe", "pipe"], detached: true });
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
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, acceptDownloads: true });
    await context.addCookies(
      [
        { ...supa.authCookie, url: APP, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: "el", url: APP },
      ].map(({ domain, path: p, ...c }) => c)
    );
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
    async function exportOnce() {
      await page.goto(`${APP}/dashboard/settings`, { waitUntil: "networkidle" });
      const button = page.getByRole("button", { name: el.exportAll });
      const offered = (await button.count()) === 1;
      const waiting = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
      if (offered) await press(button);
      const download = await waiting;
      const path = download ? await download.path() : null;
      return { offered, name: download?.suggestedFilename() ?? null, bytes: path ? readFileSync(path) : null };
    }

    // ---- the switch on: the .zip
    setFlag("staff");
    downloaded.length = 0;
    const on = await exportOnce();
    check("Settings offers the button, in Greek", on.offered);
    check("...and says above it what it downloads: the .zip", (await page.getByText(el.descriptionAll).count()) === 1, (await page.locator("main").innerText()).slice(0, 200));
    check(`the download is one .zip (${on.name})`, /^ionexa_export_\d{4}-\d{2}-\d{2}\.zip$/.test(on.name ?? ""));
    const entries = on.bytes ? readZipEntries(on.bytes) : [];
    const byName = new Map(entries.map((e) => [e.name, e]));
    const text = (n) => (byName.has(n) ? readZipEntryText(on.bytes, byName.get(n)) : null);
    console.log(`  (entries: ${entries.map((e) => e.name).join(" · ")})`);
    const dataFile = JSON.parse(text("ionexa-data.json") ?? "null");
    check("the data file is the account's, with its rows", dataFile?.account?.id === U && JSON.stringify(dataFile).includes("Σημείωση"));
    const want = [
      ["files/user-files/contract.pdf", `${U} contract`],
      ["files/user-files/2026/october/payroll.pdf", `${U} payroll`],
      ["files/create-attachments/chat/a1/photo.jpg", `${U} photo`],
      ["files/website-references/site-1/hero.webp", `${U} hero`],
      ["files/ai-images/img-1/1.png", `${U} image`],
    ];
    const missing = want.filter(([n, body]) => text(n) !== body).map(([n]) => n);
    check(`every file of the person, from all four buckets (${want.length - missing.length} of ${want.length})`, missing.length === 0, missing.join(", "));
    check("...and nothing of anybody else's, read or written", !downloaded.some((d) => d.includes(V)) && !entries.some((e) => text(e.name)?.includes(V)), downloaded.filter((d) => d.includes(V)).join(", "));
    check("a file Storage would not read is named in the data file", JSON.stringify(dataFile?.notes?.files_not_included ?? []).includes("gone.bin"));
    check("each site opens as a page", (text("sites/Camping Αύρα.html") ?? "").includes("<h1>Αύρα</h1>") && byName.has("sites/Five pages.zip"));
    const game = text("games/Πουλί.html") ?? "";
    check("the game is there, sealed as it is served", game.includes("Content-Security-Policy") && game.indexOf("Content-Security-Policy") < game.indexOf("<script>"));
    check("the toast says it downloaded", (await page.getByText(el.exportDownloaded).count()) >= 1);

    // ---- the switch off: the JSON export as before
    setFlag("off");
    const off = await exportOnce();
    check(`with the switch off, the download is the JSON export (${off.name})`, /^ionexa_export_\d{4}-\d{2}-\d{2}\.json$/.test(off.name ?? "") && JSON.parse(off.bytes?.toString("utf8") ?? "null")?.account?.id === U);
    check("...and Settings says JSON", (await page.getByText(el.description).count()) === 1);

    // ---- the sixth export of the hour: refused, and said in Greek
    // Pressed and read at once: the toast leaves after a few seconds, so
    // it is not waited for behind a download that will not come.
    limited = true;
    await page.goto(`${APP}/dashboard/settings`, { waitUntil: "networkidle" });
    const answered = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/account/export", { timeout: 15000 }).catch(() => null);
    await press(page.getByRole("button", { name: el.exportAll }));
    const refused = await answered;
    const tooMany = el.tooMany.replace("{count}", "5");
    const said = await page.getByText(tooMany, { exact: true }).first().waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
    check("the limit refuses the download, and the toast says it in Greek, with the number", refused?.status() === 429 && said, `${refused?.status()} · ${tooMany}`);
    check("...not the route's English sentence", (await page.getByText(/You can download a full export/).count()) === 0);
    limited = false;

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
