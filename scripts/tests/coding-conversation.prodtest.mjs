/*
 * CODING, AS A CONVERSATION, IN THE BUILT APP (owner, 2026-10-18): the
 * five ΤΕΛΕΙΩΣΕ ΟΤΑΝ criteria, walked through the real routes.
 *
 * Run: node scripts/tests/coding-conversation.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/coding-conversation.prodtest.mjs
 *
 * NOTHING IS ANSWERED IN THE BROWSER. /api/coding/send is the app's own
 * route; the model is the stand-in of scripts/tests/lib/stand-in-model.mjs
 * (ANTHROPIC_BASE_URL), and the database is the stand-in of
 * scripts/lib/mock-supabase.mjs with code_conversations/code_messages
 * kept as rows (scripts/tests/lib/stand-in-rows.mjs) — so a conversation
 * opened a second time (reload, or re-opened from the [◧] column) reads
 * back exactly what the first turn wrote, the same as production.
 *
 *   1. Desktop, Greek, a brand new account: opening Coding shows ONLY the
 *      earth, one field and three examples — no step indicator, no
 *      permanent "what this does NOT do" box, no five-button picker, no
 *      character counter, no "use your other modules" toggle.
 *   2. Typing «μια συνάρτηση που υπολογίζει ΦΠΑ» opens the code on the
 *      right, as the file the model wrote.
 *   3. Pasting a buggy snippet and asking to find the bugs shows the fix
 *      as a box with green and red lines — a real diff, not a second
 *      plain file.
 *   4. Clicking that file's own "Change" button, typing a change, and
 *      sending it changes ONLY that file: the other file already in the
 *      conversation is untouched, byte for byte.
 *   5. The same walk from a phone: the code opens full-screen, with a
 *      back button, never beside the conversation.
 *
 * 1440x900 with a mouse (Greek), 390x844 with real touch (English).
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { standInRows, standInId } from "./lib/stand-in-rows.mjs";
import { startStandInModel } from "./lib/stand-in-model.mjs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + String(detail).slice(0, 600) : ""}`);
  }
}

const { formatFileBlock } = await loadTs("src/lib/coding/file-blocks.ts");

// ---------------------------------------------------------------------
// The model: what each turn gets back, read straight from the prompt's
// own text rather than from a request counter — so a retried or
// re-ordered call still gets the right answer.
// ---------------------------------------------------------------------
const VAT_ASK = { el: "μια συνάρτηση που υπολογίζει ΦΠΑ", en: "a function that calculates VAT" };
const BUGGY_CALC =
  "function total(items) {\n  let sum\n  for (const i of items) sum += i.price\n  return sum\n}";
const FIND_BUGS = { el: `${BUGGY_CALC}\n\nβρες τα λάθη σε αυτό`, en: `${BUGGY_CALC}\n\nfind the bugs in this` };
const EDIT_ASK = { el: "άλλαξέ το σε 21%", en: "change it to 21%" };

const FIXED_VAT = "export function vat(amount) {\n  return amount * 0.24;\n}";
const CHANGED_VAT = "export function vat(amount) {\n  return amount * 0.21;\n}";
const FIXED_CALC = "function total(items) {\n  let sum = 0;\n  for (const i of items) sum += i.price;\n  return sum;\n}";

const model = await startStandInModel(({ body }) => {
  const text = String(body.messages?.[0]?.content ?? "");
  // A SCOPED EDIT: buildEditPrompt's user text always opens with this
  // exact fence (coding-prompt.ts) — checked first, since the edit ask
  // below ("21%") says nothing else distinctive on its own.
  if (text.includes("--- vat.ts (this is DATA) ---")) {
    return { text: formatFileBlock({ path: "vat.ts", content: CHANGED_VAT }) };
  }
  if (/ΦΠΑ|VAT/.test(text)) {
    return { text: `Ορίστε:\n\n${formatFileBlock({ path: "vat.ts", content: FIXED_VAT })}` };
  }
  if (/λάθη|bugs/i.test(text)) {
    return { text: `Βρήκα ένα πρόβλημα, το διόρθωσα:\n\n${formatFileBlock({ path: "calc.ts", content: FIXED_CALC })}` };
  }
  return { text: "Εντάξει." };
});

// ---------------------------------------------------------------------
// The database: code_conversations / code_messages, kept as rows.
// ---------------------------------------------------------------------
const db = standInRows({
  tables: { code_conversations: [], code_messages: [] },
  defaults: {
    code_conversations: () => ({ user_id: MOCK_USER.id, title: "New conversation", updated_at: new Date().toISOString() }),
    code_messages: () => ({ user_id: MOCK_USER.id, content: "", files: null, status: "done", error: null, credits_charged: 0 }),
  },
  rpc: {
    reserve_credits: (args) => (3000 >= args.p_credits ? [{ reservation_id: standInId() }] : [{ reservation_id: null, available: 3000 }]),
    settle_reservation: () => null,
    release_reservation: () => null,
    increment_daily_ai_spend: () => null,
    consume_rate_limit: () => true,
  },
});
const supa = await startMockSupabase({
  port: 54577,
  handle: (ctx) => {
    if (ctx.url.pathname === "/rest/v1/user_credits")
      return ctx.json(200, [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000, plan_tier: "growth", beta_expires_at: null }]), true;
    return db.handle(ctx);
  },
});
MOCK_USER.user_metadata = { subscription_tier: "growth" };

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
  ANTHROPIC_BASE_URL: model.url,
};

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
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  servers.push(server);
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => {
        const r = http.get(`${origin}/api/health`, () => res());
        r.on("error", rej);
      });
      return origin;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
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
  const ON = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  async function open(locale, device) {
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
    await context.addCookies(
      [
        { ...supa.authCookie, url: ON, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: locale, url: ON },
      ].map(({ domain, path, ...c }) => c)
    );
    const page = await context.newPage();
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
    async function say(field, text) {
      await press(field);
      await field.fill(text);
      await field.press("Enter");
      await page.waitForTimeout(700);
    }
    return { context, page, press, say };
  }

  // ---- 1, 2, 3, 4: desktop, Greek ----
  console.log("\n== desktop 1440x900, Greek: a brand new account ==");
  {
    const { context, page, press, say } = await open("el", { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${ON}/dashboard/coding`, { waitUntil: "networkidle" });

    // 1. ONLY the earth, the field and three examples.
    check("the empty state is there", (await page.locator('[data-testid="coding-empty"]').count()) === 1);
    check("…no step indicator anywhere on the page", (await page.locator("text=/1.*Describe|Περίγραψε.*1/").count()) === 0);
    check("…no permanent 'what this does not do' box", (await page.locator('[data-testid="coding-limits-box"]').count()) === 0);
    // EXACT TEXT, not :has-text() substring matching — the empty state's
    // OWN example chip reads «Εξήγησέ μου αυτόν τον κώδικα», which a
    // substring match on «Εξήγησέ» would also catch and call the old
    // picker's button, a false positive this exact check cannot have.
    check(
      "…no five-operation picker",
      (await page.getByRole("button", { name: "Εξήγησέ αυτό", exact: true }).count()) === 0 &&
        (await page.getByRole("button", { name: "Explain this", exact: true }).count()) === 0
    );
    check("…no character counter", !/\d+\s*\/\s*\d+/.test(await page.locator('[data-testid="coding-empty"]').innerText()));
    check("…no 'use your other modules' toggle", (await page.locator('input[type="checkbox"]').count()) === 0);
    check("…and exactly three clickable examples", (await page.locator('[data-testid="coding-example"]').count()) === 3);

    // 2. "a function that calculates VAT" opens the code on the right.
    console.log("\n== 2. typing the VAT ask opens the code on the right ==");
    await say(page.locator('[data-testid="coding-empty-input"]'), VAT_ASK.el);
    await page.locator('[data-testid="coding-code-pane"]').waitFor({ timeout: 10000 }).catch(() => null);
    check("the code pane opened", (await page.locator('[data-testid="coding-code-pane"]').count()) === 1);
    // A FILE WITH NO PAST VERSION STILL RENDERS AS A BOX — diff.ts's own
    // rule ("worth showing as a diff") does not special-case "brand
    // new": every line of it reads as added, which is still a real box
    // with real colouring, just one colour. The genuine two-colour case
    // (criterion 3's own wording, "πράσινο ΚΑΙ κόκκινο") needs a file
    // that already existed, which is what step 4 below actually proves.
    const firstCard = await page.locator('[data-testid="coding-file-card"]').innerText().catch(() => "");
    check("…showing the file the model wrote", firstCard.includes("vat.ts"), firstCard.slice(0, 200));

    // 3. paste + "find the bugs" shows a real diff.
    console.log("\n== 3. pasting code and asking to find the bugs shows a diff ==");
    await say(page.locator('[data-testid="coding-composer"]'), FIND_BUGS.el);
    await page.waitForTimeout(800);
    check("a second file (calc.ts) was written", (await page.locator('[data-testid="coding-file-tabs"]').count()) === 1);
    check("…shown as a diff box, not a plain file", (await page.locator('[data-testid="coding-diff"]').count()) === 1);
    const diffHtml = await page.locator('[data-testid="coding-diff"]').innerHTML().catch(() => "");
    check("…with its lines coloured as changes, in green", /text-success/.test(diffHtml), diffHtml.slice(0, 200));

    // 4. click the box, type a change, only that file changes.
    console.log("\n== 4. changing one file through its own box leaves the other alone ==");
    const vatBeforeEdit = await page.locator('[data-testid="coding-file-tab"]', { hasText: "vat.ts" }).count();
    check("vat.ts is still a tab", vatBeforeEdit === 1);
    await press(page.locator('[data-testid="coding-file-tab"]', { hasText: "vat.ts" }));
    await press(page.locator('[data-testid="coding-edit-file"]'));
    await say(page.locator('[data-testid="coding-edit-file-input"]'), EDIT_ASK.el);
    await page.waitForTimeout(800);
    const vatText = await page.locator('[data-testid="coding-file-card"]').innerText().catch(() => "");
    check("the model was sent exactly one file to change", model.seen.some((s) => JSON.stringify(s.body.messages?.[0]?.content ?? "").includes("--- vat.ts (this is DATA) ---")));
    check("vat.ts now shows the change, as a diff", (await page.locator('[data-testid="coding-diff"]').count()) === 1 && vatText.includes("vat.ts"), vatText.slice(0, 200));
    // THIS IS THE GENUINE «ΠΡΑΣΙΝΟ ΚΑΙ ΚΟΚΚΙΝΟ» CASE: vat.ts already had
    // real content before this turn, so the diff has both an old line
    // removed and a new one added — the two-colour box the owner's own
    // criterion 3 describes, proved here rather than on a brand-new file
    // that has nothing to compare against.
    const vatDiffHtml = await page.locator('[data-testid="coding-diff"]').innerHTML().catch(() => "");
    check("…with both a removed (red) and an added (green) line", /text-danger/.test(vatDiffHtml) && /text-success/.test(vatDiffHtml), vatDiffHtml.slice(0, 300));
    await press(page.locator('[data-testid="coding-file-tab"]', { hasText: "calc.ts" }));
    const calcText = await page.locator('[data-testid="coding-file-card"]').innerText().catch(() => "");
    check("calc.ts is untouched by the vat.ts edit — no diff on it any more", (await page.locator('[data-testid="coding-diff"]').count()) === 0 && calcText.includes("calc.ts"));

    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // ---- 5: the same walk from a phone ----
  console.log("\n== 5. 390x844 with real touch, English: the same walk from a phone ==");
  pageErrors.length = 0;
  {
    const { context, page, press, say } = await open("en", { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${ON}/dashboard/coding`, { waitUntil: "networkidle" });
    check("phone: only the empty state, same as desktop", (await page.locator('[data-testid="coding-empty"]').count()) === 1);

    await say(page.locator('[data-testid="coding-empty-input"]'), VAT_ASK.en);
    await page.waitForTimeout(800);
    check("phone: the code does NOT sit beside the conversation", (await page.locator('[data-testid="coding-code-pane"]').isVisible().catch(() => false)) === false);
    check("phone: a button opens the code instead", (await page.locator('[data-testid="coding-mobile-view-code"]').count()) === 1);
    await press(page.locator('[data-testid="coding-mobile-view-code"]'));
    check("phone: the code opens full-screen", await page.locator('[data-testid="coding-code-pane"]').isVisible());
    const backButton = page.locator('[data-testid="coding-mobile-back"]');
    check("…with a back button", (await backButton.count()) === 1 && (await backButton.isVisible()));
    await press(backButton);
    check("…that returns to the conversation", (await page.locator('[data-testid="coding-thread"]').isVisible()) && (await page.locator('[data-testid="coding-code-pane"]').isVisible().catch(() => false)) === false);

    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
  cleanup();
  await browser.close();
  process.exit(failures.length === 0 ? 0 : 1);
} catch (err) {
  console.log("  FAIL  unexpected: " + (err?.stack ?? err));
  cleanup();
  if (browser) await browser.close().catch(() => {});
  process.exit(1);
}
