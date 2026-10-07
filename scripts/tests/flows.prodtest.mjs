/*
 * «ΦΤΙΑΞΕ SITE ΓΙΑ ΤΟ CAMPING ΜΟΥ, ΜΕ ΕΙΚΟΝΕΣ, ΚΑΙ POSTS» — IN THE BUILT APP,
 * FROM THE SENTENCE TO THE PROJECT (MASTER 6.1 and 6.3, package 36).
 *
 * Run: node scripts/tests/flows.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/flows.prodtest.mjs
 *
 * THE FLOW'S OWN ROUTES ARE THE APP'S OWN: the page, api/flows, api/flows/
 * [id]/steps, and for the analysis api/data-analysis/upload and its price.
 * The database is the stand-in of scripts/lib/mock-supabase.mjs, with the
 * flow, the project, its links and each tool's table kept as real rows
 * (filters, inserts, updates — updated_at moving on every update, as the
 * trigger moves it), so what one route writes the next one reads.
 *
 * EACH TOOL'S OWN REQUEST — the site, the pictures, the posts, the
 * research, the deck, the analysis — is answered IN THE BROWSER as that
 * tool answers it, and its row is written where the tool writes it: each
 * tool's making, charging and refusing is held by its own prodtest and
 * itest. What is held here is what a flow adds: which requests are made,
 * in what order, with what words and colour, and that every result ends
 * up in one project.
 *
 *   1. 6.3 #2, the camping: the plan, the prices, the colour changed, the
 *      approval, three tools side by side, one project with all three.
 *   2. 6.3 #1: the research first, the deck made FROM it after.
 *   3. 6.3 #3: a sales file, priced from its columns before approval.
 *   4. What no tool makes yet (a video): nothing starts.
 *   5. A step refused for credits, then pressed again.
 *   6. A flow left half-way: followed again, and what was cut off says so.
 *   7. Another person's row, and a step that has to wait, refused.
 *   8. A phone; then the switch off.
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

// ---------------------------------------------------------------------
// The tables a flow writes and reads, kept as rows.
// ---------------------------------------------------------------------
const STATEFUL = ["project_flows", "projects", "entity_links", "user_websites", "generated_images", "generated_posts", "research_reports", "ai_presentations", "data_analyses", "data_analysis_charts"];
const store = Object.fromEntries(STATEFUL.map((t) => [t, []]));
let seq = 0;
const uuid = () => `9${String(++seq).padStart(7, "0")}-0000-4000-8000-000000000000`;
const stamp = () => new Date(Date.UTC(2026, 9, 7, 9, 0, 0) + ++seq * 1000).toISOString();
function matches(row, url) {
  for (const [key, raw] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    const cell = row[key];
    if (op === "eq" && String(cell) !== value) return false;
    if (op === "neq" && String(cell) === value) return false;
    if (op === "is" && value === "null" && cell !== null && cell !== undefined) return false;
    if (op === "in") {
      const set = value.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, ""));
      if (!set.includes(String(cell))) return false;
    }
  }
  return true;
}
const writes = [];
function rest({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (!STATEFUL.includes(table)) return false;
  const rows = store[table];
  const hit = rows.filter((r) => matches(r, url));
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  // The flow's project name, as the embedded select projects(name) reads it.
  const shape = (r) => (table === "project_flows" ? { ...r, projects: { name: store.projects.find((p) => p.id === r.project_id)?.name ?? null } } : r);
  const answer = (list) => {
    const out = list.map(shape);
    if ((req.headers.prefer ?? "").includes("count=")) {
      res.writeHead(200, { "Content-Type": "application/json", "Content-Range": out.length ? `0-${out.length - 1}/${out.length}` : "*/0" });
      res.end(req.method === "HEAD" ? "" : JSON.stringify(out));
      return;
    }
    if (single) return out[0] ? json(200, out[0]) : json(406, { message: "no rows" });
    json(200, out);
  };
  if (req.method === "GET" || req.method === "HEAD") {
    let list = [...hit];
    const order = url.searchParams.get("order");
    if (order) {
      const [col, dir] = order.split(".");
      list.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === "desc" ? -1 : 1));
    }
    const limit = Number(url.searchParams.get("limit"));
    if (limit) list = list.slice(0, limit);
    answer(list);
    return true;
  }
  if (req.method === "POST") {
    const input = JSON.parse(body || "[]");
    const made = (Array.isArray(input) ? input : [input]).map((r) => ({ id: uuid(), created_at: stamp(), updated_at: stamp(), ...r }));
    rows.push(...made);
    writes.push({ table, method: "POST", rows: made });
    answer(made);
    return true;
  }
  if (req.method === "PATCH") {
    const patch = JSON.parse(body || "{}");
    // The set_updated_at trigger: every update moves updated_at.
    for (const r of hit) Object.assign(r, patch, { updated_at: stamp() });
    writes.push({ table, method: "PATCH", patch, count: hit.length });
    answer(hit);
    return true;
  }
  return false;
}

