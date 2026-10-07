/*
 * «ΠΑΙΡΝΩ 4 ΠΑΡΑΛΛΑΓΕΣ, ΑΛΛΑΖΩ ΜΙΑ ΜΕ ΛΟΓΙΑ, ΚΑΙ ΤΗΝ ΚΑΤΕΒΑΖΩ ΣΤΗΝ ΥΨΗΛΟΤΕΡΗ
 * ΑΝΑΛΥΣΗ» — IN THE BUILT APP (MASTER 16, package 19).
 *
 * Run: node scripts/tests/image-studio.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/image-studio.prodtest.mjs
 *
 * One production build, three servers: the test account with a provider
 * key (a placeholder, never sent anywhere: the three routes that would
 * call the provider are answered by the browser, page.route); the same
 * without a key; and the switch off.
 *
 * WHAT IS THE APP'S OWN: the page, its read of earlier images and the
 * signing of every picture (lib/images/image-access.ts, against the
 * stand-in storage below, which signs and serves real PNG bytes); the
 * download route's redirect and the name the file is saved under; the
 * delete route, which must empty the bucket of every picture the row
 * names before it deletes the row. WHAT IS ANSWERED HERE: the provider's
 * pictures — no key is set in this environment (NEEDS 5).
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

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const OLD = "a2222222-2222-4222-8222-222222222222";
const NEW = "b3333333-3333-4333-8333-333333333333";
const pathOf = (id, n, name = `v${n}`) => `${MOCK_USER.id}/${id}/${name}.png`;
const OLD_ROW = {
  id: OLD, user_id: MOCK_USER.id, prompt: "Ένα κάμπινγκ στη Νάξο το σούρουπο", aspect: "1:1", status: "done", credits_charged: 36,
  variants: [0, 1, 2, 3].map((n) => ({ index: n, path: pathOf(OLD, n), mime: "image/png", fullPath: null, previous: n === 1 ? [pathOf(OLD, 1, "old")] : [] })),
  created_at: "2026-10-07T10:00:00Z", updated_at: "2026-10-07T10:00:00Z",
};
const flags = [];
const removed = [];
let signs = 0;

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54373,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    generated_images: [OLD_ROW],
    ai_images: [],
    feature_flags: flags,
  },
  // THE BUCKET, signed and served: what storage-js asks for and what it reads back.
  handle: ({ req, res, url, body, json }) => {
    const p = url.pathname;
    if (req.method === "POST" && p === "/storage/v1/object/sign/ai-images") {
      signs++;
      const { paths } = JSON.parse(body || "{}");
      json(200, (paths ?? []).map((path) => ({ path, signedURL: `/object/sign/ai-images/${path}?token=t`, error: null })));
      return true;
    }
    if (req.method === "POST" && p.startsWith("/storage/v1/object/sign/ai-images/")) {
      signs++;
      json(200, { signedURL: `${p.slice("/storage/v1".length)}?token=t` });
      return true;
    }
    if (req.method === "GET" && p.startsWith("/storage/v1/object/sign/ai-images/")) {
      const name = url.searchParams.get("download");
      res.writeHead(200, { "Content-Type": "image/png", ...(name ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } : {}) });
      res.end(PNG);
      return true;
    }
    if (req.method === "DELETE" && p === "/storage/v1/object/ai-images") {
      removed.push(...(JSON.parse(body || "{}").prefixes ?? []));
      json(200, []);
      return true;
    }
    return false;
  },
});
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));
const signed = (path) => `${supa.url}/storage/v1/object/sign/ai-images/${path}?token=t`;
const shownOf = (id, prompt, aspect, full = []) => ({
  id, prompt, aspect, createdAt: "2026-10-07T11:00:00Z",
  variants: [0, 1, 2, 3].map((n) => ({ index: n, url: signed(pathOf(id, n)), full: full.includes(n) })),
});

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
  GEMINI_API_KEY: "",
  GOOGLE_API_KEY: "",
};

const el = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.images;
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
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, acceptDownloads: true });
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

async function say(page, press, text) {
  const field = page.locator("textarea").first();
  await field.fill(text);
  await press(page.locator('button[type="submit"]').first());
}

/** A large amount asks once more; this answers it when it does. */
async function confirmIfAsked(page, press) {
  const go = page.locator('[role="dialog"] button').last();
  if (await go.isVisible().catch(() => false)) await press(go);
}

