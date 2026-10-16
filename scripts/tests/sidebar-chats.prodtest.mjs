/*
 * THE CHATS PAGE AS A PERSON MEETS IT — on a computer with a mouse and
 * on a phone with a real finger, in Greek and in English, on a
 * production build.
 *
 * IT WAS «THE SIDEBAR'S CONVERSATIONS AND THE CHATS PAGE» until
 * 2026-10-16, when the owner had the conversations taken out of the
 * sidebar. What they could do there they do here; that they are
 * nowhere in the sidebar is the other half, and it is
 * scripts/tests/sidebar-no-chats.prodtest.mjs.
 *
 * Run: node scripts/tests/sidebar-chats.prodtest.mjs
 *      SKIP_BUILD=1 CHATS_SHOTS=/tmp/shots node scripts/tests/sidebar-chats.prodtest.mjs
 *
 * The owner's «ΤΕΛΕΙΩΣΕ ΟΤΑΝ», 2026-10-15, point by point:
 *
 *   1. The sidebar says «New» and «Chats», not «Chat».
 *   2. Pressing «Chats» shows every conversation, with a search that
 *      finds one by its title AND one by something said inside it.
 *   3. On the Chats page, «⋯» renames a conversation, pins it (and it
 *      moves to the group above), and deletes it with an Undo that
 *      brings it back.
 *   4. The same from the phone — including the long press, which is a
 *      touch screen's only right-click and which no other prodtest in
 *      this repo performs.
 *
 * AND THE ONE THE OWNER ASKED FOR SEPARATELY: user A cannot rename or
 * delete user B's conversation. That is proved HERE rather than in a
 * unit test because it is a claim about the ROUTE, and this is the only
 * harness in the repo that runs the real routes against a store that
 * actually applies PostgREST filters (scripts/tests/lib/stand-in-rows).
 * The database half — RLS, for every user-owned table — is already
 * executed by scripts/tests/user-isolation.dbtest.mjs.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { standInRows, standInId } from "./lib/stand-in-rows.mjs";
import { chromiumPath } from "./lib/chromium.mjs";

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

const OWNER = "boss@example.com";
const OTHER_ID = "00000000-0000-4000-8000-00000000b000";
// NO SWITCH TO SEED. The Chats page was behind `chats-page` for a day;
// the switch was removed on 2026-10-16 when the page opened to
// everybody, and a seed for a flag nothing declares would read as a
// precondition this file still has.
const state = { flags: [], credits: 3000 };

// Three of this account's conversations and ONE that is not, so every
// list assertion has something it must leave out.
const MINE = [
  { id: "00000000-0000-4000-8000-0000000000c1", title: "Αύρα Camping", is_pinned: false },
  { id: "00000000-0000-4000-8000-0000000000c2", title: "Τιμοκατάλογος", is_pinned: false },
  { id: "00000000-0000-4000-8000-0000000000c3", title: "Παλιά κουβέντα", is_pinned: true },
];
const THEIRS = { id: "00000000-0000-4000-8000-0000000000d1", title: "Somebody else's", is_pinned: false };

const db = standInRows({
  tables: { chat_conversations: [], chat_messages: [], projects: [], entity_links: [], user_favorites: [] },
  rpc: { consume_rate_limit: () => true, reserve_credits: () => [{ reservation_id: standInId() }], settle_reservation: () => null },
});
const supa = await startMockSupabase({
  port: 54575,
  handle: (ctx) => {
    const p = ctx.url.pathname;
    if (p === "/rest/v1/user_credits")
      return (
        ctx.json(200, [
          { user_id: MOCK_USER.id, credits_remaining: state.credits, credits_total: 3000, plan_tier: "growth", beta_expires_at: null },
        ]),
        true
      );
    if (p === "/rest/v1/feature_flags") return ctx.json(200, state.flags), true;
    return db.handle(ctx);
  },
});

const at = (n) => `2026-10-${String(10 + n).padStart(2, "0")}T09:00:00Z`;
function reset() {
  for (const t of Object.keys(db.store)) db.store[t].length = 0;
  MINE.forEach((c, i) =>
    db.store.chat_conversations.push({ ...c, user_id: MOCK_USER.id, created_at: at(i), updated_at: at(MINE.length - i) })
  );
  db.store.chat_conversations.push({ ...THEIRS, user_id: OTHER_ID, created_at: at(0), updated_at: at(9) });
  // One message with a word that is in NO title, so a hit on it can
  // only have come from searching what was said.
  db.store.chat_messages.push({
    id: standInId(), conversation_id: MINE[1].id, user_id: MOCK_USER.id, role: "user",
    content: "Θέλω τιμή για σκηνές δίπλα στη θάλασσα, με ομπρέλα.", created_at: at(2),
  });
  db.store.projects.push({ id: "00000000-0000-4000-8000-0000000000e1", user_id: MOCK_USER.id, name: "Καλοκαίρι", goal: "", status: "active", created_at: at(1), updated_at: at(1) });
}

const PORT = await new Promise((resolve) => {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const ORIGIN = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  NEXT_PUBLIC_SITE_URL: ORIGIN,
  // Decided here, not by whatever this machine has set.
  ADMIN_EMAILS: OWNER,
  TEST_ACCOUNT_EMAILS: "",
  ANTHROPIC_API_KEY: "placeholder-never-called",
};

const LOCALES = ["el", "en"];
const M = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const SHOT_DIR = process.env.CHATS_SHOTS || "";
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

let server = null;
let browser = null;
const pageErrors = [];
const cleanup = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
};

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production) ...");
    const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + log.slice(-3000));
      cleanup();
      process.exit(1);
    }
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${ORIGIN}/api/health`, () => res()); r.on("error", rej); });
      up = true;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  if (!up) { console.log("  FAIL  the production server did not start"); cleanup(); process.exit(1); }

  browser = await chromium.launch({ executablePath: chromiumPath() });
  const DEVICES = [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ];

  for (const device of DEVICES) {
    for (const locale of LOCALES) {
      const L = M[locale];
      const tag = `${device.label}/${locale}`;
      console.log(`\n== ${tag} ${device.viewport.width}x${device.viewport.height} ==`);
      MOCK_USER.email = OWNER;
      MOCK_USER.user_metadata = { subscription_tier: "growth" };
      reset();

      const context = await browser.newContext({
        viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, deviceScaleFactor: device.touch ? 3 : 1,
      });
      await context.addCookies([
        { ...supa.authCookie, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      const page = await context.newPage();
      page.on("pageerror", (err) => pageErrors.push(`${tag} ${page.url()}: ${String(err?.message ?? err)}`));
      const cdp = device.touch ? await context.newCDPSession(page) : null;
      const centre = async (locator) => {
        await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
        const box = await locator.boundingBox();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      };
      async function press(locator) {
        if (!cdp) return locator.click();
        const { x, y } = await centre(locator);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
      // A LONG PRESS, which nothing else in this repo does. Held past
      // the 500ms the rows wait for, with the finger kept still —
      // moving it cancels, which is the behaviour a scroll needs.
      async function longPress(locator) {
        const { x, y } = await centre(locator);
        if (!cdp) {
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.waitForTimeout(700);
          await page.mouse.up();
          return;
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        await page.waitForTimeout(700);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
      const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${locale}-${name}.png`, fullPage: true });

      const railNames = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-testid="sidebar"] nav a')].map((a) => (a.textContent ?? "").trim()).filter(Boolean)
        );

      // ---- 1. «New» and «Chats», not «Chat» -----------------------
      await page.goto(`${ORIGIN}/dashboard/overview`, { waitUntil: "networkidle" });
      if (device.touch) await page.locator('[data-testid="sidebar"]').evaluate((n) => n.classList.remove("-translate-x-full"));
      const names = await railNames();
      check(`[${tag}] the rail says «${L.sidebar.rail.chats}»`, names.includes(L.sidebar.rail.chats), names.join(" | "));
      check(`[${tag}] ...and no longer «${L.sidebar.rail.chat}»`, !names.includes(L.sidebar.rail.chat), names.join(" | "));
      check(`[${tag}] «${L.sidebar.rail.new}» is still there`, names.includes(L.sidebar.rail.new), names.join(" | "));
      await shot("1-rail");

      // ---- 2. the Chats page, and its two searches -----------------
      await page.goto(`${ORIGIN}/dashboard/chats`, { waitUntil: "networkidle" });
      // SCOPED TO <main>, WHICH COST A ROUND TO LEARN. The sidebar drew
      // the same rows from the same component until 2026-10-16, so
      // reading the document found every conversation twice and the
      // filter "failed" because that copy did not filter. The sidebar
      // has no rows now and this would pass unscoped — it stays scoped
      // because a page's list assertion should read the page.
      const titlesOn = () =>
        page.evaluate(() =>
          [...(document.querySelector("main") ?? document.body).querySelectorAll('[data-testid="conversation-row"]')].map((r) =>
            (r.innerText ?? "").split("\n")[0].trim()
          )
        );
      const listed = await titlesOn();
      check(`[${tag}] every conversation of this account is listed`, MINE.every((c) => listed.some((t) => t.includes(c.title))), listed.join(" | "));
      check(`[${tag}] ...and the other account's is not`, !listed.some((t) => t.includes(THEIRS.title)), listed.join(" | "));

      const search = page.locator('[data-testid="chats-search"]');

      // THE TITLE FILTER, PROVED ALONE. The messages are emptied first
      // because scripts/tests/lib/stand-in-rows.mjs implements PostgREST
      // filters but NOT `ilike` — so api/conversations/search gets back
      // every message whatever it asked for, and any conversation with
      // a message in it would join the results and make this check
      // about something other than titles. With none, the content half
      // can contribute nothing and what is left is the browser's own
      // folding.
      db.store.chat_messages.length = 0;
      await search.fill("αυρα");
      await page.waitForTimeout(900);
      const byTitle = await titlesOn();
      check(`[${tag}] a title is found without its accents`, byTitle.length === 1 && byTitle[0].includes("Αύρα"), byTitle.join(" | "));

      // AND THE CONTENT HALF IS WIRED. Put the message back and search
      // a word that is in NO title: the only way «Τιμοκατάλογος» can
      // appear is through api/conversations/search having been called
      // and its ids having reached the list.
      //
      // WHAT THIS DOES NOT PROVE, and the reason is above: that the
      // ILIKE narrows. This stand-in ignores it, so the route would
      // answer the same for any query. The narrowing is the database's
      // and is not exercised anywhere in this file — said out loud
      // rather than implied by a green line.
      db.store.chat_messages.push({
        id: standInId(), conversation_id: MINE[1].id, user_id: MOCK_USER.id, role: "user",
        content: "Θέλω τιμή για σκηνές δίπλα στη θάλασσα, με ομπρέλα.", created_at: at(2),
      });
      await search.fill("ομπρέλα");
      await page.waitForTimeout(900);
      const byContent = await titlesOn();
      check(
        `[${tag}] a word said INSIDE a conversation reaches the list, though no title has it`,
        byContent.some((t) => t.includes("Τιμοκατάλογος")),
        byContent.join(" | ")
      );
      check(`[${tag}] and the page says what it searched`, await page.locator('[data-testid="chats-search-scope"]').isVisible());
      await search.fill("");
      await page.waitForTimeout(400);
      await shot("2-chats");

      // ---- 3. rename, pin, delete with Undo ------------------------
      const rowFor = (title) => page.locator('main [data-testid="conversation-row"]').filter({ hasText: title }).first();
      const menuOf = async (title) => {
        await press(rowFor(title).locator('[data-testid="conversation-actions"]'));
        return page.locator('[data-testid="conversation-menu"]').first();
      };

      let menu = await menuOf("Αύρα Camping");
      check(`[${tag}] «⋯» opens the menu`, await menu.isVisible());
      // PINNED BY POSITION BEFORE THE RENAME STARTS. The moment it
      // does, InlineTitle swaps the title's <span> for an <input> whose
      // VALUE is the name — and Playwright's filter({hasText}) reads
      // rendered text, not input values, so a locator written in terms
      // of the old title stops matching the row it is about. That read
      // exactly like the rename being broken; it was this.
      const rowIndex = await page
        .locator('main [data-testid="conversation-row"]')
        .evaluateAll((rows) => rows.findIndex((r) => (r.innerText ?? "").includes("Αύρα Camping")));
      const pinnedRow = page.locator('main [data-testid="conversation-row"]').nth(rowIndex);
      await press(menu.getByRole("button", { name: L.dashboard.chat.rename }));
      // NOT `input` — the FIRST input in a page row is the tick box for
      // deleting several at once, and Playwright's own error ("Input of
      // type checkbox cannot be filled") is what said so.
      const field = pinnedRow.locator('input:not([type="checkbox"])').first();
      await field.fill("Αύρα Νάξου");
      await field.press("Enter");
      await page.waitForTimeout(500);
      check(
        `[${tag}] the new name was saved on the server`,
        db.store.chat_conversations.find((c) => c.id === MINE[0].id)?.title === "Αύρα Νάξου",
        db.store.chat_conversations.find((c) => c.id === MINE[0].id)?.title
      );

      // A SECOND RENAME SESSION, because Enter closed the first. The
      // field unmounts on save — which is right, and which means a test
      // that keeps typing into the old locator is testing nothing.
      menu = await menuOf("Αύρα Νάξου");
      await press(menu.getByRole("button", { name: L.dashboard.chat.rename }));
      const field2 = pinnedRow.locator('input:not([type="checkbox"])').first();
      await field2.fill("ξανά");
      await field2.press("Escape");
      await page.waitForTimeout(400);
      check(
        `[${tag}] Esc cancels and the saved name is untouched`,
        db.store.chat_conversations.find((c) => c.id === MINE[0].id)?.title === "Αύρα Νάξου",
        db.store.chat_conversations.find((c) => c.id === MINE[0].id)?.title
      );

      menu = await menuOf("Αύρα Νάξου");
      await press(menu.getByRole("button", { name: L.dashboard.chat.pin }));
      await page.waitForTimeout(500);
      check(
        `[${tag}] pinning is written on the server`,
        db.store.chat_conversations.find((c) => c.id === MINE[0].id)?.is_pinned === true
      );

      menu = await menuOf("Τιμοκατάλογος");
      page.once("dialog", (d) => d.accept());
      await press(menu.getByRole("button", { name: L.module.delete }));
      await page.waitForTimeout(400);
      const undo = page.locator('[data-testid="conversation-undo"]').first();
      check(`[${tag}] «${L.dashboard.chat.undo}» is offered`, await undo.isVisible());
      check(
        `[${tag}] ...and nothing has been deleted yet`,
        db.store.chat_conversations.some((c) => c.id === MINE[1].id)
      );
      await press(undo.getByRole("button", { name: L.dashboard.chat.undo }));
      await page.waitForTimeout(400);
      check(
        `[${tag}] Undo keeps the conversation`,
        db.store.chat_conversations.some((c) => c.id === MINE[1].id)
      );

      page.once("dialog", (d) => d.accept());
      menu = await menuOf("Τιμοκατάλογος");
      await press(menu.getByRole("button", { name: L.module.delete }));
      await page.waitForTimeout(7500);
      check(
        `[${tag}] left alone, the delete goes through`,
        !db.store.chat_conversations.some((c) => c.id === MINE[1].id),
        db.store.chat_conversations.map((c) => c.title).join(" | ")
      );
      await shot("3-actions");

      // ---- 4. the phone's own gesture ------------------------------
      if (device.touch) {
        await page.goto(`${ORIGIN}/dashboard/chats`, { waitUntil: "networkidle" });
        await longPress(rowFor("Παλιά κουβέντα"));
        await page.waitForTimeout(300);
        check(
          `[${tag}] a long press opens the menu, with no «⋯» pressed`,
          await page.locator('[data-testid="conversation-menu"]').first().isVisible()
        );
        await shot("4-longpress");
      }

      // ---- 5. and user A cannot touch user B's ---------------------
      const theirTitleBefore = db.store.chat_conversations.find((c) => c.id === THEIRS.id)?.title;
      const renameTheirs = await page.evaluate(
        async (id) => {
          const res = await fetch(`/api/conversations/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "taken over" }),
          });
          return res.status;
        },
        THEIRS.id
      );
      check(`[${tag}] renaming another account's conversation is refused (${renameTheirs})`, renameTheirs >= 400);
      check(
        `[${tag}] ...and its name is unchanged`,
        db.store.chat_conversations.find((c) => c.id === THEIRS.id)?.title === theirTitleBefore
      );
      const deleteTheirs = await page.evaluate(
        async (id) => (await fetch(`/api/conversations/${id}`, { method: "DELETE" })).status,
        THEIRS.id
      );
      check(`[${tag}] deleting it answers 404, not 200 (${deleteTheirs})`, deleteTheirs === 404);
      check(
        `[${tag}] ...and it is still there`,
        db.store.chat_conversations.some((c) => c.id === THEIRS.id)
      );

      await context.close();
    }
  }
  check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} catch (err) {
  check("the walk finished", false, err?.stack ?? String(err));
} finally {
  try { await browser?.close(); } catch {}
  cleanup();
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