const flags = [];
const supa = await startMockSupabase({
  port: 54391,
  tableRows: { feature_flags: flags, user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }] },
  handle: rest,
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
  ADMIN_EMAILS: MOCK_USER.email,
  // The pictures are offered only where their provider is configured
  // (lib/flows/availability.ts); nothing here calls it.
  GEMINI_API_KEY: "placeholder-never-called",
  ANTHROPIC_API_KEY: "placeholder-never-called",
};

const el = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.flows;
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

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

// ---------------------------------------------------------------------
// Each tool's request, answered as that tool answers it, its row written
// where the tool writes it. `asked` keeps every request, in order.
// ---------------------------------------------------------------------
const asked = [];
const tools = { imagesRefuseOnce: false, researchPolls: new Map(), siteStatus: new Map() };
const own = (table, fields) => {
  const row = { id: uuid(), user_id: MOCK_USER.id, created_at: stamp(), ...fields };
  store[table].push(row);
  return row;
};
async function answerTools(page) {
  const reply = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/websites/generate", (route) => {
    const body = route.request().postDataJSON();
    asked.push({ tool: "site", body, at: Date.now() });
    const row = own("user_websites", { name: body.name, status: "processing" });
    tools.siteStatus.set(row.id, 0);
    return reply(route, 200, { ok: true, generated: true, record: { id: row.id, name: body.name, status: "processing" } });
  });
  await page.route("**/api/websites/generate/process", (route) => reply(route, 200, { ok: true }));
  await page.route("**/api/websites/status?**", (route) => {
    const id = new URL(route.request().url()).searchParams.get("id");
    const row = store.user_websites.find((r) => r.id === id);
    const polls = (tools.siteStatus.get(id) ?? 0) + 1;
    tools.siteStatus.set(id, polls);
    // Running for one look, then finished, as a generation does.
    if (row && polls >= 2) row.status = "completed";
    return reply(route, 200, { ok: true, record: { id, name: row?.name ?? "", status: row?.status ?? "failed" } });
  });
  await page.route("**/api/images/generate", (route) => {
    const body = route.request().postDataJSON();
    asked.push({ tool: "images", body, at: Date.now() });
    if (tools.imagesRefuseOnce) {
      tools.imagesRefuseOnce = false;
      return reply(route, 402, { ok: false, error: "insufficient_credits" });
    }
    const row = own("generated_images", { prompt: body.description });
    return reply(route, 200, { ok: true, image: { id: row.id } });
  });
  await page.route("**/api/posts/generate", (route) => {
    const body = route.request().postDataJSON();
    asked.push({ tool: "posts", body, at: Date.now() });
    const row = own("generated_posts", { description: body.description, title: "Posts" });
    return reply(route, 200, { ok: true, id: row.id });
  });
  await page.route("**/api/research", (route) => {
    const body = route.request().postDataJSON();
    asked.push({ tool: "research", body, at: Date.now() });
    const row = own("research_reports", { topic: body.topic, status: "planned" });
    return reply(route, 200, { ok: true, report: { id: row.id } });
  });
  await page.route(/\/api\/research\/[^/]+\/run$/, (route) => {
    const id = route.request().url().split("/").at(-2);
    asked.push({ tool: "research-run", id, at: Date.now() });
    const row = store.research_reports.find((r) => r.id === id);
    if (row) row.status = "running";
    return reply(route, 200, { ok: true });
  });
  await page.route(/\/api\/research\/[0-9a-f-]{36}$/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const id = route.request().url().split("/").at(-1);
    const row = store.research_reports.find((r) => r.id === id);
    const polls = (tools.researchPolls.get(id) ?? 0) + 1;
    tools.researchPolls.set(id, polls);
    if (row && row.status === "running" && polls >= 2) {
      row.status = "ready";
      asked.push({ tool: "research-ready", id, at: Date.now() });
    }
    return reply(route, 200, { ok: true, report: { id, status: row?.status ?? "failed" } });
  });
  await page.route("**/api/presentations/generate", (route) => {
    const body = route.request().postDataJSON();
    asked.push({ tool: "slides", body, at: Date.now() });
    const row = own("ai_presentations", { title: "Παρουσίαση" });
    return reply(route, 200, { ok: true, id: row.id });
  });
  await page.route(/\/api\/data-analysis\/[^/]+\/analyse$/, (route) => {
    asked.push({ tool: "analyse", id: route.request().url().split("/").at(-2), at: Date.now() });
    return reply(route, 200, { ok: true });
  });
}

