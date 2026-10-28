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
 * Run: node scripts/tests/my-stuff-workspace.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/my-stuff-workspace.prodtest.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
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

const FINANCE = [
  { id: "f1", description: "Διαφημίσεις Σεπτεμβρίου", type: "expense", amount: 240, created_at: "2026-09-05T10:00:00Z" },
  { id: "f2", description: "Πώληση πακέτου", type: "income", amount: 500, created_at: "2026-09-12T10:00:00Z" },
];
const SITES = [{ id: "s1", name: "Camping Παραλία", status: "ready", created_at: "2026-08-01T10:00:00Z" }];
const TRADES = [
  { id: "t1", symbol: "BTC", direction: "long", result: "win", pnl: 120, notes: "Είπαμε να κρατήσω πάνω από τις 60000, και κράτησα.", created_at: "2026-09-20T10:00:00Z" },
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
  tableRows: { finance_entries: FINANCE, user_websites: SITES, trades: TRADES },
  handle: handleSessions,
});

let server, browser;
const pageErrors = [];
function cleanup() {
  // DETACHED + GROUP KILL, not server.kill(): `npx next start` spawns a
  // grandchild `next-server` process, and killing only the npx handle
  // leaves that grandchild running — the leak scripts/tests/
  // prodtest-hygiene.test.mjs exists to catch, reproduced in its own
  // section 4.
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
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
  server = spawn("npx", ["next", "start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
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
    check("all four real rows are listed", (await page.locator('[data-testid="my-stuff-list-item"]').count()) === 4);
    check("nothing selected yet reads as empty, not broken", (await page.locator('[data-testid="my-stuff-details-empty"]').count()) === 1);

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
    await waitForSearch(4, null); // back to all four before the questions below read the list

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
    check("no page threw (desktop, " + pageErrors.length + ")", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
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