const loaded = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-testid="image-grid"] img')].map((img) => img.complete && img.naturalWidth > 0));

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
  const staff = { ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email };
  const ON = await start({ ...staff, GEMINI_API_KEY: "placeholder-never-sent" });
  const NOKEY = await start(staff);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    setFlags({ "image-studio": "staff" });
    removed.length = 0;
    const { context, page, press } = await open(ON, device);
    const asked = { generate: [], edit: [], full: [] };
    let generateAnswer = () => ({ status: 200, body: { ok: true, image: shownOf(NEW, "Βάρκα στο λιμάνι", "16:9"), made: 4, creditsCharged: 36 } });
    await page.route("**/api/images/generate", (r) => {
      asked.generate.push(r.request().postDataJSON());
      const a = generateAnswer();
      return a.abort ? r.abort("internetdisconnected") : r.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.body) });
    });
    await page.route(`**/api/images/${NEW}/edit`, (r) => {
      asked.edit.push(r.request().postDataJSON());
      const image = shownOf(NEW, "Βάρκα στο λιμάνι", "16:9");
      image.variants[1].url = signed(pathOf(NEW, 1, "v1-changed"));
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, image, creditsCharged: 9 }) });
    });
    await page.route(`**/api/images/${NEW}/full`, (r) => {
      asked.full.push(r.request().postDataJSON());
      const url = `${signed(pathOf(NEW, 1, "v1-full"))}&download=${encodeURIComponent("Βάρκα-στο-λιμάνι-2-full.png")}`;
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, url, creditsCharged: 56 }) });
    });

    await page.goto(`${ON}/dashboard/images`, { waitUntil: "networkidle" });
    const main = await page.locator("main").innerText();
    check("the Image tool opens, with what it does and its price before anything is spent",
      main.includes(el.name) && main.includes(el.help) && (await page.locator('[data-testid="image-price"]').innerText()).startsWith(fill(el.priceVariants, { n: 4, count: "" }).split(":")[0]) && /\d/.test(await page.locator('[data-testid="image-price"]').innerText()));

    // ---- what was made before: read, signed, drawn
    await press(page.locator('[data-testid="image-recent-open"]'));
    await page.locator('[data-testid="image-recent"] button').first().waitFor({ timeout: 10000 }).catch(() => null);
    check("an earlier image is in the list", (await page.locator('[data-testid="image-recent"] button').count()) === 1);
    await press(page.locator('[data-testid="image-recent"] button').first());
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="image-grid"] img').length === 4, null, { timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(300);
    const oldLoaded = await loaded(page);
    check("...its four pictures, each signed by the server and drawn", oldLoaded.length === 4 && oldLoaded.every(Boolean), JSON.stringify(oldLoaded));

    // ---- four from one description, in the chosen shape
    if (device.touch) await press(page.locator('[data-testid="tool-shell-back"]')).catch(() => null);
    await press(page.locator('[data-testid="image-aspect"]'));
    await press(page.getByText(el.aspects.wide, { exact: true }));
    await say(page, press, "Βάρκα στο λιμάνι");
    await page.waitForTimeout(300);
    await confirmIfAsked(page, press);
    await page.waitForFunction((src) => [...document.querySelectorAll('[data-testid="image-grid"] img')].some((i) => i.src.includes(src)), NEW, { timeout: 10000 }).catch(() => null);
    check("the description goes once, with the shape chosen", asked.generate.length === 1 && asked.generate[0].description === "Βάρκα στο λιμάνι" && asked.generate[0].aspect === "16:9", JSON.stringify(asked.generate));
    await page.waitForTimeout(300);
    const newLoaded = await loaded(page);
    check("...four pictures open beside it", newLoaded.length === 4 && newLoaded.every(Boolean), JSON.stringify(newLoaded));
    check("...and the conversation says how many were made", (await page.locator('[data-testid="tool-shell-thread"]').innerText()).includes(fill(el.made, { made: 4, asked: 4 })) || (await page.locator("main").innerText()).includes(fill(el.made, { made: 4, asked: 4 })));

    // ---- one chosen, changed with words
    const second = page.locator('[data-testid="image-variant"]').nth(1);
    const box = await second.boundingBox();
    check("a picture is a large target", box && box.height >= 44 && box.width >= 44, JSON.stringify(box));
    await press(second);
    check("pressing one chooses it", (await second.getAttribute("aria-pressed")) === "true");
    const dl = page.locator('[data-testid="image-download"]');
    check("...with its download, as it is", (await dl.getAttribute("href")) === `/api/images/${NEW}/download?variant=1`);
    const fullButton = page.locator('[data-testid="image-full"]');
    check("...and the largest size, with its price on the button", (await fullButton.innerText()).includes(el.fullMake) && /\d/.test(await fullButton.innerText()));
    if (device.touch) await press(page.locator('[data-testid="tool-shell-back"]')).catch(() => null);
    check("the field now changes that picture alone", (await page.locator("textarea").first().getAttribute("placeholder")) === fill(el.placeholderEdit, { n: 2 }) && (await page.locator('[data-testid="box-chosen"]').count()) === 1);
    await say(page, press, "πιο ζεστά χρώματα");
    await page.waitForTimeout(300);
    await confirmIfAsked(page, press);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="image-grid"] img')].some((i) => i.src.includes("v1-changed")), null, { timeout: 10000 }).catch(() => null);
    check("the words go to that picture, and only the description was not sent again",
      asked.edit.length === 1 && asked.edit[0].variant === 1 && asked.edit[0].instruction === "πιο ζεστά χρώματα" && asked.generate.length === 1, JSON.stringify(asked));
    check("...and it says only that one changed", (await page.locator("main").innerText()).includes(fill(el.changed, { n: 2 })));
    const changed = await page.evaluate(() => [...document.querySelectorAll('[data-testid="image-grid"] img')].map((i) => i.src.includes("v1-changed")));
    check("...the other three are as they were", JSON.stringify(changed) === JSON.stringify([false, true, false, false]), JSON.stringify(changed));

    // ---- the largest size, saved under a readable name
    if (device.touch && !(await page.locator('[data-testid="image-full"]').isVisible().catch(() => false))) {
      await press(page.locator('[data-testid="tool-shell-card"]').last());
    }
    if ((await page.locator('[data-testid="image-variant"]').nth(1).getAttribute("aria-pressed")) !== "true") await press(page.locator('[data-testid="image-variant"]').nth(1));
    const downloadP = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
    await press(page.locator('[data-testid="image-full"]'));
    await page.waitForTimeout(300);
    await confirmIfAsked(page, press);
    const download = await downloadP;
    check("the largest size is asked for that picture", asked.full.length === 1 && asked.full[0].variant === 1, JSON.stringify(asked.full));
    // THE NAME IS IN THE ADDRESS the app builds; storage turns it into the
    // header that names the file. Headless Chromium reports "download" for
    // the suggested name whatever that header says (measured here,
    // 2026-10-07, as it did for package 10's blobs), so the address is
    // what is read.
    check("...and is saved, under the description's words",
      Boolean(download) && decodeURIComponent(new URL(download.url()).searchParams.get("download") ?? "") === "Βάρκα-στο-λιμάνι-2-full.png", download?.url());
    check("...and the page stayed where it was", new URL(page.url()).pathname === "/dashboard/images");

    // ---- the download route, the app's own
    const viaRoute = await page.request.get(`${ON}/api/images/${OLD}/download?variant=2`, { maxRedirects: 0 });
    const location = viaRoute.headers().location ?? "";
    check("a picture is saved through the route: a redirect to a short signed address, never cached",
      viaRoute.status() === 302 && location.startsWith(`${supa.url}/storage/v1/object/sign/ai-images/${pathOf(OLD, 2)}?token=`) && viaRoute.headers()["cache-control"] === "no-store", `${viaRoute.status()} ${location}`);
    check("...that saves it under the description's words", decodeURIComponent(new URL(location).searchParams.get("download") ?? "") === "Ένα-κάμπινγκ-στη-Νάξο-το-σούρουπο-3.png", location);
    check("...and the largest size of a picture that has none is refused", (await page.request.get(`${ON}/api/images/${OLD}/download?variant=2&size=full`, { maxRedirects: 0 })).status() === 404);

    // ---- what goes wrong is said
    generateAnswer = () => ({ status: 422, body: { ok: false, code: "refused" } });
    if (await page.locator('[data-testid="box-clear"]').isVisible().catch(() => false)) await press(page.locator('[data-testid="box-clear"]'));
    await say(page, press, "κάτι που ο πάροχος αρνείται");
    await page.waitForTimeout(300);
    await confirmIfAsked(page, press);
    await page.waitForTimeout(800);
    check("the provider declining is said as declined, and as free", (await page.locator("main").innerText()).includes(el.errors.refused));
    generateAnswer = () => ({ abort: true });
    await say(page, press, "χωρίς σύνδεση");
    await page.waitForTimeout(300);
    await confirmIfAsked(page, press);
    await page.waitForTimeout(800);
    check("offline is said", (await page.locator("main").innerText()).includes(el.errors.offline));

    // ---- delete: every picture it names, then the row
    await press(page.locator('[data-testid="image-recent-open"]'));
    await page.locator('[data-testid="image-recent"] button').first().waitFor({ timeout: 10000 }).catch(() => null);
    await press(page.locator('[data-testid="image-recent"] button').last());
    await page.locator('[data-testid="image-delete"]').waitFor({ timeout: 10000 }).catch(() => null);
    page.once("dialog", (d) => d.accept());
    const deleted = page.waitForResponse((r) => r.url().endsWith(`/api/images/${OLD}`) && r.request().method() === "DELETE", { timeout: 10000 }).catch(() => null);
    await press(page.locator('[data-testid="image-delete"]'));
    const answer = await deleted;
    check("deleting an image goes through the route, and empties the bucket of every picture it names first",
      answer?.status() === 200 && [...OLD_ROW.variants.map((v) => v.path), pathOf(OLD, 1, "old")].every((p) => removed.includes(p)), JSON.stringify(removed));

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // ---- no key: said, nothing sent, nothing charged
  console.log("\n== no key, phone ==");
  {
    setFlags({ "image-studio": "staff" });
    const { context, page, press } = await open(NOKEY, { viewport: { width: 390, height: 844 }, touch: true });
    let sent = 0;
    await page.route("**/api/images/**", (r) => { sent++; return r.continue(); });
    await page.goto(`${NOKEY}/dashboard/images`, { waitUntil: "networkidle" });
    check("without the provider's key the page says so", (await page.locator('[data-testid="image-not-configured"]').innerText()) === el.notConfigured);
    await say(page, press, "Βάρκα στο λιμάνι");
    await page.waitForTimeout(500);
    check("...and a description is answered with that, sending nothing", sent === 0 && (await page.locator('[data-testid="tool-shell-thread"]').innerText()).includes(el.notConfigured));
    const direct = await page.request.post(`${NOKEY}/api/images/generate`, { data: { description: "Βάρκα στο λιμάνι", aspect: "1:1" } });
    check("...the route itself refuses before it asks anything", direct.status() === 503 && (await direct.json()).code === "not_configured");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // ---- the switch off: the page everybody else has
  console.log("\n== the switch off, desktop ==");
  {
    setFlags({ "image-studio": "off" });
    const { context, page } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${ON}/dashboard/images`, { waitUntil: "networkidle" });
    check("with the switch off the page is the list it always was", (await page.locator('[data-testid="image-grid"], [data-testid="image-price"]').count()) === 0 && (await page.locator("main").count()) === 1);
    const refusedRoute = await page.request.post(`${ON}/api/images/generate`, { data: { description: "Βάρκα στο λιμάνι", aspect: "1:1" } });
    check("...and the routes refuse", refusedRoute.status() === 403 && (await refusedRoute.json()).code === "not_enabled");
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
