/*
 * CONNECTING A TELEGRAM CHAT, IN THE BUILT APP (the owner's "24. IONEXA
 * ΣΤΟ TELEGRAM", 2026-10-31, Κομμάτι 1), behind the switch "telegram-bot".
 *
 * Run: node scripts/tests/telegram-link.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/telegram-link.prodtest.mjs
 *      SHOT_DIR=/tmp/tg-shots node scripts/tests/telegram-link.prodtest.mjs
 *
 * WHAT IS REAL HERE AND WHAT IS STOOD IN FOR. The route, the migration's
 * rules as the stand-in enforces them, the screen and every press are the
 * built app. Two things are answered locally: Telegram's own getMe (so
 * telegramBotUsername() can resolve without the internet) and the
 * database. NOTHING about the flow is faked — the pairing row this test
 * reads back was written by the route, and the link row was written by the
 * route's confirm.
 *
 * THE ONE STEP THIS TEST PERFORMS ITSELF is the middle of the flow: a chat
 * presenting the code. That is κομμάτι 2's webhook and it does not exist
 * yet, so §6 writes the three columns the webhook will write — directly
 * into the store, never through a product backdoor — and then lets the
 * real route and the real screen carry on from there. Sections 1-5 need no
 * such help and run end to end.
 *
 * Both devices: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { statefulTables } from "./lib/stand-in-tables.mjs";
import { chromiumPath } from "./lib/chromium.mjs";

const EL = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.integrations.telegram;
const BOT = "IonexaTestBot";
const BOT_TOKEN = "1234567890:this-token-is-for-this-test-only";

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

// ── the database, stateful, so the route's own writes are what we read ──
const store = {
  feature_flags: [],
  user_credits: [],
  user_onboarding: [],
  telegram_links: [],
  telegram_pairings: [],
};
const tables = statefulTables(store, {
  defaults: {
    telegram_pairings: {
      chat_id_fingerprint: null,
      chat_id_encrypted: null,
      telegram_username: null,
      telegram_name: null,
      presented_at: null,
      confirmed_at: null,
    },
    telegram_links: { telegram_username: null, telegram_name: null, chat_kind: "private", last_used_at: null },
  },
});
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({ port: 54523, handle: (ctx) => tables(ctx) });

function reset({ flags = { "telegram-bot": "staff" } } = {}) {
  store.feature_flags.splice(0, Infinity, ...Object.entries(flags).map(([key, audience]) => ({ key, audience })));
  store.user_credits.splice(0, Infinity, { user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 });
  // Without this row /dashboard/* redirects to /onboarding and anything
  // asserted (or screenshotted) afterwards is the wrong screen.
  store.user_onboarding.splice(0, Infinity, { user_id: MOCK_USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null });
  store.telegram_links.splice(0, Infinity);
  store.telegram_pairings.splice(0, Infinity);
}

// ── Telegram's own API, answered on this machine ──
const outbound = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const reply = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (/^\/telegram\/bot[^/]+\/getMe$/.test(url.pathname)) {
    return reply(200, { ok: true, result: { id: 1, is_bot: true, username: BOT } });
  }
  // Loud, not silent: a origin this test forgot to map must fail visibly.
  reply(404, { error: "not stubbed", path: url.pathname });
});
await new Promise((r) => outbound.listen(0, "127.0.0.1", r));
const OUT = `http://127.0.0.1:${outbound.address().port}`;

const freePort = () =>
  new Promise((res) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => res(port));
    });
  });

const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  // The test account, so a switch at «staff» is open to it and the
  // account is charged like a customer's rather than exempted.
  ADMIN_EMAILS: "",
  TEST_ACCOUNT_EMAILS: MOCK_USER.email,
  // 64 hex characters: a well-formed key, for this test's rows only.
  INTEGRATION_ENCRYPTION_KEY: "0123456789abcdef".repeat(4),
};
const withBot = {
  ...base,
  TELEGRAM_BOT_TOKEN: BOT_TOKEN,
  OUTBOUND_STUB: JSON.stringify({ "https://api.telegram.org": `${OUT}/telegram` }),
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${resolve("scripts/tests/lib/outbound-stub.mjs")}`.trim(),
};
// NO TOKEN AT ALL, for §2. Deleted rather than emptied: the product reads
// it by name and an empty string is already "not set" to it, but a test
// that leaves the key present is testing a different thing than it says.
const withoutBot = { ...withBot };
delete withoutBot.TELEGRAM_BOT_TOKEN;

const SHOT_DIR = process.env.SHOT_DIR;
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });
const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { outbound.close(); } catch {}
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
      await new Promise((res, rej) => { const r = http.get(`${origin}/api/health`, () => res()); r.on("error", rej); });
      return origin;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error("the production server did not start");
}

async function open(origin, device) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: "el", url: origin },
    ].map(({ domain, path: p, ...c }) => c)
  );
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  // Disconnect asks with window.confirm; a dialog nobody answers hangs.
  page.on("dialog", (d) => void d.accept());
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

const CONNECT = "/dashboard/integrations";

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

  browser = await chromium.launch({ executablePath: chromiumPath() });
  const ON = await start(withBot);
  const NO_BOT = await start(withoutBot);

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n######## ${device.label} ${device.viewport.width}x${device.viewport.height} ########`);
    const where = (s) => `${device.label}: ${s}`;

    // ── 1. the switch ────────────────────────────────────────────────
    console.log("\n== 1. off means the section is not there at all ==");
    {
      reset({ flags: { "telegram-bot": "off" } });
      const { context, page } = await open(ON, device);
      await page.goto(`${ON}${CONNECT}`, { waitUntil: "networkidle" });
      check(where("the Connect page itself still draws"), await page.locator('[data-testid="mcp-apps"]').isVisible());
      check(where("...and there is no Telegram section"), (await page.locator('[data-testid="telegram-connect"]').count()) === 0);
      await context.close();
    }

    // ── 2. no bot token ──────────────────────────────────────────────
    console.log("\n== 2. with no bot token, no code is offered ==");
    {
      reset();
      const { context, page } = await open(NO_BOT, device);
      await page.goto(`${NO_BOT}${CONNECT}`, { waitUntil: "networkidle" });
      check(where("the section is there"), await page.locator('[data-testid="telegram-connect"]').isVisible());
      check(where("...and says it is not ready"), await page.locator('[data-testid="telegram-not-ready"]').isVisible());
      check(where("...in Greek, the words the owner will read"),
        (await page.locator('[data-testid="telegram-not-ready"]').innerText()).trim() === EL.notReady);
      // A code that cannot be used is a code the person will send somewhere.
      check(where("no Connect button is offered"), (await page.locator('[data-testid="telegram-connect-start"]').count()) === 0);
      check(where("...and no code is on screen"), (await page.locator('[data-testid="telegram-code"]').count()) === 0);
      await context.close();
    }

    // ── 3. the offer, and the consent step before any code exists ────
    console.log("\n== 3. Connect opens the consent step; it does not mint a code ==");
    const { context, page, press } = await open(ON, device);
    // FRAMED ON THE SECTION, NOT THE WHOLE PAGE. A fullPage shot of this
    // screen renders the sticky app bar at its scroll offset, on top of
    // the page title — an artefact of the screenshot, not of the product,
    // and one that would make the owner chase a layout bug that is not
    // there. Scrolled into view, viewport-sized, is what he actually sees.
    const shot = async (name) => {
      if (!SHOT_DIR) return;
      await page.locator('[data-testid="telegram-connect"]').evaluate((e) => e.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${SHOT_DIR}/${device.label}-${name}.png` });
    };
    {
      reset();
      await page.goto(`${ON}${CONNECT}`, { waitUntil: "networkidle" });
      check(where("the offer card is drawn"), await page.locator('[data-testid="telegram-offer"]').isVisible());
      check(where("the title is the Greek one"), (await page.locator("#telegram-title").innerText()).includes(EL.title));
      await shot("1-offer");

      await press(page.locator('[data-testid="telegram-connect-start"]'));
      await page.waitForSelector('[data-testid="telegram-consent"]');
      check(where("the consent step opens"), await page.locator('[data-testid="telegram-consent"]').isVisible());
      // THE PRESS THAT OPENS THE CONSENT STEP MUST NOT WRITE A ROW: a code
      // that exists is a code that can leak, and nothing has been agreed.
      check(where("...and no pairing was written by it"), store.telegram_pairings.length === 0,
        JSON.stringify(store.telegram_pairings));
      const can = await page.locator('[data-testid="telegram-consent-details-can-list"] li').allInnerTexts();
      const cannot = await page.locator('[data-testid="telegram-consent-details-cannot-list"] li').allInnerTexts();
      check(where("«Ionexa can» has its four lines before you agree"), can.length === 4, can.join(" | "));
      check(where("«Ionexa can't» has its four"), cannot.length === 4, cannot.join(" | "));
      check(where("...and one of them is that nothing runs before approval"),
        cannot.some((l) => l.trim() === EL.cannot.approve.trim()), cannot.join(" | "));
      check(where("...and one is that it never sends a key or a code"),
        cannot.some((l) => l.trim() === EL.cannot.secrets.trim()));
      check(where("...and one is private chats only, never a group"),
        cannot.some((l) => l.trim() === EL.cannot.groups.trim()));
      check(where("the activity pane says there is nothing yet, rather than inventing a line"),
        (await page.locator('[data-testid="telegram-consent-details-activity-empty"]').innerText()).trim() === EL.activityNotYet);
      // FOUND BY LOOKING AT THE FIRST SCREENSHOT OF THIS PANEL. The shared
      // block's Disconnect was rendering here — red, with an unplug icon,
      // over the words «Όχι τώρα» — when nothing is connected to
      // disconnect. The way out of a consent step is a plain refusal.
      check(where("nothing offers to disconnect a connection that does not exist yet"),
        (await page.locator('[data-testid="telegram-consent-details-disconnect"]').count()) === 0);
      check(where("...and the way out sits beside the agreement, as a plain refusal"),
        await page.locator('[data-testid="telegram-consent-cancel"]').isVisible());
      await shot("2-consent");
    }

    // ── 4. the code ──────────────────────────────────────────────────
    console.log("\n== 4. agreeing shows one code, ten minutes, and the link that sends it ==");
    {
      await press(page.locator('[data-testid="telegram-consent-approve"]'));
      await page.waitForSelector('[data-testid="telegram-waiting"]');
      check(where("a pairing row was written, exactly one"), store.telegram_pairings.length === 1,
        JSON.stringify(store.telegram_pairings));
      const row = store.telegram_pairings[0];
      check(where("...bound to this account from the moment it existed"), row?.user_id === MOCK_USER.id);
      check(where("...with nothing presented and nothing confirmed yet"),
        row?.presented_at === null && row?.confirmed_at === null);
      check(where("...and its code is eight characters of the alphabet"), /^[0-9A-HJKMNP-TV-Z]{8}$/.test(row?.code ?? ""), row?.code);

      const shown = (await page.locator('[data-testid="telegram-code"]').innerText()).trim();
      check(where("the code on screen is the row's own, with the dash for reading aloud"),
        shown === `${row.code.slice(0, 4)}-${row.code.slice(4)}`, `${shown} vs ${row.code}`);
      const href = await page.locator('[data-testid="telegram-open"]').getAttribute("href");
      check(where("«Άνοιξε στο Telegram» points at this bot with this code"),
        href === `https://t.me/${BOT}?start=${row.code}`, href);
      check(where("the countdown is counting the ten minutes"),
        /\d/.test(await page.locator('[data-testid="telegram-countdown"]').innerText()));
      // THE HALF THAT IS NOT BUILT, ON SCREEN. κομμάτι 2 is the webhook.
      check(where("the screen says the bot cannot answer a code yet"),
        (await page.locator('[data-testid="telegram-no-webhook-yet"]').innerText()).trim() === EL.noWebhookYet);
      check(where("...and that this is not the notification channel"),
        (await page.locator('[data-testid="telegram-two-grants"]').innerText()).trim() === EL.notTheSameAsNotifications);
      await shot("3-code");
    }

    // ── 5. cancel ────────────────────────────────────────────────────
    console.log("\n== 5. Cancel kills the code ==");
    {
      await press(page.locator('[data-testid="telegram-cancel"]'));
      await page.waitForSelector('[data-testid="telegram-offer"]');
      check(where("the row is gone, not merely hidden"), store.telegram_pairings.length === 0,
        JSON.stringify(store.telegram_pairings));
      check(where("...and the screen is back to the offer"), await page.locator('[data-testid="telegram-offer"]').isVisible());
    }

    // ── 6. a chat presents the code (κομμάτι 2's half, done by hand) ──
    console.log("\n== 6. a chat presents the code: still nothing is connected ==");
    {
      await press(page.locator('[data-testid="telegram-connect-start"]'));
      await page.waitForSelector('[data-testid="telegram-consent"]');
      await press(page.locator('[data-testid="telegram-consent-approve"]'));
      await page.waitForSelector('[data-testid="telegram-waiting"]');
      const row = store.telegram_pairings[0];

      // EXACTLY WHAT κομμάτι 2's WEBHOOK WILL WRITE, and nothing else.
      // Written into the store directly: there is no product route that
      // does this yet, and adding one for a test would be a backdoor.
      row.chat_id_fingerprint = "f".repeat(64);
      row.chat_id_encrypted = "v1.iv.tag.ciphertext-stood-in-for";
      row.telegram_username = "elias_test";
      row.telegram_name = "Ηλίας";
      row.presented_at = new Date().toISOString();

      await page.waitForSelector('[data-testid="telegram-presented"]', { timeout: 15000 });
      const asked = await page.locator('[data-testid="telegram-presented"]').innerText();
      check(where("the screen names who is asking"), asked.includes("@elias_test"), asked);
      check(where("...and warns what a stranger with the code could do"),
        asked.includes(EL.presentedWarning.slice(0, 30)), asked);
      // THE WHOLE POINT OF THE SECOND STEP.
      check(where("nothing is linked yet"), store.telegram_links.length === 0);
      await shot("4-presented");
    }

    // ── 7. the confirm is what creates the grant ─────────────────────
    console.log("\n== 7. the signed-in press is what connects it ==");
    {
      await press(page.locator('[data-testid="telegram-confirm"]'));
      await page.waitForSelector('[data-testid="telegram-connected"]', { timeout: 15000 });
      check(where("one link row now exists"), store.telegram_links.length === 1, JSON.stringify(store.telegram_links));
      const link = store.telegram_links[0];
      check(where("...for this account"), link?.user_id === MOCK_USER.id);
      check(where("...carrying the chat in both unreadable shapes"),
        link?.chat_id_fingerprint === "f".repeat(64) && typeof link?.chat_id_encrypted === "string");
      check(where("...and marked a private chat"), link?.chat_kind === "private");
      check(where("the code is spent, so it cannot be used again"),
        typeof store.telegram_pairings[0]?.confirmed_at === "string");

      const connected = await page.locator('[data-testid="telegram-connected"]').innerText();
      check(where("the screen says which chat it is connected to"), connected.includes("@elias_test"), connected);
      const can = await page.locator('[data-testid="telegram-details-can-list"] li').allInnerTexts();
      const cannot = await page.locator('[data-testid="telegram-details-cannot-list"] li').allInnerTexts();
      check(where("«Ionexa can» is there once connected too"), can.length === 4);
      check(where("«Ionexa can't» as well"), cannot.length === 4);
      check(where("Recent activity is empty and says why"),
        (await page.locator('[data-testid="telegram-details-activity-empty"]').innerText()).trim() === EL.activityEmpty);
      check(where("Disconnect is on screen"), await page.locator('[data-testid="telegram-details-disconnect"]').isVisible());
      await shot("5-connected");
    }

    // ── 8. a spent code is refused ───────────────────────────────────
    console.log("\n== 8. the code is single use, and a second account is refused ==");
    {
      const again = await page.evaluate(async () => {
        const res = await fetch("/api/telegram/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm" }),
        });
        return { status: res.status, body: await res.json() };
      });
      check(where("confirming a spent code is refused"), again.body?.ok === false, JSON.stringify(again));
      check(where("...as 'nothing to confirm', not as a second success"),
        again.body?.code === "nothing_to_confirm" && again.status === 404, JSON.stringify(again));
      check(where("...and no second link row appeared"), store.telegram_links.length === 1);

      const start = await page.evaluate(async () => {
        const res = await fetch("/api/telegram/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });
        return { status: res.status, body: await res.json() };
      });
      check(where("starting again over a live link is refused rather than overwriting it"),
        start.body?.code === "already_linked" && start.status === 409, JSON.stringify(start));
    }

    // ── 9. disconnect ────────────────────────────────────────────────
    console.log("\n== 9. Disconnect ends it, and leaves notifications alone ==");
    {
      await press(page.locator('[data-testid="telegram-details-disconnect"]'));
      await page.waitForSelector('[data-testid="telegram-offer"]', { timeout: 15000 });
      check(where("the link row is deleted, so the chat's fingerprint matches nothing"),
        store.telegram_links.length === 0, JSON.stringify(store.telegram_links));
      check(where("...and any half-finished code went with it"), store.telegram_pairings.filter((p) => !p.confirmed_at).length === 0);
      check(where("the screen is back to the offer"), await page.locator('[data-testid="telegram-offer"]').isVisible());
      await shot("6-after-disconnect");
    }

    check(where("no page error anywhere in the run"), pageErrors.length === 0, pageErrors.join(" | "));
    await context.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err));
} finally {
  try { await browser?.close(); } catch {}
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
