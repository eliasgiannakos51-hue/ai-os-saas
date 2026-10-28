/*
 * «1. MY STUFF: ΝΕΑ ΟΘΟΝΗ» (the owner's message, 2026-10-28), Κομμάτια 1
 * ΚΑΙ 2, IN THE BUILT APP: list left, details right, real presses, desktop
 * and phone — no owner screenshot exists to compare against (flagged in
 * docs/NEEDS-FROM-ELIAS.md), so this is the stand-in docs/TOOL-RULES.md
 * rule 3 asks for: a real production build, real taps.
 *
 * Κομμάτι 2's own check is "5 searches and 3 questions, correctly
 * answered" — the 3 questions go through the REAL api/my-stuff/ask
 * route end to end (classify → read → prompt → model → citations →
 * session), the same round trip a real account gets. THE MODEL IS A
 * LOCAL STAND-IN (ANTHROPIC_BASE_URL, the Anthropic SDK's own env var),
 * not the real provider — the owner's "€1 limit for checks with real
 * providers" is for verifying against ionexa.ai itself, which this
 * environment cannot reach anyway (docs/NEEDS-FROM-ELIAS.md, «ΠΡΩΤΑ» Α).
 * Zero spent here, same as scripts/tests/document-writer.prodtest.mjs's
 * own stand-in.
 *
 * ADMIN_EMAILS (below) is what api/my-stuff/ask actually reads for its
 * bypass — isAdminEmail(), not TEST_ACCOUNT_EMAILS (that env var is read
 * by lib/flags/flags.ts and lib/memory/memory-window.ts, nothing in the
 * billing path). Setting it to MOCK_USER's own address makes `bypass`
 * true, which skips hasEnoughCredits/reserveCredits entirely — the same
 * ON-path document-writer.prodtest.mjs itself uses (its own `ON` server,
 * not its `CHARGED` one, which deliberately leaves ADMIN_EMAILS unset to
 * exercise the real reserve/settle round trip instead).
 *
 * Κομμάτι 5 (upload, below) needs BOTH of those: the admin account to
 * prove every file type is accepted, and a SECOND server with
 * ADMIN_EMAILS unset — the same ON/CHARGED idea, same reason — to prove
 * the real per-plan storage cap (lib/files/limits.ts) is actually
 * enforced, not just infinite for whoever happens to be testing it.
 *
 * Run: node scripts/tests/my-stuff-workspace.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/my-stuff-workspace.prodtest.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { containsUi, uiFormat, uiTextStrict } from "./lib/ui-text.mjs";
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

const FINANCE = [
  { id: "f1", description: "Διαφημίσεις Σεπτεμβρίου", type: "expense", amount: 240, created_at: "2026-09-05T10:00:00Z" },
  { id: "f2", description: "Πώληση πακέτου", type: "income", amount: 500, created_at: "2026-09-12T10:00:00Z" },
];
const SITES = [{ id: "s1", name: "Camping Παραλία", status: "ready", created_at: "2026-08-01T10:00:00Z" }];
const TRADES = [
  { id: "t1", symbol: "BTC", direction: "long", result: "win", pnl: 120, notes: "Είπαμε να κρατήσω πάνω από τις 60000, και κράτησα.", created_at: "2026-09-20T10:00:00Z" },
];
// ---------------------------------------------------------------------
// Κομμάτι 3's own seed — one row per bucket the filter row names, dated
// so "newest"/"oldest" have an unambiguous, non-collation answer (s1 is
// the oldest of all ten — Κομμάτι 4 adds a tenth, r1, below — m1 the
// newest) rather than relying on how Intl.Collator happens to
// interleave Greek and Latin titles.
// ---------------------------------------------------------------------
const DOCUMENTS = [{ id: "d1", title: "Σύμβαση πελάτη", content: "...", created_at: "2026-09-01T10:00:00Z" }];
const IMAGES = [{ id: "im1", prompt: "Αφίσα για καλοκαιρινή προσφορά", status: "done", created_at: "2026-09-18T10:00:00Z" }];
const ANALYSES = [{ id: "an1", title: "Πωλήσεις ανά μήνα", file_name: "sales.csv", created_at: "2026-09-22T10:00:00Z" }];
const MEETINGS = [{ id: "m1", title: "Σύσκεψη με τον προμηθευτή", transcript: "...", created_at: "2026-09-25T10:00:00Z" }];
const APPS = [{ id: "ap1", title: "Καταγραφή παραγγελιών", description: "...", created_at: "2026-09-10T10:00:00Z" }];
// A real UUID — isUuid()/projectEdgeFilter() (lib/projects/project.ts)
// both require the shape, not just any string.
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const PROJECTS = [{ id: PROJECT_ID, name: "Καλοκαιρινή καμπάνια", created_at: "2026-08-15T10:00:00Z" }];
// generated_images IS a project-member table (lib/projects/linkable-
// extras.ts's own LINK_ONLY_MODULES) — so is user_documents/meetings/
// user_apps as of Κομμάτι 4 (2026-10-28), which closed that gap. The
// edge below is still just the one the Κομμάτι 3 project-filter test
// needs; the second entity_links row, for Κομμάτι 4's own "Used in"
// check, is below with that section's own seed.
const ENTITY_LINKS = [
  { source_table: "generated_images", source_id: "im1", target_table: "projects", target_id: PROJECT_ID, relationship_type: "in_project", created_at: "2026-09-18T10:05:00Z" },
  // Κομμάτι 4: a plain "related" edge (the default relationship_type,
  // not in_project) between two already-seeded rows — "Used in" is
  // genuinely bidirectional, so this one edge is enough to check it
  // from BOTH ends (selecting d1 shows the image, selecting im1 shows
  // the document).
  { source_table: "generated_images", source_id: "im1", target_table: "user_documents", target_id: "d1", relationship_type: "related", created_at: "2026-09-19T10:00:00Z" },
];
// Κομμάτι 4's "Made from" — the one real, narrow case: a document saved
// from a research report (research_reports.document_id). d1 (already
// seeded above) is both the "Used in" test's target AND this one's, on
// purpose: one real selected row showing two real, independent facts
// about itself is a better check than two rows showing one fact each.
//
// A REAL REPORT IS STILL "ready" after a document is saved from it —
// saving to Documents does not un-finish the report. So r1 is also a
// second real row in the Documents bucket (research is one of its five
// kinds, buckets.ts) and the TENTH real item the counts below now
// expect (ten, not nine, from this point on in the file).
const RESEARCH_REPORTS = [
  { id: "r1", topic: "Ανάλυση ανταγωνισμού", document_id: "d1", status: "ready", created_at: "2026-08-28T10:00:00Z" },
];
const SESSIONS = [
  {
    id: "sess1",
    title: "Πόσα πούλησα τον Σεπτέμβριο;",
    turns: [
      { role: "user", text: "Πόσα πούλησα τον Σεπτέμβριο;" },
      {
        role: "tool",
        text: "500€ από μία πώληση [1].",
        citations: [{ kind: "finance", id: "f2", title: "Πώληση πακέτου", href: "/dashboard/finance?record=f2" }],
      },
    ],
  },
];

// ---------------------------------------------------------------------
// THE SESSIONS TABLE NEEDS REAL INSERT/UPDATE, not the shared mock's
// plain GET-shaped default (startMockSupabase's own `rowsFor` ignores
// the HTTP method entirely) — api/my-stuff/ask creates a row on the
// first question and appends to it on every one after.
// ---------------------------------------------------------------------
let sessionSeq = 0;
function handleSessions({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (table !== "my_stuff_sessions") return false;
  const id = [...url.searchParams].find(([k]) => k === "id")?.[1]?.slice(3);
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
  if (req.method === "GET") return answer(id ? SESSIONS.filter((s) => s.id === id) : SESSIONS), true;
  if (req.method === "POST") {
    const row = { id: `sess${++sessionSeq + 1}`, user_id: MOCK_USER.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...JSON.parse(body || "{}") };
    SESSIONS.push(row);
    return answer([row]), true;
  }
  if (req.method === "PATCH") {
    const hit = id ? SESSIONS.filter((s) => s.id === id) : [];
    for (const row of hit) Object.assign(row, JSON.parse(body || "{}"));
    return answer(hit), true;
  }
  return false;
}

// ---------------------------------------------------------------------
// Κομμάτι 5's own mock surface: an upload. STORAGE IS REAL HERE — the
// bucket keeps real bytes and a call this does not implement FAILS
// rather than the old blanket `200 {}}`, the same principle files-
// workspace.prodtest.mjs's own storage mock states and the same shapes
// ported from it and from file-pages.prodtest.mjs's `storage()`.
//
// Starts at ZERO files/bytes — a fresh account's honest starting point —
// so the two checks below (desktop: every file type; the second server:
// the real per-plan cap) do not have to account for a pre-seeded
// baseline on top of what they themselves upload.
// ---------------------------------------------------------------------
const USER_FILES = [];
const bucket = new Map(); // storage path -> Buffer

/**
 * supabase-js wraps a browser File in multipart/form-data; a server-side
 * Buffer upload (lib/files/ingest.ts, when the bytes arrive via /api/
 * files/upload instead of a direct browser->bucket write) arrives raw.
 * Operates on `raw` — mock-supabase.mjs's own undecoded Buffer — never
 * on the UTF-8-decoded `body` string files-pages.prodtest.mjs's own
 * version of this reads, which would corrupt a real ZIP's bytes on the
 * round trip (its own fixture survives only because a generated PDF of
 * ASCII text happens not to).
 */
