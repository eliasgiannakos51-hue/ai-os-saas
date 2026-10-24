/*
 * TRANSLATE, AS ITS OWN TOOL (the owner's "ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ",
 * 2026-10-24) — IN THE BUILT APP. Piece 1 (the screen opens, in the common
 * shape, on a computer and on a phone) and piece 2 (text in, a
 * translation out for every language chosen, paragraph by paragraph,
 * beside the original), behind the switch "translate-tool".
 *
 * Run: node scripts/tests/translate-tool.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/translate-tool.prodtest.mjs
 *
 * The model is a local server answering as Anthropic does
 * (ANTHROPIC_BASE_URL), tagging each paragraph with the language it was
 * asked for so the test can tell the five possible targets apart without
 * a phrase dictionary — the form has no marks to protect here (plain
 * text, not HTML), which is the one thing genuinely simpler than
 * translate.prodtest.mjs's site/document case.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { loadTs } from "./load-ts.mjs";

const { describeLocale } = await loadTs("src/lib/documents/translation.ts");

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

const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const reserved = [];
const settled = [];
// ONE ROW PER USER, A REAL UPSERT — not the generic store's POST-is-
// always-insert shape, since api/translate/glossary/route.ts's PUT
// genuinely replaces the one row rather than adding another.
const glossaryRows = {};
function rest({ req, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (table === "rpc/reserve_credits") {
    const args = JSON.parse(body || "{}");
    const enough = credits[0].credits_remaining >= Number(args.p_credits ?? 0);
    if (enough) reserved.push(args);
    return json(200, enough ? [{ reservation_id: `r${reserved.length}`, available: credits[0].credits_remaining }] : []), true;
  }
  if (table === "rpc/settle_reservation") return settled.push(JSON.parse(body || "{}")), json(200, null), true;
  if (table === "rpc/release_reservation") return json(200, null), true;
  if (table === "translate_glossary") {
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    if (req.method === "GET") {
      const row = glossaryRows[MOCK_USER.id] ?? null;
      return single ? (row ? json(200, row) : json(406, { message: "no rows" })) : json(200, row ? [row] : []), true;
    }
    if (req.method === "POST") {
      const row = JSON.parse(body || "{}");
      glossaryRows[row.user_id] = row;
      return json(201, [row]), true;
    }
    return false;
  }
  return false;
}
const supa = await startMockSupabase({ port: 54411, tableRows: { feature_flags: flags, user_credits: credits }, handle: rest });
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

// ---------------------------------------------------------------------
// The model: tags every paragraph with the language it was asked for.
// ---------------------------------------------------------------------
const modelAsked = [];
const model = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const sent = JSON.parse(body || "{}");
    modelAsked.push(sent);
    const message = String(sent.messages?.[0]?.content ?? "");
    const parsed = JSON.parse(message || "{}");
    const { language = "" } = parsed;
    res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
    const toolName = sent.tool_choice?.name ?? "translations";
    const content =
      toolName === "edited_paragraph"
        ? { type: "tool_use", id: "t", name: "edited_paragraph", input: { text: `EDITED(${parsed.instruction}): ${parsed.paragraph}` } }
        : { type: "tool_use", id: "t", name: "translations", input: { translations: (parsed.pieces ?? []).map((p) => `[${language}] ${p}`) } };
    res.end(
      JSON.stringify({
        id: "msg",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [content],
        stop_reason: "tool_use",
        usage: { input_tokens: 400, output_tokens: 200 },
      })
    );
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
const EL = msgs("el").dashboard.translateTool;
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

const p1Text = (page, index) => page.locator('[data-testid="translate-tool-translated"]').nth(index).innerText();

const PARA_1 = "Καλημέρα σε όλους.";
const PARA_2 = "Αυτή είναι η δεύτερη παράγραφος.";
const TEXT = `${PARA_1}\n\n${PARA_2}`;

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
  const APP = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label}: piece 1 — the screen opens, in the common shape ==`);
    setFlags({});
    const { context, page, press } = await open(APP, device);
    await page.goto(`${APP}/dashboard/tools`, { waitUntil: "load" });
    const tile = page.locator('[data-testid="tool-tile"][href="/dashboard/translate"]').first();
    await tile.waitFor({ timeout: 15_000 });
    await press(tile);
    await page.locator('[data-testid="tool-shell"]').first().waitFor({ timeout: 15_000 });
    check("the real shell opened, not Coming Soon", (await page.locator('[data-testid="tool-shell-empty"]').count()) === 1 && (await page.locator('[data-testid="coming-soon"]').count()) === 0);
    check("the empty landing's heading and three examples are drawn", (await page.locator('[data-testid="tool-shell-example"]').count()) === 3);
    check("the target-languages and style options are both there", (await page.locator('[data-testid="translate-tool-targets"]').count()) === 1 && (await page.locator('[data-testid="translate-tool-style"]').count()) === 1);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();

    console.log(`\n== ${device.label}: piece 2 — text in, a translation out per language, side by side ==`);
    reserved.length = 0;
    settled.length = 0;
    const { context: c2, page: p2, press: press2 } = await open(APP, device);
    await p2.goto(`${APP}/dashboard/translate`, { waitUntil: "load" });
    await p2.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 15_000 });

    // Two targets: English (already the default, in a Greek-locale
    // session — src/components/translate/translate-shell.tsx picks
    // "en" when the UI locale is not English) plus German, added here.
    await press2(p2.locator('[data-testid="translate-tool-targets"]'));
    await press2(p2.locator('[data-testid="translate-tool-target-option"]').filter({ hasText: "Deutsch" }).first());
    await press2(p2.locator('[data-testid="translate-tool-targets"]'));

    const textarea = p2.locator('textarea').first();
    await textarea.fill(TEXT);
    const sendButton = p2.locator('button[type="submit"]');
    const asked = modelAsked.length;
    await press2(sendButton);
    await p2.locator('[data-testid="translate-tool-results"]').waitFor({ timeout: 60_000 });

    const enLabel = describeLocale("en");
    const deLabel = describeLocale("de");
    check("both chosen languages' headings are drawn", (await p2.locator('[data-testid="translate-tool-target"]').count()) === 2);
    const originals = await p2.locator('[data-testid="translate-tool-original"]').allInnerTexts();
    const translated = await p2.locator('[data-testid="translate-tool-translated"]').allInnerTexts();
    check("every original paragraph is shown beside its translation, for both languages", originals.filter((t) => t === PARA_1).length === 2 && originals.filter((t) => t === PARA_2).length === 2);
    check(`the English column carries the English answer (asked for "${enLabel}")`, translated.some((t) => t === `[${enLabel}] ${PARA_1}`) && translated.some((t) => t === `[${enLabel}] ${PARA_2}`));
    check(`the German column carries the German answer (asked for "${deLabel}")`, translated.some((t) => t === `[${deLabel}] ${PARA_1}`) && translated.some((t) => t === `[${deLabel}] ${PARA_2}`));
    check("the model was asked twice — once per language — for one paragraph list each", modelAsked.length - asked === 2);
    check("one reservation covers every language together, and it settles once", reserved.length === 1 && settled.length === 1 && settled[0].p_feature === "text_translate");
    check("the source language was detected and said", (await p2.locator('[data-testid="translate-tool-detected"]').innerText()).includes(EL.detectedFrom.split("{")[0].trim()));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await c2.close();
  }

  console.log("\n== desktop: every target already in the text's own language refuses, before any price or hold ==");
  {
    setFlags({});
    reserved.length = 0;
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/translate`, { waitUntil: "load" });
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 15_000 });
    await press(page.locator('[data-testid="translate-tool-targets"]'));
    // "English" is the default target in a Greek-locale session — drop it
    // first, so Greek (the text's own, detected language) is the ONLY
    // target left, and this run has nothing live to translate at all.
    await press(page.locator('[data-testid="translate-tool-target-option"]').filter({ hasText: "English" }).first());
    await press(page.locator('[data-testid="translate-tool-target-option"]').filter({ hasText: "Ελληνικά" }).first());
    await press(page.locator('[data-testid="translate-tool-targets"]'));
    const textarea = page.locator("textarea").first();
    await textarea.fill(PARA_1);
    const asked = modelAsked.length;
    await press(page.locator('button[type="submit"]'));
    await page.locator('[data-testid="tool-shell-thread"]').locator(`text=${EL.errors.sameLanguage}`).waitFor({ timeout: 15_000 });
    check("asks the model nothing, holds nothing, and says so plainly", modelAsked.length === asked && reserved.length === 0);
    await context.close();
  }

  console.log("\n== desktop: a MIX of languages — one same, one different — translates only the different one ==");
  {
    setFlags({});
    reserved.length = 0;
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/translate`, { waitUntil: "load" });
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 15_000 });
    // Default target is already "en" (a live target); add Greek too — the
    // text's own detected language, a free no-op beside it.
    await press(page.locator('[data-testid="translate-tool-targets"]'));
    await press(page.locator('[data-testid="translate-tool-target-option"]').filter({ hasText: "Ελληνικά" }).first());
    await press(page.locator('[data-testid="translate-tool-targets"]'));
    const textarea = page.locator("textarea").first();
    await textarea.fill(PARA_1);
    const asked = modelAsked.length;
    await press(page.locator('button[type="submit"]'));
    await page.locator('[data-testid="translate-tool-results"]').waitFor({ timeout: 30_000 });
    check("the model is asked once, for the one language that differs", modelAsked.length - asked === 1);
    check("the same-language target says so, plainly, with no translated column", (await page.locator('[data-testid="translate-tool-target"]').filter({ hasText: "Ελληνικά" }).innerText()).includes(EL.sameLanguageNote));
    await context.close();
  }

  console.log("\n== desktop: piece 3 — one paragraph, changed by words, the rest untouched ==");
  {
    setFlags({});
    reserved.length = 0;
    settled.length = 0;
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/translate`, { waitUntil: "load" });
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 15_000 });
    const textarea = page.locator("textarea").first();
    await textarea.fill(TEXT);
    await press(page.locator('button[type="submit"]'));
    await page.locator('[data-testid="translate-tool-results"]').waitFor({ timeout: 30_000 });
    const enLabel = describeLocale("en");
    const before0 = await p1Text(page, 0);
    const before1 = await p1Text(page, 1);

    await press(page.locator('[data-testid="translate-tool-translated"]').nth(1));
    check("the chosen paragraph's box is said, with its language", (await page.locator('[data-testid="box-chosen"]').innerText()).includes(enLabel));
    const instructionField = page.locator("textarea").first();
    const asked = modelAsked.length;
    await instructionField.fill("πιο σύντομο");
    await press(page.locator('button[type="submit"]'));
    await page.locator('[data-testid="translate-tool-translated"]').nth(1).filter({ hasText: "EDITED" }).waitFor({ timeout: 30_000 });
    const after0 = await p1Text(page, 0);
    const after1 = await p1Text(page, 1);
    check("only the chosen paragraph changed — the other, same language, is byte-identical", after0 === before0 && after0 === `[${enLabel}] ${PARA_1}`);
    check("the chosen one carries the edit", after1 === `EDITED(πιο σύντομο): ${before1}`);
    check("exactly one more call was made — the edit alone, no re-translation", modelAsked.length - asked === 1);
    check("its own reservation, settled under its own feature", reserved.length === 2 && settled.some((s) => s.p_feature === "text_translate_edit"));
    await context.close();
  }

  console.log("\n== desktop: piece 4 — the glossary, saved at once, and kept in every translation ==");
  {
    setFlags({});
    reserved.length = 0;
    delete glossaryRows[MOCK_USER.id];
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/translate`, { waitUntil: "load" });
    await page.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 15_000 });
    await press(page.locator('[data-testid="translate-tool-glossary"]'));
    const field = page.locator('[data-testid="translate-tool-glossary-input"]');
    await field.fill("Camping Ήλιος");
    await press(page.locator('[data-testid="translate-tool-glossary-add"]'));
    await page.locator('[data-testid="translate-tool-glossary-list"]').filter({ hasText: "Camping Ήλιος" }).waitFor({ timeout: 10_000 });
    // The UI shows the new term at once, optimistically; the PUT that
    // actually saves it is fire-and-forget behind that paint, so give it
    // a moment to land before checking the mock's own row.
    for (let i = 0; i < 20 && !glossaryRows[MOCK_USER.id]?.terms?.includes("Camping Ήλιος"); i++) await new Promise((r) => setTimeout(r, 100));
    check("the term is saved at once — the mock's own row carries it, before any translation runs", glossaryRows[MOCK_USER.id]?.terms?.includes("Camping Ήλιος") === true);
    await press(page.locator('[data-testid="translate-tool-glossary"]'));

    const textarea = page.locator("textarea").first();
    await textarea.fill(`${PARA_1} Camping Ήλιος.`);
    const asked = modelAsked.length;
    await press(page.locator('button[type="submit"]'));
    await page.locator('[data-testid="translate-tool-results"]').waitFor({ timeout: 30_000 });
    check("the glossary term reached the model's system prompt, for the call this translation made", modelAsked.slice(asked).some((m) => String(m.system?.[0]?.text ?? "").includes("Camping Ήλιος")));

    const { context: c2, page: p2 } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await p2.goto(`${APP}/dashboard/translate`, { waitUntil: "load" });
    await p2.locator('[data-testid="tool-shell-empty"]').waitFor({ timeout: 15_000 });
    // The glossary GET is a client-side effect, after hydration — wait
    // for its answer to paint rather than reading the button the instant
    // the shell itself appears.
    const field2 = p2.locator('[data-testid="translate-tool-glossary"]').filter({ hasText: "1" });
    const sawSaved = await field2.waitFor({ timeout: 10_000 }).then(() => true, () => false);
    check("...and it is still there on a fresh page load — saved, not kept only in memory", sawSaved);
    await c2.close();
    await context.close();
  }

  console.log("\n== desktop: with the switch not open to this account, the tile still opens Coming Soon ==");
  {
    setFlags({ "translate-tool": "off" });
    const { context, page } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/translate`, { waitUntil: "load" });
    check("Coming Soon, not the real tool — the badge on the grid never promised otherwise", (await page.locator('[data-testid="tool-shell"]').count()) === 0 && (await page.locator('[data-testid="coming-soon"]').count()) === 1);
    const direct = await page.request.post(`${APP}/api/translate/text`, { data: { text: PARA_1, targets: ["en"], style: "source", mode: "price" } });
    check("...and the route itself refuses, independently of the page", direct.status() === 403 && (await direct.json()).code === "not_enabled");
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
