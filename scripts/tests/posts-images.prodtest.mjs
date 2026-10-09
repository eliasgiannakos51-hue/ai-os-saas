/*
 * POSTS FOR THREE PLATFORMS, EACH WITH ITS PICTURE AT THE RIGHT SIZE — IN
 * THE BUILT APP (MASTER 16, package 15).
 *
 * Run: node scripts/tests/posts-images.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/posts-images.prodtest.mjs
 *
 * One production build, the real routes: the person's photo is put in
 * their own folder of create-attachments from the browser, api/posts/
 * generate writes LinkedIn, X and Instagram with it, and api/posts/[id]/
 * image cuts it for each — read back here with sharp, pixel for pixel, and
 * downloaded as the file the person keeps. The model is a local server
 * answering as Anthropic does (ANTHROPIC_BASE_URL); the database and the
 * storage are the stand-in, which keeps the rows and serves the photo.
 *
 * WHAT THIS DOES NOT REACH: Unsplash. Its address is fixed in
 * lib/unsplash.ts and this machine has no key, so the Unsplash choice is
 * checked as ABSENT without the key, and a stored Unsplash set is checked
 * for its credit; the photo itself is not fetched here.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch. In Greek, then
 * English on a computer. Around it: the provider down, no credits left, a
 * Free account, the switch off, a photo from another folder, a set that is
 * somebody else's.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

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

const SIZES = { linkedin: [1200, 627], x: [1600, 900], instagram: [1080, 1350] };

// A wide photo with its subject — red and yellow, busy — at the right edge.
const PHOTO = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: { r: 120, g: 130, b: 140 } } })
  .composite([
    {
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360">${Array.from({ length: 18 }, (_, i) => `<rect x="0" y="${i * 20}" width="360" height="10" fill="${i % 2 ? "#ff0000" : "#ffee00"}"/>`).join("")}</svg>`),
      left: 1980,
      top: 420,
    },
  ])
  .jpeg()
  .toBuffer();
const redShare = async (jpeg) => {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  let red = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] > 200 && data[i + 2] < 80) red++;
  return red / (info.width * info.height);
};

// ---------------------------------------------------------------------
// generated_posts as rows; create-attachments as a folder.
// ---------------------------------------------------------------------
const posts = [];
const uploads = [];
const removals = [];
let seq = 0;
const uuid = () => `${String(++seq).padStart(8, "0")}-0000-4000-8000-0000000000b5`;
const STORAGE = "/storage/v1/object/create-attachments";
function handle({ req, res, url, body, json }) {
  if (url.pathname === "/rest/v1/rpc/consume_rate_limit") return json(200, true), true;
  if (url.pathname.startsWith(`${STORAGE}/`)) {
    const path = decodeURIComponent(url.pathname.slice(STORAGE.length + 1));
    if (req.method === "POST") {
      uploads.push(path);
      return json(200, { Key: `create-attachments/${path}`, Id: `obj-${uploads.length}` }), true;
    }
    if (req.method === "GET") {
      if (!uploads.includes(path) || removals.includes(path)) return json(404, { statusCode: "404", error: "not_found", message: "Object not found" }), true;
      res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": String(PHOTO.length) });
      return res.end(PHOTO), true;
    }
  }
  if (url.pathname === STORAGE && req.method === "DELETE") {
    let prefixes = [];
    try { prefixes = JSON.parse(body || "{}").prefixes ?? []; } catch {}
    removals.push(...prefixes);
    return json(200, prefixes.map((name) => ({ name }))), true;
  }
  if (url.pathname !== "/rest/v1/generated_posts") return false;
  const hit = posts.filter((r) => [...url.searchParams].every(([k, v]) => !v.startsWith("eq.") || String(r[k]) === v.slice(3)));
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
  if (req.method === "GET") return answer([...hit].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))), true;
  if (req.method === "POST") {
    const made = (Array.isArray(JSON.parse(body)) ? JSON.parse(body) : [JSON.parse(body)]).map((r) => ({ id: uuid(), created_at: new Date(Date.now() + seq).toISOString(), ...r }));
    posts.push(...made);
    return answer(made), true;
  }
  if (req.method === "PATCH") {
    for (const r of hit) Object.assign(r, JSON.parse(body || "{}"));
    return answer(hit), true;
  }
  if (req.method === "DELETE") {
    for (const r of hit) posts.splice(posts.indexOf(r), 1);
    return answer(hit), true;
  }
  return false;
}

const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({ port: 54401, tableRows: { feature_flags: flags, user_credits: credits }, handle });
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

// ---------------------------------------------------------------------
// The model: one post per platform it was asked for.
// ---------------------------------------------------------------------
const WORDS = {
  linkedin: { text: "Το φθινοπωρινό μας μενού είναι εδώ: τρία νέα πιάτα από τον Οκτώβριο.", hashtags: ["εστίαση"] },
  x: { text: "Νέο φθινοπωρινό μενού. Τρία πιάτα, από σήμερα.", hashtags: [] },
  instagram: { text: "Φθινόπωρο στο πιάτο 🍂 Τρία νέα πιάτα σε περιμένουν.", hashtags: ["φθινόπωρο", "ταβέρνα"] },
  facebook: { text: "Το νέο μας μενού είναι έτοιμο.", hashtags: [] },
  threads: { text: "Νέο μενού, τρία πιάτα.", hashtags: [] },
};
const modelAsked = [];
const model = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const sent = JSON.parse(body || "{}");
    modelAsked.push(sent);
    const words = JSON.stringify(sent.messages ?? []);
    if (words.includes("ΣΦΑΛΜΑ ΠΑΡΟΧΟΥ")) {
      res.writeHead(529, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
    }
    const asked = (words.match(/Write posts for: ([a-z, ]+)\./) ?? [])[1]?.split(", ") ?? ["linkedin"];
    const english = /Write them in English/.test(words);
    const input = {
      posts: asked.map((platform) => ({ platform, ...(english ? { text: "Our autumn menu is here: three new dishes.", hashtags: [] } : WORDS[platform]) })),
      imageQuery: /imageQuery/.test(words) ? "autumn taverna table" : null,
    };
    res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
    res.end(JSON.stringify({ id: "msg", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "tool_use", id: "t", name: "write_posts", input }], stop_reason: "tool_use", usage: { input_tokens: 900, output_tokens: 300 } }));
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
  UNSPLASH_ACCESS_KEY: "",
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${model.address().port}`,
};
const msgs = (loc) => JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
const EL = msgs("el");
const EN = msgs("en");
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

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
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, acceptDownloads: true });
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
async function say(page, press, text) {
  await page.locator("textarea").first().fill(text);
  await press(page.locator('button[type="submit"]').first());
}
/** Only LinkedIn, X and Instagram: two of the five unticked. */
async function chooseThree(page, press) {
  await press(page.locator('[data-testid="posts-platforms"]'));
  for (const name of ["Facebook", "Threads"]) await press(page.locator("fieldset label").filter({ hasText: name }).locator('input[type="checkbox"]'));
  await press(page.locator('[data-testid="posts-platforms"]'));
}
async function chooseOwnPhoto(page, press, M) {
  await press(page.locator('[data-testid="posts-picture"]'));
  await press(page.locator("fieldset label").filter({ hasText: M.posts.picture.own }).locator('input[type="radio"]'));
  await page.locator('[data-testid="composer-attach-input"]').setInputFiles([{ name: "taverna.jpg", mimeType: "image/jpeg", buffer: PHOTO }]);
  await page.locator('[data-testid="posts-photo-chip"]').waitFor({ timeout: 10_000 });
}
const saved = () => posts.filter((p) => p.status === "done").at(-1);

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
  // The owner's account, not charged; CHARGED is the same build for an ordinary one.
  const ON = await start({ ...base, ADMIN_EMAILS: MOCK_USER.email, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  const CHARGED = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label}: three platforms, the person's own photo, each picture at its size ==`);
    setFlags({});
    posts.length = 0;
    uploads.length = 0;
    removals.length = 0;
    const { context, page, press } = await open(ON, device);
    await page.goto(`${ON}/dashboard/posts`, { waitUntil: "networkidle" });
    check("Posts opens in the shell, with a picture option under the field", (await page.locator('[data-testid="tool-shell"]').count()) === 1 && (await page.locator('[data-testid="posts-picture"]').innerText()).includes(EL.posts.picture.option));
    await press(page.locator('[data-testid="posts-recent"]'));
    check("a new account has written nothing, and is told so", (await page.locator('[data-testid="tool-shell-work"]').innerText()).includes(EL.posts.history.empty));
    await press(page.locator('[data-testid="tool-shell-close"]:visible, [data-testid="tool-shell-back"]:visible').first());

    await press(page.locator('[data-testid="posts-picture"]'));
    const choices = await page.locator('fieldset input[name="posts-picture-source"]').count();
    check(`without an Unsplash key, the choices are none and own photo (${choices})`, choices === 2 && (await page.locator("fieldset label").filter({ hasText: EL.posts.picture.unsplash }).count()) === 0);
    await press(page.locator('[data-testid="posts-picture"]'));
    check("no «+» in the field until the person's own photo is chosen", (await page.locator('[data-testid="composer-attach"]').count()) === 0);

    await chooseThree(page, press);
    check("three platforms chosen", (await page.locator('[data-testid="posts-platforms"]').innerText()).includes("3"));
    await chooseOwnPhoto(page, press, EL);
    check("the photo is held under the field, named, before anything is sent", (await page.locator('[data-testid="posts-photo-chip"]').innerText()).includes("taverna.jpg") && uploads.length === 0);

    const asked = modelAsked.length;
    await say(page, press, "Νέο φθινοπωρινό μενού στην ταβέρνα μας, τρία πιάτα");
    await page.locator('[data-testid="post-picture"]').nth(2).waitFor({ timeout: 60_000 });
    check("the photo was put in the person's own folder, once", uploads.length === 1 && uploads[0].startsWith(`${MOCK_USER.id}/`) && /taverna\.jpg$/.test(uploads[0]), uploads.join(", "));
    const words = JSON.stringify(modelAsked[asked]?.messages ?? []);
    check("the model was asked once, for these three, and not for search words", modelAsked.length === asked + 1 && /Write posts for: linkedin, x, instagram\./.test(words) && !/imageQuery/.test(words));
    check("the set is saved with the photo on it", saved()?.posts?.image?.kind === "own" && saved().posts.image.path === uploads[0] && saved().user_id === MOCK_USER.id);

    const pictures = page.locator('[data-testid="post-picture"]');
    check(`one picture per post (${await pictures.count()})`, (await pictures.count()) === 3);
    for (const platform of ["linkedin", "x", "instagram"]) {
      const figure = page.locator(`[data-testid="post-picture"][data-platform="${platform}"]`);
      const img = figure.locator("img");
      const src = await img.getAttribute("src");
      const got = await page.request.get(`${ON}${src}`);
      const bytes = Buffer.from(await got.body());
      const meta = got.ok() ? await sharp(bytes).metadata() : {};
      const [w, h] = SIZES[platform];
      check(`${platform}: the picture is exactly ${w} x ${h}, a JPEG`, got.ok() && meta.width === w && meta.height === h && meta.format === "jpeg", `${got.status()} ${meta.width}x${meta.height} ${meta.format}`);
      await img.evaluate((e) => e.scrollIntoView({ block: "center" }));
      const box = await img.boundingBox();
      check(`${platform}: drawn at its own shape on the screen (${Math.round(box?.width ?? 0)} x ${Math.round(box?.height ?? 0)})`, box && Math.abs(box.width / box.height - w / h) < 0.03 && box.width <= device.viewport.width);
      check(`${platform}: its size is written under it`, (await figure.innerText()).includes(`${w} × ${h}`));
    }
    // The download: the file the person keeps, named for what it is.
    const download = page.locator('[data-testid="post-picture"][data-platform="instagram"] [data-testid="post-picture-download"]');
    check("the download names its platform", (await download.innerText()).includes(fill(EL.posts.picture.download, { platform: "Instagram" })));
    const [file] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), press(download)]);
    const kept = readFileSync(await file.path());
    const keptMeta = await sharp(kept).metadata();
    check(`Instagram downloads as ${file.suggestedFilename()}, 1080 x 1350`, file.suggestedFilename() === "instagram-1080x1350.jpg" && keptMeta.width === 1080 && keptMeta.height === 1350);
    const share = await redShare(kept);
    // A centre cut keeps none of it (0%): the subject sits outside the middle third.
    check(`...with the subject at the photo's edge still in it (${(share * 100).toFixed(1)}%)`, share > 0.02);
    check("the photo is no longer held under the field", (await page.locator('[data-testid="posts-photo-chip"]').count()) === 0);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

    // ---- the provider down: said, and the photo taken back out
    if (device.touch && (await page.locator('[data-testid="tool-shell-back"]').isVisible())) await press(page.locator('[data-testid="tool-shell-back"]'));
    await chooseOwnPhoto(page, press, EL);
    const removedBefore = removals.length;
    await say(page, press, "Νέο μενού — ΣΦΑΛΜΑ ΠΑΡΟΧΟΥ");
    await page.getByText(EL.posts.errors.unavailable).first().waitFor({ timeout: 90_000 });
    check("the provider down: said, and the photo uploaded for it is removed", removals.length === removedBefore + 1 && removals.at(-1) === uploads.at(-1), removals.slice(-2).join(", "));

    // ---- deleting the posts deletes their photo
    await page.goto(`${ON}/dashboard/posts`, { waitUntil: "networkidle" });
    await press(page.locator('[data-testid="posts-recent"]'));
    const first = saved();
    const deletesBefore = removals.length;
    await press(page.locator('[data-testid="tool-shell-work"] li').filter({ hasText: first.description }).locator("button").last());
    await page.waitForTimeout(800);
    check("deleting the posts deletes the photo they held", !posts.includes(first) && removals.length === deletesBefore + 1 && removals.at(-1) === first.posts.image.path, removals.slice(-2).join(", "));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== in English, desktop: no picture, and a stored Unsplash photo credited ==");
  {
    posts.length = 0;
    const { context, page, press } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false }, "en");
    await page.goto(`${ON}/dashboard/posts`, { waitUntil: "networkidle" });
    check("the picture option speaks English", (await page.locator('[data-testid="posts-picture"]').innerText()).includes(EN.posts.picture.option));
    await say(page, press, "Our autumn menu at the taverna, three dishes");
    await page.locator('[data-testid="posts-result"]').waitFor({ timeout: 60_000 });
    check("no picture asked for: none drawn, none uploaded", (await page.locator('[data-testid="post-picture"]').count()) === 0 && saved() && !saved().posts.image);
    const body = await page.locator("main").innerText();
    check("no Greek on the English screen", !/[Ͱ-Ͽ]/.test(body), body.match(/.{0,30}[Ͱ-Ͽ].{0,30}/)?.[0]);
    // A set made where Unsplash was configured, opened from the Library.
    posts.push({ id: uuid(), user_id: MOCK_USER.id, description: "Autumn menu", platforms: ["linkedin"], status: "done", credits_charged: 4, created_at: new Date().toISOString(), posts: { version: 1, locale: "en", posts: [{ platform: "linkedin", text: "Our autumn menu is here.", hashtags: [] }], image: { kind: "unsplash", url: "https://images.unsplash.com/photo-1?ixid=a", photographerName: "Ann Example", photographerUrl: "https://unsplash.com/@annexample", downloadLocation: "https://api.unsplash.com/photos/1/download" } } });
    await page.goto(`${ON}/dashboard/posts?record=${posts.at(-1).id}`, { waitUntil: "networkidle" });
    const credit = page.locator('[data-testid="post-picture"] figcaption');
    check("an Unsplash photo names its photographer and Unsplash", (await credit.innerText()).includes("Ann Example") && (await credit.innerText()).includes("Unsplash"));
    const links = await credit.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    check("...both linked, as Unsplash asks", links.some((h) => /^https:\/\/unsplash\.com\/@annexample\?utm_source=ionexa&utm_medium=referral/.test(h ?? "")) && links.some((h) => /^https:\/\/unsplash\.com\/?\?utm_source=ionexa/.test(h ?? "")), links.join(" | "));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== somebody else's photo, somebody else's posts ==");
  {
    const { context, page } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${ON}/dashboard/posts`, { waitUntil: "networkidle" });
    const asked = modelAsked.length;
    const foreign = await page.request.post(`${ON}/api/posts/generate`, { data: { description: "Νέο φθινοπωρινό μενού στην ταβέρνα", platforms: ["x"], locale: "el", image: { source: "own", path: "00000000-0000-4000-8000-000000000999/a.jpg" } } });
    check("a photo from another person's folder is refused, before the model", foreign.status() === 400 && (await foreign.json()).error === "bad_image_path" && modelAsked.length === asked);
    const climbing = await page.request.post(`${ON}/api/posts/generate`, { data: { description: "Νέο φθινοπωρινό μενού στην ταβέρνα", platforms: ["x"], locale: "el", image: { source: "own", path: `${MOCK_USER.id}/../other/a.jpg` } } });
    check("...and so is a path that climbs out of the person's own", climbing.status() === 400 && modelAsked.length === asked);
    uploads.push("00000000-0000-4000-8000-000000000999/b.jpg");
    const theirs = { id: uuid(), user_id: "00000000-0000-4000-8000-000000000999", description: "x", platforms: ["x"], status: "done", created_at: new Date().toISOString(), posts: { version: 1, locale: "el", posts: [{ platform: "x", text: "Δικό τους.", hashtags: [] }], image: { kind: "own", path: "00000000-0000-4000-8000-000000000999/b.jpg" } } };
    posts.push(theirs);
    const peek = await page.request.get(`${ON}/api/posts/${theirs.id}/image?platform=x`);
    check("somebody else's posts give no picture", peek.status() === 404);
    posts.splice(posts.indexOf(theirs), 1);
    const bad = await page.request.get(`${ON}/api/posts/${uuid()}/image?platform=tiktok`);
    check("a platform that is not one is refused", bad.status() === 400);
    await context.close();
  }

  console.log("\n== an ordinary account: no credits left, then a Free plan ==");
  {
    credits[0].credits_remaining = 0;
    const { context, page, press } = await open(CHARGED, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${CHARGED}/dashboard/posts`, { waitUntil: "networkidle" });
    await chooseOwnPhoto(page, press, EL);
    const asked = modelAsked.length;
    const removedBefore = removals.length;
    await say(page, press, "Νέο φθινοπωρινό μενού στην ταβέρνα μας");
    await page.getByText(EL.posts.errors.insufficient).first().waitFor({ timeout: 30_000 });
    check("no credits left: said before the model is asked", modelAsked.length === asked);
    check("...and the photo uploaded for it is removed", removals.length === removedBefore + 1);
    check("...and still held under the field, to send again", (await page.locator('[data-testid="posts-photo-chip"]').count()) === 1);
    credits[0].credits_remaining = 3000;
    MOCK_USER.user_metadata = { subscription_tier: "free" };
    await page.goto(`${CHARGED}/dashboard/posts`, { waitUntil: "networkidle" });
    check("a Free account sees the plan wall, not a picture option it cannot use", (await page.locator('[data-testid="posts-picture"]').count()) === 0 && (await page.locator('[data-testid="tool-shell"]').count()) === 0);
    const refused = await page.request.post(`${CHARGED}/api/posts/generate`, { data: { description: "Νέο φθινοπωρινό μενού στην ταβέρνα", platforms: ["x"], locale: "el", image: { source: "own", path: `${MOCK_USER.id}/a.jpg` } } });
    check("...and the route refuses it", refused.status() === 403 && (await refused.json()).code === "not_included");
    MOCK_USER.user_metadata = { subscription_tier: "growth" };
    await context.close();
  }

  console.log("\n== the switch off, phone ==");
  {
    setFlags({ "posts-images": "off" });
    const { context, page } = await open(ON, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${ON}/dashboard/posts`, { waitUntil: "networkidle" });
    check("with the switch off, Posts is as it was: no picture option", (await page.locator('[data-testid="tool-shell"]').count()) === 1 && (await page.locator('[data-testid="posts-picture"]').count()) === 0);
    const asked = modelAsked.length;
    const refused = await page.request.post(`${ON}/api/posts/generate`, { data: { description: "Νέο φθινοπωρινό μενού στην ταβέρνα", platforms: ["x"], locale: "el", image: { source: "own", path: `${MOCK_USER.id}/a.jpg` } } });
    check("...a picture asked of the route is refused, before the model", refused.status() === 403 && (await refused.json()).error === "not_enabled" && modelAsked.length === asked);
    const set = posts.find((p) => p.posts?.image?.kind === "unsplash");
    const cut = await page.request.get(`${ON}/api/posts/${set?.id}/image?platform=linkedin`);
    check("...and so is a picture of a set made before", cut.status() === 403);
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
