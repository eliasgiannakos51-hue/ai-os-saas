/*
 * A SITE AND A DOCUMENT TRANSLATED INTO ENGLISH, AND THEIR FORM THE SAME —
 * IN THE BUILT APP (MASTER 16, package 28).
 *
 * Run: node scripts/tests/translate.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/translate.prodtest.mjs
 *
 * One production build, the real route (api/translate: GET the price, POST
 * the translation), pressed from the Site and from the document editor.
 * The model is a local server answering as Anthropic does
 * (ANTHROPIC_BASE_URL); the database is the stand-in, keeping the rows the
 * route writes, the hold it takes and the charge it settles.
 *
 * THE FORM IS MEASURED, NOT LOOKED AT: every page of the copy is reduced
 * to its tags and attributes (lib/translate/segments.ts skeletonOf) and
 * compared with the original's. And what the model was sent is read: words
 * and numbered marks, never a tag, a class or an address.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch, in Greek; the
 * dialog in English on a computer. Around it: the provider down, no
 * credits left, a Free account, a site still being made, the switch off.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { loadTs } from "./load-ts.mjs";

const { skeletonOf } = await loadTs("src/lib/translate/segments.ts");

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
// The person's site and document, as rows.
// ---------------------------------------------------------------------
const NAV = '<nav class="top"><a href="/">Αρχική</a> <a href="/rooms">Δωμάτια</a> <a href="/contact">Επικοινωνία</a></nav>';
const HEAD = (title) => `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="Διακοπές δίπλα στη θάλασσα"><style>body{font-family:sans-serif}.hero{background:#e85d04;color:#fff}</style></head>`;
const HOME =
  HEAD("Camping Ήλιος") +
  `<body>${NAV}<section class="hero" id="top"><h1>Καλώς ήρθατε στο <strong>Camping Ήλιος</strong></h1><p>Σκηνές και τροχόσπιτα δίπλα στη θάλασσα.</p><a class="cta" href="/contact">Κλείστε <em>τώρα</em></a></section><img src="https://images.example/beach.jpg" alt="Η παραλία μας" width="1200"><footer><p>© 2026 Camping Ήλιος</p></footer><script>document.body.dataset.ready = "ναι";</script></body></html>`;
const ROOMS = HEAD("Δωμάτια") + `<body>${NAV}<h1>Δωμάτια</h1><p>Δίκλινα και τετράκλινα, με θέα.</p></body></html>`;
const CONTACT = HEAD("Επικοινωνία") + `<body>${NAV}<h1>Επικοινωνία</h1><p>Τηλέφωνο: 22890 12345</p></body></html>`;
const DOC_HTML = "<h1>Τι προσφέρουμε</h1><p>Πρωινό για <strong>40 άτομα</strong> κάθε μέρα.</p><ul><li>Φρέσκο ψωμί</li><li>Γλυκά της ημέρας</li></ul>";

const SITE_ID = "00000000-0000-4000-8000-0000000051e0";
const DOC_ID = "00000000-0000-4000-8000-0000000d0c00";
const EN_DOC_ID = "00000000-0000-4000-8000-0000000d0c01";
const BAD_DOC_ID = "00000000-0000-4000-8000-0000000d0c02";
const BUSY_SITE_ID = "00000000-0000-4000-8000-0000000051e1";
const store = { user_websites: [], user_documents: [] };
function reset() {
  const at = new Date(Date.now() - 86_400_000 * 3).toISOString();
  store.user_websites.splice(0, Infinity,
    { id: SITE_ID, user_id: MOCK_USER.id, name: "Camping Ήλιος", description: "Camping δίπλα στη θάλασσα", html_content: HOME, pages: [{ slug: "rooms", label: "Δωμάτια", html: ROOMS }, { slug: "contact", label: "Επικοινωνία", html: CONTACT }], status: "completed", error_message: null, reference_image_url: null, created_at: at },
    { id: BUSY_SITE_ID, user_id: MOCK_USER.id, name: "Καφέ Λιμάνι", description: "", html_content: "", pages: null, status: "processing", error_message: null, reference_image_url: null, created_at: new Date(Date.now() - 86_400_000 * 4).toISOString() }
  );
  store.user_documents.splice(0, Infinity,
    { id: DOC_ID, user_id: MOCK_USER.id, title: "Προσφορά για το ξενοδοχείο", content: { html: DOC_HTML, source: "written" }, created_at: at, updated_at: at },
    { id: EN_DOC_ID, user_id: MOCK_USER.id, title: "Hotel offer", content: { html: "<p>Breakfast for forty guests every day, with fresh bread.</p>" }, created_at: at, updated_at: at },
    { id: BAD_DOC_ID, user_id: MOCK_USER.id, title: "Επιστολή", content: { html: "<p>ΣΦΑΛΜΑ ΠΑΡΟΧΟΥ στο κείμενο.</p>" }, created_at: at, updated_at: at }
  );
}
let seq = 0;
const uuid = () => `${String(++seq).padStart(8, "0")}-0000-4000-8000-0000000000aa`;
function matches(row, url) {
  for (const [k, v] of url.searchParams) {
    if (v.startsWith("eq.") && String(row[k]) !== v.slice(3)) return false;
    if (v.startsWith("gte.") && !(String(row[k]) >= v.slice(4))) return false;
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
  if ((req.headers.prefer ?? "").includes("count=")) {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Range": hit.length ? `0-${hit.length - 1}/${hit.length}` : "*/0" });
    return res.end(req.method === "HEAD" ? "" : JSON.stringify(hit)), true;
  }
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
  if (req.method === "GET") return answer([...hit].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))), true;
  if (req.method === "POST") {
    const input = JSON.parse(body || "[]");
    const made = (Array.isArray(input) ? input : [input]).map((r) => ({ id: uuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_message: null, reference_image_url: null, ...r }));
    rows.push(...made);
    return answer(made), true;
  }
  if (req.method === "PATCH") {
    for (const r of hit) Object.assign(r, JSON.parse(body || "{}"));
    return answer(hit), true;
  }
  return false;
}

