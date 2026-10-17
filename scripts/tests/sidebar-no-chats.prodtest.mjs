// NO CONVERSATION IS IN THE SIDEBAR, ON ANY PAGE, AT ANY WIDTH.
//
// «ΑΦΑΙΡΕΣΕ ΤΙΣ ΠΡΟΣΦΑΤΕΣ ΣΥΝΟΜΙΛΙΕΣ ΑΠΟ ΤΟ SIDEBAR … Δεν την κρύβεις
// με CSS. Δεν τη βάζεις πίσω από διακόπτη. Δεν αποδίδεται καθόλου. Από
// ΚΑΘΕ μορφή του sidebar: υπολογιστής, στενή μορφή με εικονίδια,
// κινητό, και κάθε σελίδα που έχει δικό της sidebar. Για ΟΛΟΥΣ τους
// χρήστες.» (owner, 2026-10-16)
//
// WHY A PRODTEST AND NOT A READ OF THE SOURCE. The row was removed by
// deleting the markup, but "not rendered" is a claim about a browser,
// not about a file: a sidebar is drawn by a server component, a client
// component and a stylesheet between them, and only one of the three is
// the file the row was deleted from. This opens a real Chromium against
// a real production build, with conversations IN THE DATABASE, and
// looks at what is on the screen.
//
// THE ACCOUNT HAS CONVERSATIONS. That is the whole point: an empty
// account proves nothing, because the old sidebar drew nothing for one
// either. Ten of them, with titles no other part of the page uses, so
// finding one of those words inside the aside is finding a conversation.
//
// TEN PAGES, because the sidebar is rendered by the dashboard layout
// and a page could still add its own. Chat is in the list twice over —
// once plain, once with `?c=` — because that screen had a SECOND
// conversation list of its own until this change, and `?c=` is the
// state in which the old sidebar marked a row as selected.
//
// TIMES THREE FORMS: the computer, the narrow icons-only rail and the
// phone's drawer. Thirty page-and-form pairs, and a conversation in
// any one of them fails this.
//
// Run: node scripts/tests/sidebar-no-chats.prodtest.mjs
import { startProdHarness, USER } from "../lib/prod-harness.mjs";
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const en = JSON.parse(readFileSync("messages/en.json", "utf8"));

// WORDS THAT APPEAR NOWHERE ELSE IN THE PRODUCT, so a hit inside the
// aside is a conversation and not a tool name, a heading or a greeting.
const TITLES = [
  "Ζιζάνιο στο περβόλι", "Καπνοδόχος Μαρτίου", "Λαχανόκηπος Β2", "Τρικυμία στον κάβο", "Σφυρίχτρα του φάρου",
  "Παξιμάδι Καλύμνου", "Αμπέλι στο Ζευγολατιό", "Κουδούνι της Τρίτης", "Πηγάδι στο Ξηρόκαμπο", "Μαντήλι της γιαγιάς",
];
const CONVERSATIONS = TITLES.map((title, i) => ({
  id: `c1000000-0000-4000-8000-00000000000${i}`.slice(0, 36),
  user_id: USER.id,
  title,
  is_pinned: i === 0,
  created_at: `2026-10-0${(i % 9) + 1}T10:00:00Z`,
  updated_at: `2026-10-1${i % 6}T10:00:00Z`,
}));

const harness = await startProdHarness({
  supaPort: 54399,
  tableRows: {
    user_onboarding: [{ user_id: USER.id, completed_at: "2026-01-01T00:00:00Z" }],
    user_credits: [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }],
    chat_conversations: CONVERSATIONS,
    // All tools' squares are behind `all-tools-tiles` since 2026-10-14
    // and it starts at «Κανείς». This walks /dashboard/tools among its
    // ten, and a page that drew no grid would be a thinner page to
    // search for a conversation in — so the squares are opened, as
    // all-tools-tiles.test.mjs §5 requires of every prodtest that
    // reads that page.
    feature_flags: [{ key: "all-tools-tiles", audience: "everyone" }],
  },
  userMetadata: { preferred_locale: "en" },
});
const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

// TEN PAGES. Chat twice (plain, and with a conversation open), the two
// screens that used to own a conversation list, and six more across the
// product so a page that adds its own sidebar cannot hide.
const PAGES = [
  "/dashboard/overview",
  "/dashboard/chat",
  `/dashboard/chat?c=${CONVERSATIONS[0].id}`,
  "/dashboard/chats",
  "/dashboard/tools",
  "/dashboard/coding",
  "/dashboard/settings",
  "/dashboard/files",
  "/dashboard/deep-research",
  "/dashboard/data-analysis",
];

