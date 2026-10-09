/*
 * A GAME DESCRIBED, PLANNED IN BOXES, BUILT, PLAYED SEALED, CHANGED,
 * STEPPED BACK AND DOWNLOADED — IN THE BUILT APP (MASTER 16, package 26).
 *
 * Run: node scripts/tests/games.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/games.prodtest.mjs
 *
 * One production build, the real routes (api/games, api/games/[id],
 * api/games/[id]/download), pressed from /dashboard/games. The model is a
 * local server answering as Anthropic does (ANTHROPIC_BASE_URL); the
 * database is the stand-in, keeping the rows the routes write, the holds
 * they take and the charges they settle.
 *
 * THE SEAL IS MEASURED IN THE BROWSER, NOT READ IN THE SOURCE. The game the
 * model writes passes the check (it names no network call the check knows)
 * and then, from a script placed BEFORE its own <head>, asks a local
 * server for an image and reaches for the page that holds it. The server
 * must hear nothing, and the page must be out of reach — while the game's
 * own code runs, keeps score by keyboard on a computer and by touch on a
 * phone.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch, in Greek; the
 * screen in English on a computer. Around it: the provider down, an answer
 * that is not a playable game, no credits left, a Free account, another
 * person's game, the switch off.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { loadTs } from "./load-ts.mjs";

// The stand-in model reads the request the way the routes write it: the
// language named by lib/text/language-name.ts, and a change told apart
// from a build by carrying TWO fenced parts (the game, then the words).
const { languageNameFor } = await loadTs("src/lib/text/language-name.ts");
const { UNTRUSTED_OPEN } = await loadTs("src/lib/agents/agent-config.ts");

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
// The leak server: a game that escaped its seal would be heard here.
// ---------------------------------------------------------------------
const heard = [];
const leak = http.createServer((req, res) => {
  heard.push(req.url);
  res.writeHead(200, { "Content-Type": "image/gif" });
  res.end();
});
await new Promise((r) => leak.listen(0, "127.0.0.1", r));
const LEAK = `http://127.0.0.1:${leak.address().port}`;

// ---------------------------------------------------------------------
// The database: the person's games, and one that is somebody else's.
// ---------------------------------------------------------------------
const OTHER_ID = "00000000-0000-4000-8000-00000000beef";
const store = { user_games: [] };
const PLAN_OTHER = { title: "Ξένο", boxes: ["rules", "levels", "characters", "controls", "win"].map((kind) => ({ kind, text: `${kind} άλλου` })) };
function reset() {
  store.user_games.splice(0, Infinity, { id: OTHER_ID, user_id: "00000000-0000-4000-8000-0000000000ff", title: "Ξένο", description: "", locale: "el", plan: PLAN_OTHER, html: "<html><script>1</script></html>", versions: [], created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" });
}
let seq = 0;
const uuid = () => `${String(++seq).padStart(8, "0")}-0000-4000-8000-0000000000aa`;
function matches(row, url) {
  for (const [k, v] of url.searchParams) {
    if (v.startsWith("eq.") && String(row[k]) !== v.slice(3)) return false;
  }
  return true;
}
const reserved = [];
const settled = [];
const released = [];
function rest({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (table === "rpc/reserve_credits") {
    const args = JSON.parse(body || "{}");
    const enough = credits[0].credits_remaining >= Number(args.p_credits ?? 0);
    if (enough) reserved.push(args);
    return json(200, enough ? [{ reservation_id: uuid(), available: credits[0].credits_remaining }] : []), true;
  }
  if (table === "rpc/settle_reservation") return settled.push(JSON.parse(body || "{}")), json(200, null), true;
  if (table === "rpc/release_reservation") return released.push(JSON.parse(body || "{}")), json(200, null), true;
  if (!(table in store)) return false;
  const rows = store[table];
  const hit = rows.filter((r) => matches(r, url));
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
  if (req.method === "GET") return answer([...hit].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))), true;
  if (req.method === "POST") {
    const input = JSON.parse(body || "[]");
    const made = (Array.isArray(input) ? input : [input]).map((r) => ({ id: uuid(), html: null, versions: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }));
    rows.push(...made);
    return answer(made), true;
  }
  if (req.method === "PATCH") {
    for (const r of hit) Object.assign(r, JSON.parse(body || "{}"));
    return answer(hit), true;
  }
  if (req.method === "DELETE") {
    for (const r of hit) rows.splice(rows.indexOf(r), 1);
    return json(204, null), true;
  }
  return false;
}

const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({ port: 54413, tableRows: { feature_flags: flags, user_credits: credits }, handle: rest });
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

// ---------------------------------------------------------------------
// The model: a plan in the language it is asked for, one box rewritten,
// and a game whose first script tries to get out.
// ---------------------------------------------------------------------
const PLANS = {
  Greek: { title: "Πουλί στον ουρανό", boxes: { rules: "Ένα πουλί πετά ανάμεσα σε σωλήνες.", levels: "Τρία επίπεδα.", characters: "Το πουλί και τα σύννεφα.", controls: "Space ή το μεγάλο κουμπί ▲.", win: "Μαζεύεις 5 πόντους." } },
  English: { title: "Bird in the sky", boxes: { rules: "A bird flies between pipes.", levels: "Three levels.", characters: "The bird and the clouds.", controls: "Space or the big ▲ button.", win: "Collect 5 points." } },
};
const NEW_LEVELS = "Πέντε επίπεδα, το τελευταίο με καταιγίδα.";
const game = (version, background) => `<!DOCTYPE html>
<html lang="el"><script>
  // Before the head: the place a seal written after <head> would not cover.
  new Image().src = "${LEAK}/early?v=${version}";
  try { const up = window["par" + "ent"]; document.documentElement.dataset.parent = String(up.document.title); } catch (e) { document.documentElement.dataset.parent = "blocked"; }
</script><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Πουλί</title>
<style>html,body{margin:0;height:100%;background:${background}}#up{position:fixed;right:16px;bottom:16px;width:96px;height:96px;font-size:40px}</style></head>
<body><header>Σκορ: <span id="score">0</span></header><canvas id="c" width="320" height="200" tabindex="0"></canvas><button id="up" type="button">▲</button>
<script>
  const POINTS_PER_PRESS = 1;
  let score = 0;
  const bump = () => { score += POINTS_PER_PRESS; document.getElementById("score").textContent = String(score); document.body.dataset.score = String(score); };
  document.addEventListener("keydown", (e) => { if (e.code === "Space") bump(); });
  document.getElementById("up").addEventListener("click", bump);
  new Image().src = "${LEAK}/late?v=${version}";
  document.body.dataset.version = "${version}";
  document.body.dataset.ready = "yes";
</script>
</body></html>`;
const modelAsked = [];
const model = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const sent = JSON.parse(body || "{}");
    modelAsked.push(sent);
    const message = String(sent.messages?.[0]?.content ?? "");
    const tool = sent.tool_choice?.name;
    if (message.includes("ΣΦΑΛΜΑ ΠΑΡΟΧΟΥ")) {
      res.writeHead(529, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
    }
    let input;
    if (tool === "plan_game") {
      const plan = PLANS[message.includes(`in ${languageNameFor("en")}`) ? "English" : "Greek"];
      input = { title: plan.title, boxes: Object.entries(plan.boxes).map(([kind, text]) => ({ kind, text })) };
    } else if (tool === "rewrite_box") input = { text: NEW_LEVELS };
    else if (tool === "write_game" && message.split(UNTRUSTED_OPEN).length - 1 === 2) {
      // «στείλε το σκορ» asks for the network: the answer is not a playable game.
      input = { html: /στείλε το σκορ/.test(message) ? game(9, "#000").replace("bump();", 'bump(); fetch("/score");') : game(2, "rgb(200, 0, 0)") };
    } else input = { html: game(1, "rgb(255, 255, 255)") };
    res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
    res.end(JSON.stringify({ id: "msg", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "tool_use", id: "t", name: tool, input }], stop_reason: "tool_use", usage: { input_tokens: 1200, output_tokens: 900 } }));
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
const msgs = (loc) => JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
const EL = msgs("el");
const EN = msgs("en");
const G = EL.dashboard.games;
const plural = (s, n) => s.replace(/\{count, plural,[^{]*?(?:one \{([^}]*)\})?\s*other \{([^}]*)\}\}/, (_, one, other) => (n === 1 && one !== undefined ? one : other).replace("#", String(n)));

const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { model.close(); } catch {}
  try { leak.close(); } catch {}
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
  async function tapAt(x, y) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  async function press(locator) {
    await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.click();
    const box = await locator.boundingBox();
    await tapAt(box.x + box.width / 2, box.y + box.height / 2);
  }
  return { context, page, press, tapAt };
}
/** Write in the field and send; a tap before the page is interactive does nothing, so wait for the turn to appear and send again if it did not. */
async function say(page, press, text) {
  // On a phone the work area covers the field; «back» is how a person reaches it.
  const back = page.locator('[data-testid="tool-shell-back"]');
  if ((await back.count()) && (await back.isVisible())) await press(back);
  const turns = await page.locator('[data-testid="tool-shell-thread"] li[data-role]').count();
  for (let i = 0; i < 3; i++) {
    await page.locator("textarea").first().fill(text);
    await press(page.locator('button[type="submit"]').first());
    const sent = await page.waitForFunction((n) => document.querySelectorAll('[data-testid="tool-shell-thread"] li[data-role]').length > n, turns, { timeout: 4000 }).then(() => true, () => false);
    if (sent) return;
  }
  throw new Error(`«${text}» was not sent after three presses`);
}
const thread = (page) => page.locator('[data-testid="tool-shell-thread"]');
const frame = (page) => page.frameLocator('[data-testid="game-frame"]');
const frameBody = (page, attr) => frame(page).locator("body").getAttribute(`data-${attr}`);
const waitFrame = (page, version) => page.waitForFunction((v) => document.querySelector('[data-testid="game-frame"]')?.getAttribute("srcdoc")?.includes(`dataset.version = "${v}"`), String(version), { timeout: 90_000 });
const mine = () => store.user_games.filter((g) => g.user_id === MOCK_USER.id);

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
  // The test account, charged as anybody is: the price is a real price.
  const APP = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  // SANDBOXED FRAMES KEPT IN THE PAGE'S PROCESS, for the touch emulator
  // alone. Chromium puts a sandboxed frame in a process of its own, and its
  // DevTools touch input then subtracts the frame's offset twice: a tap at
  // page (310, 712) on a frame at (16, 76) arrived at (278, 560), on the
  // <html> instead of the button (measured 2026-10-08; with the frame
  // in-process it arrived at (294, 636), on the button). A real phone's
  // touches are routed by the browser, not by DevTools. The sandbox — the
  // opaque origin, the page out of reach — is the same in either process,
  // and the checks below still require it.
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--disable-features=IsolateSandboxedIframes"] });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label}: describe, plan, change a box ==`);
    setFlags({});
    reset();
    reserved.length = 0;
    settled.length = 0;
    released.length = 0;
    heard.length = 0;
    const { context, page, press, tapAt } = await open(APP, device);
    const response = await page.goto(`${APP}/dashboard/games`, { waitUntil: "networkidle" });
    check("the page opens for the test account, in the shell every tool shares", response.status() === 200 && (await page.locator('[data-testid="tool-shell"]').count()) === 1 && (await page.locator("textarea").first().getAttribute("placeholder")) === G.placeholder);
    // The page's games travel to the screen inside the page itself, so another person's would be in its source.
    check("another person's game is not in the page", !(await page.content()).includes("Ξένο"));
    await say(page, press, "Ένα πουλί που πετάει ανάμεσα σε σωλήνες και μαζεύει αστέρια");
    await page.locator('[data-testid="game-plan"]').waitFor({ timeout: 60_000 });
    const boxes = page.locator('[data-testid="game-box"]');
    const labels = await boxes.evaluateAll((els) => els.map((e) => e.querySelector("span")?.textContent ?? ""));
    check("the plan comes back in five boxes, named in Greek", labels.join("|") === ["rules", "levels", "characters", "controls", "win"].map((k) => G.boxes[k]).join("|"), labels.join("|"));
    const row = mine()[0];
    check("one game, the person's own, its plan as the model wrote it", mine().length === 1 && row?.plan?.title === "Πουλί στον ουρανό" && row?.locale === "el" && row?.html === null);
    check("the thread says the plan is ready", (await thread(page).innerText()).includes(G.planned.replace("{title}", "Πουλί στον ουρανό")));
    check(`a hold was taken and the plan settled as making a game (${reserved[0]?.p_credits} held)`, reserved.length === 1 && reserved[0].p_action === "game_generate" && settled.length === 1 && settled[0].p_feature === "game_generate");

    await press(boxes.nth(1));
    await page.locator('[data-testid="box-chosen"]').waitFor({ timeout: 10_000 });
    check("the field is in reach once a box is pressed, on a phone as on a computer", await page.locator("textarea").first().isVisible() && (await page.locator('[data-testid="tool-shell-work"]').count()) === (device.touch ? 0 : 1));
    check("a pressed box is the one the field will change", (await page.locator('[data-testid="box-chosen"]').innerText()).includes(G.boxes.levels) && (await page.locator("textarea").first().getAttribute("placeholder")) === G.placeholderBox);
    const before = JSON.stringify(mine()[0].plan.boxes.filter((b) => b.kind !== "levels"));
    await say(page, press, "κάν' τα πέντε, το τελευταίο με καταιγίδα");
    await page.waitForFunction((t) => document.querySelectorAll('[data-testid="game-box"]')[1]?.textContent?.includes(t), NEW_LEVELS, { timeout: 60_000 });
    check("the box says the new words", (await boxes.nth(1).innerText()).includes(NEW_LEVELS));
    check("...and the other four are exactly as they were, on screen and stored", JSON.stringify(mine()[0].plan.boxes.filter((b) => b.kind !== "levels")) === before && (await boxes.nth(0).innerText()).includes(PLANS.Greek.boxes.rules));
    check("the box change was settled as changing a game", settled.length === 2 && settled[1].p_feature === "game_edit");

    console.log(`\n== ${device.label}: build, play sealed ==`);
    await press(page.locator('[data-testid="game-build"]'));
    await waitFrame(page, 1);
    const iframe = page.locator('[data-testid="game-frame"]');
    check("the game plays in a frame with scripts and nothing else, whose document the page cannot open", (await iframe.getAttribute("sandbox")) === "allow-scripts" && (await iframe.evaluate((f) => f.contentDocument === null)));
    const srcdoc = await iframe.getAttribute("srcdoc");
    check("...sealed: the policy is the first thing in the document", srcdoc.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="default-src \'none\';'));
    await frame(page).locator('body[data-ready="yes"]').waitFor({ timeout: 15_000 });
    check("its own code runs", (await frameBody(page, "ready")) === "yes");
    check("...and the page that holds it is out of its reach", (await frame(page).locator("html").getAttribute("data-parent")) === "blocked");
    await page.waitForTimeout(1500);
    check(`it reached nothing, not even from a script before its head (${heard.length} requests heard)`, heard.length === 0, heard.join(" "));
    if (device.touch) {
      const up = await frame(page).locator("#up").boundingBox();
      await tapAt(up.x + up.width / 2, up.y + up.height / 2);
      await tapAt(up.x + up.width / 2, up.y + up.height / 2);
      await frame(page).locator('body[data-score="2"]').waitFor({ timeout: 10_000 }).catch(() => {});
      check("on a phone it is played by touch: two taps, two points", (await frameBody(page, "score")) === "2" && (await frame(page).locator("#score").innerText()) === "2");
    } else {
      await frame(page).locator("#c").click();
      await page.keyboard.press("Space");
      await page.keyboard.press("Space");
      await frame(page).locator('body[data-score="2"]').waitFor({ timeout: 10_000 }).catch(() => {});
      check("on a computer it is played with the keyboard: Space twice, two points", (await frameBody(page, "score")) === "2" && (await frame(page).locator("#score").innerText()) === "2");
    }
    const stored = mine()[0];
    check("the game is stored as written, as its first version", stored.html === game(1, "rgb(255, 255, 255)") && stored.versions.length === 1 && stored.versions[0].note === "build");
    check("the game was settled as making a game", settled.length === 3 && settled[2].p_feature === "game_generate");

    console.log(`\n== ${device.label}: change with words, step back, download ==`);
    await say(page, press, "κόκκινο φόντο");
    await waitFrame(page, 2);
    await frame(page).locator('body[data-ready="yes"]').waitFor({ timeout: 15_000 });
    check("the change plays in its place", (await frameBody(page, "version")) === "2" && (await frame(page).locator("body").evaluate((b) => getComputedStyle(b).backgroundColor)) === "rgb(200, 0, 0)");
    check("...the one before is kept, and the screen counts both", mine()[0].versions.length === 2 && (await page.locator('[data-testid="game-versions"] summary').innerText()).trim() === plural(G.versions, 2));
    check("the change was settled as changing a game", settled.length === 4 && settled[3].p_feature === "game_edit");
    const holds = reserved.length;
    const summary = page.locator('[data-testid="game-versions"] summary');
    await summary.evaluate((e) => e.scrollIntoView({ block: "end" }));
    check("the versions, at the bottom of the work, are not under the phone's tab bar", await summary.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.bottom - 4);
      return Boolean(hit && e.contains(hit));
    }));
    await press(summary);
    await press(page.locator('[data-testid="game-restore"]').first());
    await waitFrame(page, 1);
    check("one press brings the first version back", (await iframe.getAttribute("srcdoc")).includes('dataset.version = "1"') && mine()[0].html === game(1, "rgb(255, 255, 255)"));
    check("...it is a version of its own, and nothing was held or charged for it", mine()[0].versions.length === 3 && mine()[0].versions[0].note === "restore" && reserved.length === holds && settled.length === 4);
    check("the thread says which version came back: the first", (await thread(page).innerText()).includes(G.restored.replace("{n}", "1")));
    const dl = await page.request.get(`${APP}/api/games/${mine()[0].id}/download`);
    const file = await dl.text();
    check("the download is one HTML file, sealed the way it is played", dl.status() === 200 && /^attachment;/.test(dl.headers()["content-disposition"] ?? "") && file.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"') && file.includes('dataset.version = "1"') && dl.headers()["cache-control"] === "private, no-store");
    await page.waitForTimeout(500);
    check(`and through all of it, nothing was heard outside (${heard.length})`, heard.length === 0, heard.join(" "));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== in English, desktop ==");
  {
    reset();
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false }, "en");
    await page.goto(`${APP}/dashboard/games`, { waitUntil: "networkidle" });
    check("the field speaks English", (await page.locator("textarea").first().getAttribute("placeholder")) === EN.dashboard.games.placeholder);
    await say(page, press, "A bird that flies between pipes and collects stars");
    await page.locator('[data-testid="game-plan"]').waitFor({ timeout: 60_000 });
    const labels = await page.locator('[data-testid="game-box"] span:first-child').allInnerTexts();
    check("the boxes are named in English, the plan written in English", labels.join("|") === ["rules", "levels", "characters", "controls", "win"].map((k) => EN.dashboard.games.boxes[k]).join("|") && mine()[0]?.plan?.title === "Bird in the sky" && mine()[0]?.locale === "en", labels.join("|"));
    check("the build button and its hint speak English", (await page.locator('[data-testid="game-build"]').innerText()).trim() === EN.dashboard.games.build);
    const text = await page.locator("main").innerText();
    check("no Greek on the English screen", !/[Ͱ-Ͽ]/.test(text), text.match(/.{0,30}[Ͱ-Ͽ].{0,30}/)?.[0]);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== around it: the provider down, an answer that is not a game, no credits ==");
  {
    reset();
    released.length = 0;
    settled.length = 0;
    const { context, page, press } = await open(APP, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${APP}/dashboard/games`, { waitUntil: "networkidle" });
    await say(page, press, "Ένα παιχνίδι με ΣΦΑΛΜΑ ΠΑΡΟΧΟΥ μέσα");
    await page.waitForFunction((t) => document.querySelector('[data-testid="tool-shell-thread"]')?.textContent?.includes(t), G.errors.unavailable, { timeout: 60_000 });
    check("the provider down: said, nothing kept, the hold given back, nothing charged", mine().length === 0 && released.length === 1 && settled.length === 0);

    await say(page, press, "Ένα πουλί που πετάει");
    await page.locator('[data-testid="game-plan"]').waitFor({ timeout: 60_000 });
    await press(page.locator('[data-testid="game-build"]'));
    await waitFrame(page, 1);
    const charged = settled.length;
    await say(page, press, "στείλε το σκορ στον server");
    await page.waitForFunction((t) => document.querySelector('[data-testid="tool-shell-thread"]')?.textContent?.includes(t), G.errors.unusable, { timeout: 60_000 });
    check("an answer that reaches for the network is not kept: the game is as it was", mine()[0].html === game(1, "rgb(255, 255, 255)") && mine()[0].versions.length === 1);
    check("...and what the model spent is charged, as the screen says", settled.length === charged + 1 && settled.at(-1).p_feature === "game_edit");

    credits[0].credits_remaining = 0;
    const asked = modelAsked.length;
    await say(page, press, "πιο γρήγορο");
    await page.waitForFunction((t) => document.querySelector('[data-testid="tool-shell-thread"]')?.textContent?.includes(t), G.errors.insufficient, { timeout: 30_000 });
    check("no credits left: said, before the model is asked", modelAsked.length === asked);
    credits[0].credits_remaining = 3000;

    const theirs = await page.request.post(`${APP}/api/games/${OTHER_ID}`, { data: { action: "restore", version: 0 } });
    const theirsDl = await page.request.get(`${APP}/api/games/${OTHER_ID}/download`);
    check("another person's game is not found, to change or to download", theirs.status() === 404 && theirsDl.status() === 404);
    const gone = await page.request.delete(`${APP}/api/games/${OTHER_ID}`);
    check("...nor deleted", gone.status() === 200 && store.user_games.some((g) => g.id === OTHER_ID));
    const own = await page.request.delete(`${APP}/api/games/${mine()[0].id}`);
    check("the person's own game is deleted when they ask", own.status() === 200 && mine().length === 0);
    await context.close();
  }

  console.log("\n== a Free account, then the switch off ==");
  {
    reset();
    MOCK_USER.user_metadata = { subscription_tier: "free" };
    const { context, page } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/games`, { waitUntil: "networkidle" });
    const text = await page.locator("main").innerText();
    check("Free: the wall that says which plan has it, and no field", text.includes(EL.common.upgradeRequired.title) && (await page.locator('[data-testid="tool-shell"]').count()) === 0);
    const asked = modelAsked.length;
    const free = await page.request.post(`${APP}/api/games`, { data: { description: "Ένα πουλί" } });
    check("...and the route refuses before the model is asked", free.status() === 403 && (await free.json()).code === "not_included" && modelAsked.length === asked);
    MOCK_USER.user_metadata = { subscription_tier: "growth" };

    setFlags({ games: "off" });
    await page.goto(`${APP}/dashboard/games`, { waitUntil: "networkidle" });
    // A streamed page answers 200 before notFound() runs (app/dashboard/loading.tsx),
    // so what is measured is what is drawn: the not-found page, and no tool.
    check("with the switch off, the page does not exist", (await page.locator("body").innerText()).includes(EL.pageTitle.notFoundBody) && (await page.locator('[data-testid="tool-shell"]').count()) === 0 && (await page.locator("textarea").count()) === 0, (await page.locator("body").innerText()).slice(0, 300));
    const offPost = await page.request.post(`${APP}/api/games`, { data: { description: "Ένα πουλί" } });
    check("...and the route refuses", offPost.status() === 403 && (await offPost.json()).code === "not_enabled" && modelAsked.length === asked);
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