const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({ port: 54409, tableRows: { feature_flags: flags, user_credits: credits }, handle: rest });
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

// ---------------------------------------------------------------------
// The model: a translator that keeps the marks — except for one piece,
// whose mark it drops, which must stay as it was.
// ---------------------------------------------------------------------
const PHRASES = [
  ["Καλώς ήρθατε στο", "Welcome to"],
  ["Σκηνές και τροχόσπιτα δίπλα στη θάλασσα.", "Tents and caravans by the sea."],
  ["Διακοπές δίπλα στη θάλασσα", "Holidays by the sea"],
  ["Η παραλία μας", "Our beach"],
  ["Δίκλινα και τετράκλινα, με θέα.", "Double and quadruple rooms, with a view."],
  ["Τηλέφωνο:", "Phone:"],
  ["Προσφορά για το ξενοδοχείο", "Offer for the hotel"],
  ["Τι προσφέρουμε", "What we offer"],
  ["Πρωινό για", "Breakfast for"],
  ["40 άτομα", "40 guests"],
  ["κάθε μέρα.", "every day."],
  ["Φρέσκο ψωμί", "Fresh bread"],
  ["Γλυκά της ημέρας", "Cakes of the day"],
  ["Επικοινωνία", "Contact"],
  ["Δωμάτια", "Rooms"],
  ["Αρχική", "Home"],
];
const english = (piece) => (piece === "<1>Κλείστε <2>τώρα</2></1>" ? "<1>Book now</1>" : PHRASES.reduce((s, [el, en]) => s.split(el).join(en), piece));
const modelAsked = [];
const model = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const sent = JSON.parse(body || "{}");
    modelAsked.push(sent);
    const message = String(sent.messages?.[0]?.content ?? "");
    if (message.includes("ΣΦΑΛΜΑ ΠΑΡΟΧΟΥ")) {
      res.writeHead(529, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
    }
    const { pieces = [] } = JSON.parse(message || "{}");
    res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
    res.end(JSON.stringify({ id: "msg", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "tool_use", id: "t", name: "translations", input: { translations: pieces.map(english) } }], stop_reason: "tool_use", usage: { input_tokens: 900, output_tokens: 400 } }));
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
const EL = msgs("el").dashboard.translate;
const EN = msgs("en").dashboard.translate;
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
const dialog = (page) => page.locator('[data-testid="translate-dialog"]');
/** A tap that lands before the page is interactive does nothing; tap again, up to three times. */
async function openDialog(page, press) {
  for (let i = 0; i < 3; i++) {
    await press(page.locator('[data-testid="translate-open"]'));
    if (await dialog(page).waitFor({ timeout: 4000 }).then(() => true, () => false)) return;
  }
  throw new Error("the translate dialog did not open after three presses");
}
async function priced(page) {
  const shown = await dialog(page).locator('[data-testid="translate-price"], [data-testid="translate-refused"]').first().waitFor({ timeout: 30_000 }).then(() => true, () => false);
  if (!shown) {
    const open = await dialog(page).count();
    throw new Error(`no price: dialog ${open ? JSON.stringify(await dialog(page).innerText()) : "not open"}; url ${page.url()}`);
  }
  return (await dialog(page).locator('[data-testid="translate-price"]').count()) === 1;
}
const sentHtml = (from) => modelAsked.slice(from).some((m) => /<(?:section|nav|html|head|ul|li|p|h1|img|meta|style|script)\b|class=|href=|https?:|#e85d04/.test(String(m.messages?.[0]?.content ?? "")));

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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label}: a three-page site into English ==`);
    setFlags({});
    reset();
    reserved.length = 0;
    settled.length = 0;
    const original = JSON.stringify(store.user_websites[0]);
    const { context, page, press } = await open(APP, device);
    await page.goto(`${APP}/dashboard/website-builder?project=${SITE_ID}`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="site-preview"]').waitFor({ timeout: 30_000 });
    check("the Site offers «Μετάφραση» beside the download", (await page.locator('[data-testid="translate-open"]').getAttribute("aria-label")) === EL.button);
    await openDialog(page, press);
    check("the dialog says the site does not change, before anything is pressed", (await dialog(page).innerText()).includes(EL.copyNoteSite));
    check("English is the language it starts on", (await dialog(page).locator('[data-testid="translate-target"]').inputValue()) === "en");
    check("the price is on screen", await priced(page));
    const quote = await (await page.request.get(`${APP}/api/translate?kind=site&id=${SITE_ID}&target=en`)).json();
    check(`...and it is the route's own number (${quote.estimatedCredits} credits, ${quote.pieces} pieces)`, (await dialog(page).locator('[data-testid="translate-price"]').innerText()).trim() === plural(EL.estimate, quote.estimatedCredits) && quote.from === "el");
    const asked = modelAsked.length;
    await press(dialog(page).locator('[data-testid="translate-go"]'));
    await dialog(page).locator('[data-testid="translate-done"]').waitFor({ timeout: 90_000 });
    const copy = store.user_websites.find((w) => w.id !== SITE_ID && w.id !== BUSY_SITE_ID);
    check("a new site exists, named for its language, the person's own", copy?.name === "Camping Ήλιος · English" && copy?.user_id === MOCK_USER.id && copy?.status === "completed");
    check("the original site is exactly as it was", JSON.stringify(store.user_websites.find((w) => w.id === SITE_ID)) === original);
    check("the home page has the same form: every tag and attribute", skeletonOf(copy.html_content) === skeletonOf(HOME), `${skeletonOf(copy.html_content).slice(0, 200)}`);
    check("...and so does every other page, at the same address, under a translated name", copy.pages?.length === 2 && copy.pages.map((p) => p.slug).join() === "rooms,contact" && copy.pages.map((p) => p.label).join() === "Rooms,Contact" && skeletonOf(copy.pages[0].html) === skeletonOf(ROOMS) && skeletonOf(copy.pages[1].html) === skeletonOf(CONTACT));
    check("the words are English, the names and numbers as they were", copy.html_content.includes("<h1>Welcome to <strong>Camping Ήλιος</strong></h1>") && copy.html_content.includes('alt="Our beach"') && copy.html_content.includes('<a href="/rooms">Rooms</a>') && copy.pages[1].html.includes("<p>Phone: 22890 12345</p>") && copy.html_content.includes('<html lang="en">'));
    check("the colours, the image and the script are untouched", copy.html_content.includes(".hero{background:#e85d04;color:#fff}") && copy.html_content.includes('src="https://images.example/beach.jpg" alt="Our beach" width="1200"') && copy.html_content.includes('document.body.dataset.ready = "ναι";'));
    check("the one piece whose mark came back missing stayed as it was", copy.html_content.includes('<a class="cta" href="/contact">Κλείστε <em>τώρα</em></a>'));
    check("...and the screen says so, with the count", (await dialog(page).locator('[data-testid="translate-kept"]').innerText()).trim() === plural(EL.kept, 1));
    check("the model was sent words and marks, never the page", modelAsked.length > asked && !sentHtml(asked) && modelAsked.slice(asked).every((m) => m.tool_choice?.name === "translations"));
    check(`the hold was the price on screen (${reserved[0]?.p_credits}), and it was settled as a translation`, reserved.length === 1 && Number(reserved[0].p_credits) === quote.reserveCredits && settled.length === 1 && settled[0].p_feature === "document_translate");
    check("the charge is said", (await dialog(page).locator('[data-testid="translate-done"]').innerText()).includes(plural(EL.charged, Number(settled[0]?.p_credits_to_charge ?? 0))));
    await press(dialog(page).locator('[data-testid="translate-open-copy"]'));
    await page.waitForFunction(() => (document.querySelector('[data-testid="tool-shell-work"]')?.getAttribute("aria-label") ?? "").includes("English"), null, { timeout: 15_000 });
    check("«Άνοιξέ το» opens the copy in the Site", (await page.locator('[data-testid="tool-shell-work"]').getAttribute("aria-label")) === "Camping Ήλιος · English" && (await dialog(page).count()) === 0);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

    console.log(`\n== ${device.label}: a document into English ==`);
    await page.goto(`${APP}/dashboard/documents/${DOC_ID}`, { waitUntil: "networkidle" });
    await openDialog(page, press);
    check("the editor offers it, and says the document does not change", (await dialog(page).innerText()).includes(EL.copyNoteDocument) && (await priced(page)));
    const docAsked = modelAsked.length;
    await press(dialog(page).locator('[data-testid="translate-go"]'));
    await dialog(page).locator('[data-testid="translate-done"]').waitFor({ timeout: 90_000 });
    const docCopy = store.user_documents.find((d) => d.content?.translatedFrom === DOC_ID);
    check("a new document, its title translated, the person's own", docCopy?.title === "Offer for the hotel" && docCopy?.user_id === MOCK_USER.id && docCopy?.content?.locale === "en" && docCopy?.content?.source === "written");
    check("...in the same form, every word placed", docCopy?.content?.html === "<h1>What we offer</h1><p>Breakfast for <strong>40 guests</strong> every day.</p><ul><li>Fresh bread</li><li>Cakes of the day</li></ul>", docCopy?.content?.html);
    check("...the original untouched, and the model never sent the HTML", store.user_documents.find((d) => d.id === DOC_ID)?.content?.html === DOC_HTML && !sentHtml(docAsked));
    check("nothing was left behind, so nothing is said about it", (await dialog(page).locator('[data-testid="translate-kept"]').count()) === 0);
    await press(dialog(page).locator('[data-testid="translate-open-copy"]'));
    await page.waitForURL(`**/dashboard/documents/${docCopy.id}`, { timeout: 15_000 });
    await page.locator("main input").first().waitFor();
    check("«Άνοιξέ το» opens the copy in the editor", (await page.locator("main input").first().inputValue()) === "Offer for the hotel");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== in English, desktop: an English document, and the language it is in ==");
  {
    reset();
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false }, "en");
    await page.goto(`${APP}/dashboard/documents/${EN_DOC_ID}`, { waitUntil: "networkidle" });
    check("the button speaks English", (await page.locator('[data-testid="translate-open"]').innerText()).trim() === EN.button);
    await openDialog(page, press);
    await priced(page);
    check("an English document into English: said, and nothing to press", (await dialog(page).locator('[data-testid="translate-refused"]').innerText()).trim() === EN.sameLanguage && (await dialog(page).locator('[data-testid="translate-go"]').isDisabled()));
    await dialog(page).locator('[data-testid="translate-target"]').selectOption("el");
    check("Greek instead: priced", await priced(page));
    const text = await dialog(page).innerText();
    check("the dialog is English throughout", text.includes(EN.title) && text.includes(EN.copyNoteDocument) && !/[Ͱ-Ͽ]/.test(text.replace("Ελληνικά", "")), text.match(/.{0,30}[Ͱ-Ͽ].{0,30}/)?.[0]);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== around it: the provider down, no credits, a site still being made ==");
  {
    reset();
    released.length = 0;
    const { context, page, press } = await open(APP, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${APP}/dashboard/documents/${BAD_DOC_ID}`, { waitUntil: "networkidle" });
    await openDialog(page, press);
    await priced(page);
    const docs = store.user_documents.length;
    await press(dialog(page).locator('[data-testid="translate-go"]'));
    await dialog(page).locator('[data-testid="translate-failed"]').waitFor({ timeout: 90_000 });
    check("the provider down: said, nothing written, the hold given back", (await dialog(page).locator('[data-testid="translate-failed"]').innerText()).trim() === EL.failed && store.user_documents.length === docs && released.length === 1);

    credits[0].credits_remaining = 0;
    await page.goto(`${APP}/dashboard/documents/${DOC_ID}`, { waitUntil: "networkidle" });
    await openDialog(page, press);
    await priced(page);
    const asked = modelAsked.length;
    await press(dialog(page).locator('[data-testid="translate-go"]'));
    await dialog(page).locator('[data-testid="translate-failed"]').waitFor({ timeout: 30_000 });
    check("no credits left: said, before the model is asked", (await dialog(page).locator('[data-testid="translate-failed"]').innerText()).trim() === EL.insufficient && modelAsked.length === asked);
    credits[0].credits_remaining = 3000;

    await page.goto(`${APP}/dashboard/website-builder?project=${BUSY_SITE_ID}`, { waitUntil: "networkidle" });
    check("a site still being made has nothing to translate yet", (await page.locator('[data-testid="translate-open"]').count()) === 0);
    const busy = await page.request.post(`${APP}/api/translate`, { data: { kind: "site", id: BUSY_SITE_ID, target: "en" } });
    check("...and the route agrees", busy.status() === 409 && (await busy.json()).code === "not_ready");
    const theirs = await page.request.post(`${APP}/api/translate`, { data: { kind: "document", id: "00000000-0000-4000-8000-00000000beef", target: "en" } });
    check("a document that is not the person's is not found", theirs.status() === 404);
    await context.close();
  }

  console.log("\n== a Free account, then the switch off ==");
  {
    reset();
    MOCK_USER.user_metadata = { subscription_tier: "free" };
    const { context, page } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    const site = await page.request.post(`${APP}/api/translate`, { data: { kind: "site", id: SITE_ID, target: "en" } });
    check("Free: a site copy is refused, its plan has no Site", site.status() === 403 && (await site.json()).code === "not_included" && store.user_websites.length === 2);
    await page.goto(`${APP}/dashboard/documents/${DOC_ID}`, { waitUntil: "networkidle" });
    check("...a document is translated on every plan, as its PDF is", (await page.locator('[data-testid="translate-open"]').count()) === 1);
    MOCK_USER.user_metadata = { subscription_tier: "growth" };

    setFlags({ translate: "off" });
    await page.goto(`${APP}/dashboard/documents/${DOC_ID}`, { waitUntil: "networkidle" });
    check("with the switch off, the editor has no «Μετάφραση»", (await page.locator('[data-testid="translate-open"]').count()) === 0 && (await page.locator("main input").count()) > 0);
    await page.goto(`${APP}/dashboard/website-builder?project=${SITE_ID}`, { waitUntil: "networkidle" });
    check("...nor the Site", (await page.locator('[data-testid="site-preview"]').count()) === 1 && (await page.locator('[data-testid="translate-open"]').count()) === 0);
    const off = await page.request.post(`${APP}/api/translate`, { data: { kind: "document", id: DOC_ID, target: "en" } });
    const offPrice = await page.request.get(`${APP}/api/translate?kind=document&id=${DOC_ID}&target=en`);
    check("...and the route refuses, the price too", off.status() === 403 && (await off.json()).code === "not_enabled" && offPrice.status() === 403);
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