// THE WORDS THE SECTION USED TO SAY, in the ten languages the product
// ships. These were `sidebar.rail.recentChats` and
// `sidebar.rail.allConversations` until 2026-10-16; both keys were
// deleted with the section, so this is the record of what they said
// and the thing no sidebar may print again.
const GONE_HEADINGS = [
  "Recent chats", "All conversations",
  "Πρόσφατες συνομιλίες", "Όλες οι συνομιλίες",
  "Chats recientes", "Todas las conversaciones",
  "Discussions récentes", "Toutes les discussions",
  "Letzte Chats", "Alle Unterhaltungen",
  "Chat recenti", "Tutte le conversazioni",
  "Conversas recentes", "Todas as conversas",
  "最近的对话", "全部对话",
  "最近のチャット", "すべての会話",
  "المحادثات الأخيرة", "كل المحادثات",
];

// THREE FORMS, BECAUSE THE OWNER NAMED THREE: «υπολογιστής, στενή
// μορφή με εικονίδια, κινητό».
//
// THE NARROW ONE IS A WIDTH NOW. It was a per-device choice kept in
// localStorage until 2026-10-17, seeded here rather than resized into;
// the owner had the «Collapse sidebar» button removed and the narrow
// form made automatic — «γίνεται αυτόματα σε μικρές οθόνες» — so it is
// reached by opening a 900px window, between the md breakpoint where
// the rail becomes icons-only and the lg one where it widens again.
// The pass still asserts it really took: 64px against the wide rail's
// 240, which is what stops a seed-that-did-nothing from quietly
// re-running the wide pass twice.
const DEVICES = [
  ["computer", { width: 1440, height: 900 }, false, false],
  ["narrow  ", { width: 900, height: 900 }, false, true],
  ["phone   ", { width: 390, height: 844 }, true, false],
];