function extractMultipartFile(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? "");
  if (!m) return buf;
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`);
  let largest = null;
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const next = buf.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    const part = buf.subarray(pos + boundary.length, next);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString();
      const partBody = part.subarray(headerEnd + 4, part.length - 2); // strip trailing \r\n
      if (/filename=/i.test(headers)) return partBody;
      if (largest === null || partBody.length > largest.length) largest = partBody;
    }
    pos = next;
  }
  return largest ?? buf;
}

function storage({ req, res, url, raw, json }) {
  if (req.method === "DELETE" && url.pathname === "/storage/v1/object/user-files") {
    // The ONLY delete shape storage-js sends (.remove() posts `prefixes`,
    // never a per-object DELETE URL) — ingestFileBytes's own `refuse()`
    // calls this on every refusal, to clean up the already-uploaded
    // object so a refused upload cannot squat against the user's quota.
    let prefixes = [];
    try { prefixes = JSON.parse(raw.toString("utf8") || "{}").prefixes ?? []; } catch {}
    for (const p of prefixes) bucket.delete(p);
    return json(200, prefixes.map((name) => ({ name }))), true;
  }
  const m = /^\/storage\/v1\/object\/(?:authenticated\/)?user-files\/(.+)$/.exec(url.pathname);
  if (!m) return false;
  const objectPath = decodeURIComponent(m[1]);
  if (req.method === "POST" || req.method === "PUT") {
    const ctype = req.headers["content-type"] ?? "";
    bucket.set(objectPath, ctype.startsWith("multipart/form-data") ? extractMultipartFile(raw, ctype) : raw);
    return json(200, { Key: `user-files/${objectPath}`, Id: objectPath }), true;
  }
  if (req.method === "GET") {
    const stored = bucket.get(objectPath);
    if (!stored) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" }), true;
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(stored);
    return true;
  }
  return false;
}

/** The one write user_files needs that the shared mock's plain
 *  GET-shaped default cannot do — lib/files/ingest.ts's own
 *  `createAdminClient().from("user_files").insert({...}).select(...)
 *  .single()`, answered as the single row PostgREST's own `Accept:
 *  vnd.pgrst.object+json` expects, exactly as files-workspace.
 *  prodtest.mjs's own POST handler for this table already does. GET/
 *  HEAD (the list, and the count/sum reads lib/files/ingest.ts's own
 *  plan-cap checks make) are left to the shared mock's default — it
 *  already reads straight off this same array, by reference. */
function filesTable({ req, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "").split("?")[0];
  if (table !== "user_files" || req.method !== "POST") return false;
  let row;
  try {
    row = JSON.parse(body || "{}");
  } catch {
    return json(400, { message: "bad body" }), true;
  }
  row.id = `uf${USER_FILES.length + 1}`;
  row.uploaded_at = new Date().toISOString();
  USER_FILES.unshift(row);
  return json(201, row), true;
}

// ---------------------------------------------------------------------
// THE MODEL: a local stand-in answering as Anthropic does
// (ANTHROPIC_BASE_URL, the SDK's own env var) — the real provider is
// never called. It reads back the SAME context the route rendered
// (renderMyStuffContext's "[n] (kind, date) text" lines) to find the
// right citation number, rather than hardcoding one — the index moves
// with which kinds classify() decided to read for a given question.
// ---------------------------------------------------------------------
const modelAsked = [];
function citeFor(prompt, needle) {
  const m = new RegExp(`\\[(\\d+)\\][^\\n]*${needle}`).exec(prompt);
  return m ? m[1] : null;
}
const model = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const sent = JSON.parse(raw || "{}");
    modelAsked.push(sent);
    const prompt = String(sent.messages?.[0]?.content ?? "");
    let text = "Δεν βρήκα σχετική πληροφορία.";
    const sale = citeFor(prompt, "Πώληση πακέτου");
    const site = citeFor(prompt, "Camping Παραλία");
    const btc = citeFor(prompt, "BTC");
    if (sale && /Σεπτέμβρι|spend|sold|sell/i.test(prompt)) text = `500€ από μία πώληση [${sale}].`;
    else if (site) text = `Το site είναι το «Camping Παραλία» [${site}].`;
    else if (btc) text = `Είπες να κρατήσεις πάνω από τις 60000 [${btc}].`;
    res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
    res.end(JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 400, output_tokens: 60 },
    }));
  });
});
await new Promise((r) => model.listen(0, "127.0.0.1", r));

const supa = await startMockSupabase({
  port: 54415,
  tableRows: {
    finance_entries: FINANCE,
    user_websites: SITES,
    trades: TRADES,
    user_documents: DOCUMENTS,
    generated_images: IMAGES,
    data_analyses: ANALYSES,
    meetings: MEETINGS,
    user_apps: APPS,
    projects: PROJECTS,
    entity_links: ENTITY_LINKS,
    research_reports: RESEARCH_REPORTS,
    user_files: USER_FILES,
  },
  handle: (ctx) => storage(ctx) || filesTable(ctx) || handleSessions(ctx),
});

// AN ARRAY, NOT ONE SLOT: Κομμάτι 5 (below) starts a SECOND `next start`
// — a non-admin account to exercise the real per-plan storage cap, since
// ADMIN_EMAILS (the `base` env, below) makes every cap infinite for the
// account every other section in this file uses. A second `start()` call
// that overwrote a single `server` variable would leak the first
// process — exactly what prodtest-hygiene.test.mjs exists to catch — so
// this mirrors scripts/tests/document-writer.prodtest.mjs's own `servers`
// array, built for the same reason (its ON vs CHARGED servers).
const servers = [];
let browser;
const pageErrors = [];
function cleanup() {
  // DETACHED + GROUP KILL, not server.kill(): `npx next start` spawns a
  // grandchild `next-server` process, and killing only the npx handle
  // leaves that grandchild running — the leak scripts/tests/
  // prodtest-hygiene.test.mjs exists to catch, reproduced in its own
  // section 4.
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { browser?.close(); } catch {}
  try { supa.close(); } catch {}
  try { model.close(); } catch {}
}
process.on("exit", cleanup);

async function start(env) {
  const port = await new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port: p } = probe.address();
      probe.close(() => resolve(p));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn("npx", ["next", "start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
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
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [{ ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" }].map(({ domain, path: p, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  const cdp = device.touch ? await context.newCDPSession(page) : null;
  async function press(locator) {
    await locator.first().evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.first().click();
    const box = await locator.first().boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return { context, page, press };
}

const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  ADMIN_EMAILS: MOCK_USER.email,
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${model.address().port}`,
};

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

  console.log("\n== desktop: the screen is list left, details right ==");
  {
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/my-stuff`, { waitUntil: "load" });
    await page.locator('[data-testid="my-stuff-list-item"]').first().waitFor({ timeout: 15_000 });
    check("all ten real rows are listed", (await page.locator('[data-testid="my-stuff-list-item"]').count()) === 10);
    check("nothing selected yet reads as empty, not broken", (await page.locator('[data-testid="my-stuff-details-empty"]').count()) === 1);
    check(
      "newest-first by default: the most recent row (a meeting) leads",
      (await page.locator('[data-testid="my-stuff-list-item"]').first().innerText()).includes("Σύσκεψη με τον προμηθευτή")
    );

    const financeRow = page.locator('[data-testid="my-stuff-list-item"][data-kind="finance"]').filter({ hasText: "Πώληση πακέτου" });
    await press(financeRow);
    await page.locator('[data-testid="my-stuff-details"]').waitFor({ timeout: 10_000 });
    const detailsText = await page.locator('[data-testid="my-stuff-details"]').innerText();
    check("selecting a row shows ITS OWN title in the details pane", detailsText.includes("Πώληση πακέτου"));
    const openHref = await page.locator('[data-testid="my-stuff-open"]').getAttribute("href");
    check("the Open link points at the real record", openHref === "/dashboard/finance?record=f2", openHref);

    const siteRow = page.locator('[data-testid="my-stuff-list-item"][data-kind="site"]');
    await press(siteRow);
    const detailsText2 = await page.locator('[data-testid="my-stuff-details"]').innerText();
    check("selecting a DIFFERENT row replaces the details, not appends", detailsText2.includes("Camping") && !detailsText2.includes("Πώληση πακέτου"));

    console.log("\n== desktop: the history drawer still reaches the old Q&A sessions ==");
    await press(page.locator('[data-testid="my-stuff-history-open"]'));
    await page.locator('[data-testid="shell-history-row"]').first().waitFor({ timeout: 10_000 });
    await press(page.locator('[data-testid="shell-history-row"]').first());
    await page.locator('[data-testid="my-stuff-history-turns"]').waitFor({ timeout: 10_000 });
    const turnsText = await page.locator('[data-testid="my-stuff-history-turns"]').innerText();
    check("the real question is still there", turnsText.includes("Πόσα πούλησα"));
    check("...and the real answer, with its citation chip", turnsText.includes("500€"));
    await press(page.locator('[data-testid="my-stuff-history-close"]'));

    // -----------------------------------------------------------------
    // Κομμάτι 2's own check: "5 αναζητήσεις και 3 ερωτήσεις με σωστή
    // απάντηση" — ONE field (my-stuff-search), two outcomes. Typing is
    // the plain substring filter the list already had; a term is held
    // until the fetch it triggers (no debounce) has actually replaced
    // `items`, polled rather than assumed, since the mock server still
    // answers over a real socket.
    // -----------------------------------------------------------------
    console.log("\n== desktop: 5 real searches, same field, plain substring ==");
    // WAITS ON THE ROW'S OWN TEXT, NOT JUST THE COUNT — two searches in a
    // row that both land on exactly one row (e.g. "Camping" right after
    // "Πώληση") would otherwise read the STALE one-row list from the
    // search before it as already satisfying "count === 1" before the
    // new fetch has actually replaced `items`.
    async function waitForSearch(wantCount, mustContain, timeout = 8000) {
      const end = Date.now() + timeout;
      let n = -1, texts = "";
      while (Date.now() < end) {
        n = await page.locator('[data-testid="my-stuff-list-item"]').count();
        texts = n > 0 ? (await page.locator('[data-testid="my-stuff-list-item"]').allInnerTexts()).join(" | ") : "";
        if (n === wantCount && (!mustContain || texts.includes(mustContain))) return { n, texts };
        await page.waitForTimeout(100);
      }
      return { n, texts };
    }
    async function searchFor(term) {
      await page.locator('[data-testid="my-stuff-search"]').fill(term);
    }

    await searchFor("Πώληση");
    let r = await waitForSearch(1, "Πώληση πακέτου");
    check("search 1/5 'Πώληση' finds exactly the one finance row", r.n === 1 && r.texts.includes("Πώληση πακέτου"), r.texts);

    await searchFor("Camping");
    r = await waitForSearch(1, "Camping Παραλία");
    check("search 2/5 'Camping' finds exactly the one site row", r.n === 1 && r.texts.includes("Camping Παραλία"), r.texts);

    await searchFor("Διαφημίσεις");
    r = await waitForSearch(1, "Διαφημίσεις Σεπτεμβρίου");
    check("search 3/5 'Διαφημίσεις' finds exactly the one expense row", r.n === 1 && r.texts.includes("Διαφημίσεις Σεπτεμβρίου"), r.texts);

    await searchFor("BTC");
    r = await waitForSearch(1, "BTC");
    check("search 4/5 'BTC' finds exactly the one trade row", r.n === 1 && r.texts.includes("BTC"), r.texts);

    await searchFor("zzz_no_such_record_48213");
    r = await waitForSearch(0, null);
    check(
      "search 5/5 a guaranteed miss shows the empty state, not a stale list",
      r.n === 0 && (await page.locator('[data-testid="my-stuff-empty"]').isVisible())
    );

    await searchFor("");
    await waitForSearch(10, null); // back to all ten before the questions below read the list

    // -----------------------------------------------------------------
    // The SAME field's other job: submitting asks a real question
    // through /api/my-stuff/ask end to end (classify -> read -> prompt
    // -> model stand-in -> citations -> session), never the list filter.
    // -----------------------------------------------------------------
    console.log("\n== desktop: 3 real questions, correctly answered, with citations ==");
    async function askUi(question) {
      await page.locator('[data-testid="my-stuff-search"]').fill(question);
      await press(page.locator('[data-testid="my-stuff-ask-send"]'));
      // The dismiss button only renders once asking has resolved into a
      // real answer or a real error — the one DOM signal that the round
      // trip (not just the click) is done.
      await page.locator('[data-testid="my-stuff-answer-dismiss"]').waitFor({ timeout: 20_000 });
      return page.locator('[data-testid="my-stuff-answer"]').innerText();
    }

    const a1 = await askUi("Πόσα έσοδα είχα τον Σεπτέμβριο;");
    check("question 1/3 (finance) answers from the real row", a1.includes("500€"), a1);
    check(
      "...with a citation chip to the real finance record",
      await page.locator('[data-testid="my-stuff-citation"][href="/dashboard/finance?record=f2"]').isVisible()
    );
    await press(page.locator('[data-testid="my-stuff-answer-dismiss"]'));

    const a2 = await askUi("Ποιο site έφτιαξα για το κάμπινγκ;");
    check("question 2/3 (site) answers from the real row", a2.includes("Camping Παραλία"), a2);
    check(
      "...with a citation chip to the real site record",
      await page.locator('[data-testid="my-stuff-citation"][href="/dashboard/website-builder?project=s1"]').isVisible()
    );
    await press(page.locator('[data-testid="my-stuff-answer-dismiss"]'));

    const a3 = await askUi("Τι σημείωσα στο trade με το BTC;");
    check("question 3/3 (trading) answers from the real row", a3.includes("60000"), a3);
    check(
      "...with a citation chip to the real trade record",
      await page.locator('[data-testid="my-stuff-citation"][href="/dashboard/trading?record=t1"]').isVisible()
    );
    await press(page.locator('[data-testid="my-stuff-answer-dismiss"]'));

    check("all 3 model calls actually happened (not a cached/stale page)", modelAsked.length === 3, String(modelAsked.length));

    // -----------------------------------------------------------------
    // Κομμάτι 3's own check: "κάθε φίλτρο δείχνει μόνο τα σωστά" — each
    // filter shows only the correct ones. The search field still holds
    // Κομμάτι 2's last question; clear it first so a filter result is
    // never read through a stale text search too.
    // -----------------------------------------------------------------
    console.log("\n== desktop: filters — All/Documents/Images/Data/More/Project/Sort ==");
    await searchFor("");
    await waitForSearch(10, null);

    async function pickBucket(bucket, wantCount, mustContain) {
      await press(page.locator(`[data-testid="my-stuff-filter"][data-bucket="${bucket}"]`));
      return waitForSearch(wantCount, mustContain);
    }

    // Documents = document/research/slides/posts/file. r1 (Κομμάτι 4's
    // own research report, status "ready") is a real second row here —
    // slides/posts/file have none seeded, so the real count is two.
    let f = await pickBucket("documents", 2, "Σύμβαση πελάτη");
    check(
      "Documents shows the document AND the research report, nothing else",
      f.n === 2 && f.texts.includes("Σύμβαση πελάτη") && f.texts.includes("Ανάλυση ανταγωνισμού"),
      f.texts
    );

    f = await pickBucket("images", 1, "Αφίσα για καλοκαιρινή προσφορά");
    check("Images shows only the one image row", f.n === 1 && f.texts.includes("Αφίσα για καλοκαιρινή προσφορά"), f.texts);

    // Data = analysis + finance + sales + trading. Sales has no seeded
    // row — this account genuinely has none — so the real count is the
    // other three: 1 analysis + 2 finance + 1 trading.
    f = await pickBucket("data", 4, "Πωλήσεις ανά μήνα");
    check(
      "Data shows analysis+finance+trading, not documents or images",
      f.n === 4 && f.texts.includes("Πωλήσεις ανά μήνα") && f.texts.includes("Διαφημίσεις") && f.texts.includes("BTC") && !f.texts.includes("Σύμβαση πελάτη"),
      f.texts
    );

    await press(page.locator('[data-testid="my-stuff-filter-more"]'));
    await page.locator('[data-testid="my-stuff-filters-more"]').waitFor({ timeout: 5_000 });

    f = await pickBucket("video", 0, null);
    check("Video is honestly empty — no backing table exists yet", f.n === 0 && (await page.locator('[data-testid="my-stuff-empty"]').isVisible()));

    // A BRIDGE BACK TO A NON-EMPTY BUCKET, not asserted on its own —
    // without it, "Video" and "Audio" are both count===0, and the second
    // click's fetch could still be in flight while the FIRST one's
    // already-empty list satisfies "count === 0" on the very first poll,
    // the identical race waitForSearch's own comment already names for
    // two one-result searches in a row.
    await pickBucket("images", 1, "Αφίσα για καλοκαιρινή προσφορά");

    f = await pickBucket("audio", 0, null);
    check("Audio is honestly empty — no backing table exists yet", f.n === 0 && (await page.locator('[data-testid="my-stuff-empty"]').isVisible()));

    f = await pickBucket("sitesApps", 2, "Camping Παραλία");
    check(
      "Sites and Apps shows the site AND the app, nothing else",
      f.n === 2 && f.texts.includes("Camping Παραλία") && f.texts.includes("Καταγραφή παραγγελιών"),
      f.texts
    );

    f = await pickBucket("meetings", 1, "Σύσκεψη με τον προμηθευτή");
    check("Meetings shows only the one meeting", f.n === 1 && f.texts.includes("Σύσκεψη με τον προμηθευτή"), f.texts);

    f = await pickBucket("all", 10, null);
    check("All, pressed again, returns every row", f.n === 10, f.texts);

    console.log("\n== desktop: the Project filter reads real entity_links membership ==");
    const projectSelect = page.locator('[data-testid="my-stuff-filter-project"]');
    await projectSelect.selectOption(PROJECT_ID);
    f = await waitForSearch(1, "Αφίσα για καλοκαιρινή προσφορά");
    check(
      "picking the project shows only its one real member (the image), not all ten",
      f.n === 1 && f.texts.includes("Αφίσα για καλοκαιρινή προσφορά"),
      f.texts
    );
    await projectSelect.selectOption("");
    await waitForSearch(10, null);

    console.log("\n== desktop: Sort reorders by date, reversibly, without changing WHICH ten ==");
    // Purely client-side (useSortAndPaginate, no round trip) — polled
    // the same careful way as the search checks above, since a click and
    // React's re-render are still two different ticks.
    async function waitForFirstItem(mustContain, timeout = 5000) {
      const end = Date.now() + timeout;
      let text = "";
      while (Date.now() < end) {
        text = await page.locator('[data-testid="my-stuff-list-item"]').first().innerText();
        if (text.includes(mustContain)) return text;
        await page.waitForTimeout(100);
      }
      return text;
    }
    const sortButtons = page.locator('[data-testid="my-stuff-sort"] button');
    await press(sortButtons.nth(1)); // oldest
    check("'oldest' puts the actual oldest row (the site) first", (await waitForFirstItem("Camping Παραλία")).includes("Camping Παραλία"));
    await press(sortButtons.nth(0)); // newest
    check(
      "'newest' puts the actual newest row (the meeting) first again",
      (await waitForFirstItem("Σύσκεψη με τον προμηθευτή")).includes("Σύσκεψη με τον προμηθευτή")
    );
    await press(sortButtons.nth(2)); // az
    const azTitles = await page.locator('[data-testid="my-stuff-list-item"]').allInnerTexts();
    await press(sortButtons.nth(3)); // za
    const zaTitles = await page.locator('[data-testid="my-stuff-list-item"]').allInnerTexts();
    check(
      "A-Z and Z-A are exact reverses of each other (same ten, opposite order)",
      azTitles.length === 10 && zaTitles.length === 10 && JSON.stringify(azTitles) === JSON.stringify([...zaTitles].reverse()),
      azTitles.join(" | ") + "\n        -- vs --\n        " + zaTitles.join(" | ")
    );
    await press(sortButtons.nth(0)); // back to newest, the default, before anything else reads this list

    // -----------------------------------------------------------------
    // Κομμάτι 4's own check: "οι σύνδεσμοι ανοίγουν το σωστό" — every
    // link the details pane now draws opens the real thing. d1 (the
    // document) carries BOTH a real "Made from" (research_reports.
    // document_id) and a real "Used in" edge (entity_links, "related",
    // to im1) at once — one selected row, two independent real facts.
    // -----------------------------------------------------------------
    console.log("\n== desktop: details — Made from, Used in, who sees it, Add to Project, Link to ==");
    async function waitForTestId(testid, timeout = 8000) {
      await page.locator(`[data-testid="${testid}"]`).waitFor({ timeout });
    }

    await press(page.locator('[data-testid="my-stuff-list-item"][data-kind="document"]'));
    await page.locator('[data-testid="my-stuff-details"]').waitFor({ timeout: 10_000 });

    await waitForTestId("my-stuff-made-from");
    const madeFromText = await page.locator('[data-testid="my-stuff-made-from"]').innerText();
    check("Made from shows the real research report (document <- research_reports.document_id)", madeFromText.includes("Ανάλυση ανταγωνισμού"), madeFromText);
    const madeFromHref = await page.locator('[data-testid="my-stuff-made-from"] a').getAttribute("href");
    check("...with a real link to that report", madeFromHref === "/dashboard/deep-research?record=r1", madeFromHref);

    // THE WRAPPER <div> IS ALWAYS IN THE DOM (LinkedEntities itself
    // renders null when empty) — waiting on it alone would not wait for
    // the async fetch at all, so this waits on the real signal: an
    // actual link appearing inside it.
    await page.locator('[data-testid="my-stuff-used-in"] a').first().waitFor({ timeout: 8_000 });
    let usedInText = await page.locator('[data-testid="my-stuff-used-in"]').innerText();
    check("Used in shows the real linked image (document's own side of a real entity_links row)", usedInText.includes("Αφίσα για καλοκαιρινή προσφορά"), usedInText);
    let usedInHref = await page.locator('[data-testid="my-stuff-used-in"] a').getAttribute("href");
    check("...with a real link to the images tool", usedInHref === "/dashboard/generated-images", usedInHref);

    const viewersText = await page.locator('[data-testid="my-stuff-viewers"]').innerText();
    check(
      "Who sees this answers honestly — no sharing exists for any kind yet",
      containsUi(viewersText, await uiTextStrict(page, "dashboard.myStuff.details.viewersAnswer")),
      viewersText
    );

    await press(page.getByRole("button", { name: "Add to project" }));
    await page.locator('[data-testid="add-to-project-list"]').waitFor({ timeout: 8_000 });
    const dialogVisible = await page.locator('[role="dialog"]').isVisible();
    const projectListVisible = await page.locator('[data-testid="add-to-project-list"]').isVisible();
    check("Add to Project opens the real picker, with the real project in it", dialogVisible && projectListVisible, `dialog=${dialogVisible} list=${projectListVisible}`);
    await page.keyboard.press("Escape");
    await page.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 5_000 });

    await press(page.getByRole("button", { name: "Link to..." }));
    await page.locator('[role="dialog"]').waitFor({ timeout: 8_000 });
    check("Link to... opens the real picker", await page.locator('[role="dialog"]').isVisible());
    await page.keyboard.press("Escape");
    await page.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 5_000 });

    // THE OTHER SIDE OF THE SAME REAL EDGE — selecting im1 must show the
    // document, not re-show its own side, which is exactly what a
    // directed (not bidirectional) read would get wrong.
    await press(page.locator('[data-testid="my-stuff-list-item"][data-kind="images"]'));
    await page.locator('[data-testid="my-stuff-details"]').waitFor({ timeout: 10_000 });
    await page.locator('[data-testid="my-stuff-used-in"] a').first().waitFor({ timeout: 8_000 });
    usedInText = await page.locator('[data-testid="my-stuff-used-in"]').innerText();
    check("...and from the OTHER side, the same real edge shows the document", usedInText.includes("Σύμβαση πελάτη"), usedInText);
    usedInHref = await page.locator('[data-testid="my-stuff-used-in"] a').getAttribute("href");
    check("...with a real link to Documents", usedInHref === "/dashboard/documents", usedInHref);
    check("...and images has no 'Made from' — nothing generates an image from another record today", (await page.locator('[data-testid="my-stuff-made-from"]').count()) === 0);

    // A ROW WITH NEITHER FACT must show neither section — the honest
    // negative case, not an empty placeholder pretending to be data.
    const financeRow2 = page.locator('[data-testid="my-stuff-list-item"][data-kind="finance"]').filter({ hasText: "Πώληση πακέτου" });
    await press(financeRow2);
    await page.locator('[data-testid="my-stuff-details"]').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(400); // the one case with no async fetch result to wait FOR — give it a moment to not appear
    check("a row with no real lineage shows no 'Made from'", (await page.locator('[data-testid="my-stuff-made-from"]').count()) === 0);
    check("...and no real links shows no 'Used in'", (await page.locator('[data-testid="my-stuff-used-in"] a').count()) === 0);

    console.log("\n== desktop: upload — every file type, held to the same quota as any other file ==");
    // ADMIN_EMAILS (base, below) bypasses BOTH plan caps for this account
    // (lib/files/ingest.ts's own isAdminEmail check) — exactly the Κομμάτι
    // 2 reason that env exists in this file at all. So what THIS account
    // can prove is the "every file type" half and an HONEST zero-baseline
    // readout; the "όριο αποθήκευσης ανά πλάνο" half — a REAL numeric cap,
    // and a REAL refusal for crossing it — needs an account that is NOT
    // bypassed, which is the second server, after this one closes.
    const { formatBytes } = await loadTs("src/lib/format-bytes.ts");
    check(
      "before any upload, the real usage reads zero — not hidden, not guessed",
      containsUi(await page.locator('[data-testid="my-stuff-upload-usage"]').innerText(), formatBytes(0))
    );

    // A REAL ZIP MAGIC NUMBER (`PK\x03\x04`) with a `.zip` extension —
    // the one shape sniffFileType (lib/files/file-types.ts) ALREADY
    // refuses on purpose (DOCX/XLSX are zips too; the magic number is
    // only accepted for THOSE two extensions). A kind the Files tool's
    // own six-kind sniff already accepted would prove nothing Κομμάτι 5
    // added — this is "κάθε τύπου αρχείου" or it is nothing.
    const ZIP_NAME = "Αρχειοθήκη.zip";
    const ZIP_BYTES = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(2044, 0x41)]); // 2048 bytes total
    await page.setInputFiles('[data-testid="my-stuff-upload-input"]', {
      name: ZIP_NAME,
      mimeType: "application/zip",
      buffer: ZIP_BYTES,
    });
    const zipRow = page.locator('[data-testid="my-stuff-list-item"][data-kind="file"]').filter({ hasText: ZIP_NAME });
    await zipRow.first().waitFor({ timeout: 15_000 });
    check(
      "a type the Files tool refuses (a .zip) is accepted and listed, by this upload alone",
      (await zipRow.count()) === 1
    );
    check("...and the total grew by exactly one (11, not 10 or 12)", (await page.locator('[data-testid="my-stuff-list-item"]').count()) === 11);

    await press(zipRow);
    await page.locator('[data-testid="my-stuff-details"]').waitFor({ timeout: 10_000 });
    const zipOpenHref = await page.locator('[data-testid="my-stuff-open"]').getAttribute("href");
    check("Open points at the real file record, the same href a readable file gets", /^\/dashboard\/files\?record=/.test(zipOpenHref ?? ""), zipOpenHref);
    check("a brand-new upload has no 'Made from' — nothing points at it yet", (await page.locator('[data-testid="my-stuff-made-from"]').count()) === 0);
    check("...and no 'Used in' — nothing links to it yet", (await page.locator('[data-testid="my-stuff-used-in"] a').count()) === 0);

    const usageAfterZip = await page.locator('[data-testid="my-stuff-upload-usage"]').innerText();
    check(
      `the real usage grows by this file's own real size ("${usageAfterZip}")`,
      containsUi(usageAfterZip, formatBytes(ZIP_BYTES.length))
    );

    check("no page threw (desktop, " + pageErrors.length + ")", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== a SECOND, non-admin server: the real per-plan storage cap ==");
  // The same reason document-writer.prodtest.mjs runs an ON server and a
  // CHARGED one: ADMIN_EMAILS above makes this account's caps infinite,
  // so the only way to see the REAL number lib/files/limits.ts computes
  // for an actual plan — and a REAL refusal for crossing it — is an
  // account this env does not bypass. Free has no subscription_tier in
  // user_metadata, so resolvePlanSlug (lib/billing/plan-resolution.ts)
  // resolves it to "free" with no seeding needed.
  //
  // FILE_STORAGE_MB_FREE overrides ONLY the free-plan ceiling (lib/
  // files/limits.ts's own env escape hatch, STORAGE_LIMIT_ENV_VARS) to
  // 1MB so this check uploads kilobytes, not fifty real megabytes, to
  // prove the same mechanism — the real default (free: 50MB) is checked
  // by name in scripts/tests/combined-ceiling.test.mjs, not re-asserted
  // here.
  {
    const FREE_CAP_BYTES = 1 * 1024 * 1024;
    const { formatBytes } = await loadTs("src/lib/format-bytes.ts");
    const APP2 = await start({ ...base, ADMIN_EMAILS: "", FILE_STORAGE_MB_FREE: "1" });
    const { context, page } = await open(APP2, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP2}/dashboard/my-stuff`, { waitUntil: "load" });
    await page.locator('[data-testid="my-stuff-list-item"]').first().waitFor({ timeout: 15_000 });

    // THE SAME ACCOUNT, THE SAME STORAGE — this server reads the SAME
    // mock Supabase as the admin one above, so the one real file already
    // uploaded there (2048 bytes) is this account's own real usage too.
    const usageBefore = await page.locator('[data-testid="my-stuff-upload-usage"]').innerText();
    check(
      `the real 1MB free-plan cap is shown, not hidden by admin bypass ("${usageBefore}")`,
      containsUi(usageBefore, await uiFormat(page, "dashboard.files.storage", { used: formatBytes(2048), cap: formatBytes(FREE_CAP_BYTES) }))
    );

    // 2048 (already used) + 1,100,000 is over the 1,048,576-byte cap —
    // deliberately, by a real margin, not a boundary rounding could flip.
    const OVER_BYTES = Buffer.alloc(1_100_000, 0x42);
    await page.setInputFiles('[data-testid="my-stuff-upload-input"]', {
      name: "Πολύ-μεγάλο.bin",
      mimeType: "application/octet-stream",
      buffer: OVER_BYTES,
    });
    // NOT a join of every toast — this account's own seed data (finance,
    // trading, a site) fires unrelated "Achievement unlocked" toasts on
    // its first real page load, which would otherwise drown the one
    // this check is actually about.
    const capToast = page.locator('[role="status"]', { hasText: await uiTextStrict(page, "dashboard.files.uploadStorageCap") });
    await capToast.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    const capToastText = await capToast.first().innerText().catch(() => "");
    check(
      `crossing the real cap is refused, by name, not silently accepted ("${capToastText}")`,
      containsUi(capToastText, await uiTextStrict(page, "dashboard.files.uploadStorageCap"))
    );
    check(
      "...and not the generic \"could not be uploaded\"",
      !containsUi(capToastText, await uiTextStrict(page, "dashboard.files.uploadError"))
    );
    check(
      "the refused upload left no phantom row — the count is unchanged (11, not 12)",
      (await page.locator('[data-testid="my-stuff-list-item"]').count()) === 11
    );

    check("no page threw (second server, " + pageErrors.length + ")", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== phone (390x844): list OR details, never squeezed side by side ==");
  {
    const { context, page, press } = await open(APP, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${APP}/dashboard/my-stuff`, { waitUntil: "load" });
    await page.locator('[data-testid="my-stuff-list-item"]').first().waitFor({ timeout: 15_000 });
    check("the list is visible", await page.locator('[data-testid="my-stuff-list"]').isVisible());
    check("no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    const row = page.locator('[data-testid="my-stuff-list-item"]').first();
    await press(row);
    await page.locator('[data-testid="my-stuff-details"]').waitFor({ timeout: 10_000 });
    check("the details pane covers the screen, the list is gone", await page.locator('[data-testid="my-stuff-details"]').isVisible() && !(await page.locator('[data-testid="my-stuff-list"]').isVisible()));
    const backTarget = page.locator('[data-testid="my-stuff-details-back"]');
    const box = await backTarget.boundingBox();
    check(`the back arrow is at least 44px (${Math.round(box?.height ?? 0)}px)`, (box?.height ?? 0) >= 44 && (box?.width ?? 0) >= 44);
    await press(backTarget);
    await page.locator('[data-testid="my-stuff-list"]').waitFor({ state: "visible", timeout: 10_000 });
    check("back returns to the list", await page.locator('[data-testid="my-stuff-list"]').isVisible());
    check("no page threw (phone, " + pageErrors.length + ")", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${failures.length} failed`);
  if (failures.length) console.log(failures.map((f) => "  - " + f).join("\n"));
  cleanup();
  process.exit(failures.length === 0 ? 0 : 1);
} catch (err) {
  console.log("  FAIL  unexpected error\n        " + (err?.stack ?? err));
  cleanup();
  process.exit(1);
}