async function open(origin, device) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, timezoneId: "Europe/Athens" });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: "el", url: origin },
    ].map(({ domain, path, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  await answerTools(page);
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
async function say(page, press, words) {
  await page.locator("textarea").first().fill(words);
  await press(page.locator('button[type="submit"]').first());
}
/** Presses «Έγκριση», and «Συνέχεια» when the total is large enough to be asked again. */
async function approve(page, press) {
  await press(page.locator('[data-testid="flow-approve"]').last());
  const dialog = page.locator('[role="dialog"]');
  if (await dialog.waitFor({ timeout: 1500 }).then(() => true).catch(() => false)) await press(dialog.locator("button").last());
}
async function allFinished(page, count, timeout = 60000) {
  await page
    .waitForFunction(
      (n) => {
        const steps = [...document.querySelectorAll('[data-testid="flow-step"]')];
        return steps.length === n && steps.every((s) => s.getAttribute("data-status") === "done" || s.getAttribute("data-status") === "failed");
      },
      count,
      { timeout }
    )
    .catch(() => null);
}
const statuses = async (page) => (await page.locator('[data-testid="flow-step"]').evaluateAll((els) => els.map((e) => `${e.getAttribute("data-kind")}:${e.getAttribute("data-status")}`))).join();
const linksInto = (projectId) => store.entity_links.filter((l) => l.target_table === "projects" && l.target_id === projectId && l.relationship_type === "in_project");
const flowOf = (said) => store.project_flows.find((f) => f.said === said);
const askedOf = (tool) => asked.filter((a) => a.tool === tool);

const CAMPING = "Φτιάξε site για το camping μου, με εικόνες, και posts για να το ανακοινώσω";
const RESEARCH = "Κάνε έρευνα για τα camping στις Κυκλάδες και φτιάξε παρουσίαση";
const SALES = "Πάρε αυτό το αρχείο πωλήσεων και γράψε αναφορά με γραφήματα.";
const desktop = { viewport: { width: 1280, height: 860 }, touch: false };

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
  const ON = await start(base);
  browser = await chromium.launch();
  setFlags({ flows: "staff", "image-studio": "staff" });

  // =================================================================
  console.log("\n== 1. 6.3 #2: a site, pictures and posts, in one project ==");
  {
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/projects`, { waitUntil: "networkidle" });
    check("the Projects page is where a flow is written", (await page.locator('[data-testid="tool-shell"]').count()) === 1);
    await say(page, press, CAMPING);
    await page.locator('[data-testid="flow-plan"]').waitFor({ timeout: 10000 });
    const kinds = await page.locator('[data-testid="flow-plan-step"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
    check("the plan: the site, the pictures, the posts", kinds.join() === "site,images,posts", kinds.join());
    const stepTexts = await page.locator('[data-testid="flow-plan-step"]').allInnerTexts();
    const credits = stepTexts.map((s) => Number((s.match(/(\d[\d.]*)\s*(?:credits|μονάδ)/i)?.[1] ?? "").replace(/\./g, "")));
    check("each step says its price", credits.length === 3 && credits.every((n) => Number.isFinite(n) && n > 0), stepTexts.join(" | "));
    const total = Number(((await page.locator('[data-testid="flow-total"]').innerText()).match(/(\d[\d.]*)/)?.[1] ?? "").replace(/\./g, ""));
    check("...and the total is their sum", total === credits.reduce((a, b) => a + b, 0), `${total} vs ${credits.join("+")}`);
    check("nothing has started before «Έγκριση»", store.projects.length === 0 && asked.length === 0);
    await page.locator('[data-testid="flow-colour"]').fill("#1d4ed8");
    await approve(page, press);
    await page.locator('[data-testid="flow-step"]').first().waitFor({ timeout: 15000 });
    await allFinished(page, 3);
    check("all three made, side by side", (await statuses(page)) === "site:done,images:done,posts:done", await statuses(page));
    const flow = flowOf(CAMPING);
    const project = store.projects.find((p) => p.id === flow?.project_id);
    check("one project, named by the sentence", Boolean(project) && project.name.length <= 60 && CAMPING.startsWith(project.name.replace(/…$/, "").trim()), project?.name);
    check("...holding all three", linksInto(project?.id).map((l) => l.source_table).sort().join() === "generated_images,generated_posts,user_websites");
    check("the flow is done", flow?.status === "done");
    const site = askedOf("site")[0]?.body, images = askedOf("images")[0]?.body, posts = askedOf("posts")[0]?.body;
    check("the site was asked the sentence, in the colour chosen, in its own design form's words", site?.description.startsWith(CAMPING) && site.description.includes("PRIMARY COLOUR: exactly #1d4ed8") && site.skipClarification === true, site?.description);
    check("...the pictures in the same colour", images?.description.startsWith(CAMPING) && images.description.includes("#1d4ed8"));
    check("...the posts the sentence, for every platform", posts?.description === CAMPING && Array.isArray(posts.platforms) && posts.platforms.length >= 3);
    check("the three started together, none waiting for another", Math.max(...["site", "images", "posts"].map((k) => askedOf(k)[0].at)) - Math.min(...["site", "images", "posts"].map((k) => askedOf(k)[0].at)) < 2000);
    const opens = await page.locator('[data-testid="flow-step-open"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    check("each result opens in its own tool", opens.length === 3 && opens[0].startsWith("/dashboard/website-builder?project=") && opens[1].startsWith("/dashboard/images?record=") && opens[2].startsWith("/dashboard/posts?record="), opens.join(" "));
    check("the summary says three of three", (await page.locator('[data-testid="flow-summary"]').innerText()) === fill(el.doneOf, { done: 3, total: 3 }));
    await press(page.locator('[data-testid="flow-project"]'));
    await page.waitForURL(/\/dashboard\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
    await page.locator('[data-testid="project-member-open"]').first().waitFor({ timeout: 10000 }).catch(() => null);
    check("the project page shows the three, each opening its tool", (await page.locator('[data-testid="project-member-open"]').count()) === 3);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 2. 6.3 #1: the research, then the deck made from it ==");
  {
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/projects`, { waitUntil: "networkidle" });
    await say(page, press, RESEARCH);
    await page.locator('[data-testid="flow-plan"]').waitFor({ timeout: 10000 });
    check("the plan: the research, the deck after it", (await page.locator('[data-testid="flow-plan-step"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")))).join() === "research,slides");
    check("...and says the deck waits for it", (await page.locator('[data-testid="flow-plan-step"]').nth(1).innerText()).includes(el.afterResearch));
    check("no colour is asked for what has none", (await page.locator('[data-testid="flow-colour"]').count()) === 0);
    await approve(page, press);
    await page.locator('[data-testid="flow-step"]').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500);
    check("while the research runs, the deck waits", (await statuses(page)).startsWith("research:running,slides:waiting"), await statuses(page));
    await allFinished(page, 2, 60000);
    check("both made", (await statuses(page)) === "research:done,slides:done", await statuses(page));
    const research = askedOf("research").at(-1), ready = askedOf("research-ready").at(-1), slides = askedOf("slides").at(-1);
    check("the deck was asked only once the research was ready", Boolean(ready && slides) && slides.at >= ready.at);
    check("...and made FROM it", slides?.body.researchId === ready?.id && slides.body.imageSource === "none");
    check("the research was asked the sentence", research?.body.topic === RESEARCH);
    check("...both in one project", linksInto(flowOf(RESEARCH)?.project_id).map((l) => l.source_table).sort().join() === "ai_presentations,research_reports");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 3. 6.3 #3: a sales file, priced before approval ==");
  {
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/projects`, { waitUntil: "networkidle" });
    await say(page, press, SALES);
    await page.locator('[data-testid="flow-plan"]').waitFor({ timeout: 10000 });
    check("the plan: the analysis", (await page.locator('[data-testid="flow-plan-step"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")))).join() === "analysis");
    check("...priced after its file, and not approvable before it", (await page.locator('[data-testid="flow-plan-step"]').innerText()).includes(el.priceAfterFile) && (await page.locator('[data-testid="flow-approve"]').isDisabled()));
    const csv = "Μήνας,Πωλήσεις,Επισκέπτες\nΙούνιος,12500,340\nΙούλιος,18900,512\nΑύγουστος,21400,603\nΣεπτέμβριος,9800,260\n";
    await page.locator('[data-testid="flow-file"]').setInputFiles({ name: "pwliseis.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await page.waitForFunction(() => !document.querySelector('[data-testid="flow-approve"]')?.hasAttribute("disabled"), null, { timeout: 15000 }).catch(() => null);
    const analysisRow = store.data_analyses.at(-1);
    check("the file was read by the analysis tool's own upload", Boolean(analysisRow) && analysisRow.user_id === MOCK_USER.id);
    const priceText = await page.locator('[data-testid="flow-plan-step"]').innerText();
    check("...and the price is its own, from its columns", !priceText.includes(el.priceAfterFile) && /\d/.test(priceText), priceText);
    check("still nothing analysed before «Έγκριση»", askedOf("analyse").length === 0);
    await approve(page, press);
    await page.locator('[data-testid="flow-step"]').first().waitFor({ timeout: 15000 });
    await allFinished(page, 1);
    check("analysed, the file read once", (await statuses(page)) === "analysis:done" && askedOf("analyse").at(-1)?.id === analysisRow?.id && store.data_analyses.length === 1, await statuses(page));
    check("...in its project", linksInto(flowOf(SALES)?.project_id).map((l) => l.source_id).join() === analysisRow?.id);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 4. what no tool makes yet ==");
  {
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/projects`, { waitUntil: "networkidle" });
    const projects = store.projects.length, before = asked.length;
    await say(page, press, "Φτιάξε ένα βίντεο για το site του camping μου");
    await page.waitForTimeout(800);
    const thread = await page.locator('[data-testid="tool-shell-thread"]').innerText();
    check("a video: it says so, and offers no plan", thread.includes(fill(el.notYet, { names: el.notYetNames.video })) && (await page.locator('[data-testid="flow-plan"]').count()) === 0, thread.slice(-300));
    const r = await page.request.post(`${ON}/api/flows`, { data: { said: "Φτιάξε ένα βίντεο για το site του camping μου" } });
    check("...and the route, asked anyway, makes nothing", r.status() === 422 && (await r.json()).code === "not_yet" && store.projects.length === projects && asked.length === before);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 5. a step refused for credits, pressed again ==");
  {
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/projects`, { waitUntil: "networkidle" });
    tools.imagesRefuseOnce = true;
    const said = "Φτιάξε εικόνες για το camping μου";
    await say(page, press, said);
    await page.locator('[data-testid="flow-plan"]').waitFor({ timeout: 10000 });
    await approve(page, press);
    await page.locator('[data-testid="flow-step"]').first().waitFor({ timeout: 15000 });
    await allFinished(page, 1);
    check("refused: it says why, in words", (await statuses(page)) === "images:failed" && (await page.locator('[data-testid="flow-step"]').innerText()).includes(el.stepErrors.no_credits));
    check("...the flow reads as failed, with nothing put in its project", flowOf(said)?.status === "failed" && linksInto(flowOf(said)?.project_id).length === 0);
    await press(page.locator('[data-testid="flow-step-retry"]'));
    await page.waitForFunction(() => document.querySelector('[data-testid="flow-step"]')?.getAttribute("data-status") === "done", null, { timeout: 20000 }).catch(() => null);
    check("pressed again, made, and in the project", (await statuses(page)) === "images:done" && flowOf(said)?.status === "done" && linksInto(flowOf(said)?.project_id).length === 1);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 6. a flow left half-way ==");
  {
    // As a closed tab leaves it: the research running on the server with
    // its row; the posts claimed and never told what came of them.
    const project = own("projects", { name: "Έρευνα και posts", status: "active" });
    const report = own("research_reports", { topic: "camping", status: "running" });
    const said = "Κάνε έρευνα για τα camping και γράψε posts";
    own("project_flows", {
      project_id: project.id,
      said,
      colour: null,
      plan: { steps: [{ id: "research", kind: "research", after: [] }, { id: "posts", kind: "posts", after: [] }], notYet: [] },
      steps: { research: { status: "running", row: report.id }, posts: { status: "running" } },
      status: "running",
      updated_at: stamp(),
    });
    const researchStarts = askedOf("research").length;
    const { context, page, press } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/projects`, { waitUntil: "networkidle" });
    check("«Τα έργα μου» says a flow is running", (await page.locator('[data-testid="flow-mine"]').innerText()).includes(fill(el.mineRunning.replace(/\{count, plural,[\s\S]*$/, ""), {}).trim().slice(0, 4)) || (await page.locator('[data-testid="flow-mine"]').innerText()) !== el.mine);
    await press(page.locator('[data-testid="flow-mine"]'));
    await press(page.locator('[data-testid="flow-running"] button').first());
    await page.locator('[data-testid="flow-step"]').first().waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="flow-step"][data-kind="research"]')?.getAttribute("data-status") === "done", null, { timeout: 20000 }).catch(() => null);
    check("the research was followed from its row, not started again", (await statuses(page)).startsWith("research:done") && askedOf("research").length === researchStarts && linksInto(project.id).some((l) => l.source_id === report.id), await statuses(page));
    check("the posts, cut off, say so and offer to run again", (await page.locator('[data-testid="flow-step"][data-kind="posts"] [data-testid="flow-step-retry"]').count()) === 1);
    await press(page.locator('[data-testid="flow-step"][data-kind="posts"] [data-testid="flow-step-retry"]'));
    await page.waitForFunction(() => document.querySelector('[data-testid="flow-step"][data-kind="posts"]')?.getAttribute("data-status") === "done", null, { timeout: 20000 }).catch(() => null);
    check("...pressed, made, and the flow done", (await statuses(page)) === "research:done,posts:done" && flowOf(said)?.status === "done");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  console.log("\n== 7. what the steps route refuses ==");
  {
    const { context, page } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/projects`, { waitUntil: "networkidle" });
    const someoneElses = { id: uuid(), user_id: "00000000-0000-4000-8000-0000000000ff", name: "Ξένο site", status: "completed" };
    store.user_websites.push(someoneElses);
    const camping = flowOf(CAMPING);
    const theirs = await page.request.post(`${ON}/api/flows/${camping.id}/steps`, { data: { step: "site", status: "running", row: someoneElses.id } });
    check("a row that is not the person's own goes in no project", [404, 409].includes(theirs.status()) && !store.entity_links.some((l) => l.source_id === someoneElses.id));
    const project = own("projects", { name: "Αναμονή", status: "active" });
    const waiting = own("project_flows", {
      project_id: project.id,
      said: "έρευνα και παρουσίαση",
      colour: null,
      plan: { steps: [{ id: "research", kind: "research", after: [] }, { id: "slides", kind: "slides", after: ["research"] }], notYet: [] },
      steps: {},
      status: "running",
      updated_at: stamp(),
    });
    const early = await page.request.post(`${ON}/api/flows/${waiting.id}/steps`, { data: { step: "slides", status: "running" } });
    check("a deck cannot start before its research is done", early.status() === 409 && (await early.json()).code === "waiting");
    const report = own("research_reports", { topic: "x", status: "ready" });
    const sneaky = await page.request.post(`${ON}/api/flows/${waiting.id}/steps`, { data: { step: "research", status: "done", row: someoneElses.id } });
    check("...nor be marked made with another table's row", sneaky.status() === 404 && (await sneaky.json()).code === "not_yours");
    const real = await page.request.post(`${ON}/api/flows/${waiting.id}/steps`, { data: { step: "research", status: "done", row: report.id } });
    check("...and the research's own row is taken", real.status() === 200 && linksInto(project.id).length === 1);
    const twice = await page.request.post(`${ON}/api/flows/${waiting.id}/steps`, { data: { step: "research", status: "running" } });
    check("a finished step is not reopened", twice.status() === 409 && (await twice.json()).code === "already_done");
    await context.close();
  }

  // =================================================================
  console.log("\n== 8. a phone, then the switch off ==");
  {
    const { context, page, press } = await open(ON, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${ON}/dashboard/projects`, { waitUntil: "networkidle" });
    await say(page, press, CAMPING);
    await page.locator('[data-testid="flow-plan"]').waitFor({ timeout: 10000 });
    check("on a phone the plan fits the screen", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    check("...and «Έγκριση» is a full-size press", ((await page.locator('[data-testid="flow-approve"]').boundingBox())?.height ?? 0) >= 44);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }
  {
    setFlags({ flows: "off", "image-studio": "staff" });
    const { context, page } = await open(ON, desktop);
    await page.goto(`${ON}/dashboard/projects`, { waitUntil: "networkidle" });
    check("with the switch off the Projects page is the one it always was", (await page.locator('[data-testid="tool-shell"]').count()) === 0 && (await page.locator("main").count()) === 1);
    const r = await page.request.post(`${ON}/api/flows`, { data: { said: CAMPING } });
    check("...and the route refuses", r.status() === 403 && (await r.json()).code === "not_enabled");
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