try {
  for (const [label, viewport, touch, collapsed] of DEVICES) {
    console.log(`\n== ${label}: ten pages, ten conversations in the database ==`);
    const context = await harness.signedIn(browser, viewport);
    const page = await context.newPage();

    for (const path of PAGES) {
      await page.goto(`${harness.origin}${path}`, { waitUntil: "networkidle" });

      // ON A PHONE THE SIDEBAR IS A DRAWER, so it has to be opened or
      // this test would pass by looking at nothing — the exact way a
      // check of a hidden thing lies.
      if (touch) {
        const menu = page.locator("header button[aria-label]").first();
        if (await menu.isVisible().catch(() => false)) {
          const box = await menu.boundingBox();
          if (box) {
            const cdp = await context.newCDPSession(page);
            const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
            await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
            await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          }
        }
        await page.waitForTimeout(400);
      }

      const seen = await page.evaluate(() => {
        const aside = document.querySelector('[data-testid="sidebar"]');
        if (!aside) return null;
        return {
          // THE TEXT, not only the links: a row drawn as a button, a
          // span or a bare div is still a conversation on the screen.
          // (It WAS a link and became a button on 2026-10-15, which is
          // how a check that read only <a> came to report none.)
          text: aside.textContent ?? "",
          width: Math.round(aside.getBoundingClientRect().width),
          rows: aside.querySelectorAll('[data-testid="conversation-row"]').length,
          heading: aside.querySelectorAll('[data-testid="recent-conversations"]').length,
        };
      });

      check(`${label} ${path}: the sidebar is on the page at all`, seen !== null,
        "no [data-testid=\"sidebar\"] — this test would otherwise pass by finding nothing");
      if (!seen) continue;
      // THE NARROW FORM IS REALLY NARROW. Without this, a viewport that
      // landed on the wrong side of a breakpoint would quietly re-run
      // the wide pass and report the icons-only sidebar as clean
      // without ever having drawn it.
      if (collapsed) {
        check(`${label} ${path}: ...in its narrow, icons-only form (${seen.width}px)`,
          seen.width > 0 && seen.width < 120, `${seen.width}px — the wide rail is 240`);
      }

      const found = TITLES.filter((t) => seen.text.includes(t));
      check(`${label} ${path}: not one conversation in the sidebar`, found.length === 0, found.join(" | "));
      check(`${label} ${path}: ...and no row, and no «Recent chats» heading`,
        seen.rows === 0 && seen.heading === 0, `rows=${seen.rows} heading=${seen.heading}`);
      // THE HEADING IN ALL TEN LANGUAGES. A sidebar that kept the
      // heading over an empty list is still a sidebar with a
      // conversations section in it, and the browser is only ever run
      // in one language per pass — so the words are written out rather
      // than read from the messages, which no longer hold them:
      // `sidebar.rail.recentChats` and `sidebar.rail.allConversations`
      // were deleted from all ten files in the same round, and a check
      // that read a key back would have had nothing to look for.
      const said = GONE_HEADINGS.filter((w) => seen.text.includes(w));
      check(`${label} ${path}: ...nor the heading, in any of the ten languages`,
        said.length === 0, said.join(" | "));
    }

    // THE SECOND THING THE OWNER ASKED FOR (2026-10-17): the rail has
    // ONE row for the chat, it says «Ionexa Chat», it opens the chat —
    // and «New», «Chats» and «Collapse sidebar» are not on the screen
    // in any form, at any width, for anybody.
    await page.goto(`${harness.origin}/dashboard/chat`, { waitUntil: "networkidle" });
    if (touch) {
      const menu = page.locator("header button[aria-label]").first();
      const box = (await menu.isVisible().catch(() => false)) ? await menu.boundingBox() : null;
      if (box) {
        const cdp = await context.newCDPSession(page);
        const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      }
      await page.waitForTimeout(400);
    }
    const rail = await page.evaluate(() => {
      const aside = document.querySelector('[data-testid="sidebar"]');
      if (!aside) return null;
      return {
        links: [...aside.querySelectorAll("a")].map((a) => ({
          text: (a.textContent ?? "").trim() || a.getAttribute("aria-label") || "",
          href: a.getAttribute("href") ?? "",
        })),
        // EVERY NAME IN THE ASIDE, not only the links'. «Collapse
        // sidebar» was a <button> with an aria-label and no text: a
        // check that read <a> elements would have reported it gone
        // while it sat there.
        spoken: [...aside.querySelectorAll("[aria-label]")].map((e) => (e.getAttribute("aria-label") ?? "").trim()),
        text: aside.textContent ?? "",
      };
    });
    check(`${label}: the rail was read`, rail !== null && rail.links.length > 0, JSON.stringify(rail));
    // THE NAME IS READ FROM aria-label WHEN THERE IS NO TEXT. In the
    // narrow form the label is still in the DOM, hidden with sr-only
    // (md:sr-only lg:not-sr-only), so textContent finds it either way
    // — the fallback is for a row that ever goes icon-only for real.
    const names = (rail?.links ?? []).map((r) => r.text);
    check(`${label}: the sidebar says «${en.sidebar.rail.ionexaChat}»`,
      names.includes(en.sidebar.rail.ionexaChat), names.join(" | "));
    const chat = (rail?.links ?? []).find((r) => r.text === en.sidebar.rail.ionexaChat);
    check(`${label}: ...and it opens the chat`, chat?.href === "/dashboard/chat", JSON.stringify(chat));
    check(`${label}: ...and it is the only row that leads there`,
      (rail?.links ?? []).filter((r) => r.href === "/dashboard/chat").length === 1,
      JSON.stringify((rail?.links ?? []).filter((r) => r.href === "/dashboard/chat")));
    // AND THE THREE THE OWNER HAD REMOVED, WRITTEN OUT. Their keys —
    // sidebar.rail.new, .chats, .collapse, .expand — were deleted from
    // all ten message files in the same round, so there is nothing to
    // read them back from; the English words are what the sidebar
    // printed and what it may not print again. English only, because
    // the browser runs in one language per pass and this one is `en`
    // (userMetadata above); the ten-language half is GONE_HEADINGS.
    //
    // A ROW, A BUTTON OR A TOOLTIP ALIKE. Checked against every
    // accessible name in the aside and against its whole text, not
    // against the links: two of the four never were links.
    const REMOVED = ["New", "Chats", "Collapse sidebar", "Expand sidebar"];
    // ON A WORD BOUNDARY in the free text, because «New» is four
    // letters that sit inside other words and the aside also carries
    // the account's own name and plan. An exact match where there is a
    // name to match exactly, a whole word where there is only prose.
    const still = REMOVED.filter(
      (w) =>
        names.includes(w) ||
        (rail?.spoken ?? []).includes(w) ||
        new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, "u").test(rail?.text ?? "")
    );
    check(`${label}: ...and «New», «Chats» and «Collapse sidebar» are nowhere in it`, still.length === 0, still.join(" | "));

    await context.close();
  }
} finally {
  await browser.close();
  harness.cleanup();
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
// EXPLICIT ON BOTH PATHS. `if (fail) process.exit(1)` leaves success to
// the event loop draining, and one retained handle — a browser, a
// server, a socket — turns a passing prodtest into a hang that reads
// as a timeout (scripts/tests/prodtest-hygiene.test.mjs §2).
process.exit(fail === 0 ? 0 : 1);
