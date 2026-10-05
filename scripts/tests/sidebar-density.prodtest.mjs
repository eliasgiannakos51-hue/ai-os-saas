// THE SIDEBAR IS THE DESIGN'S, AND THE BROWSER PAINTS IT THAT WAY.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN §3 (2026-10-04): «SIDEBAR, ΕΝΑ ΚΑΙ ΙΔΙΟ
// ΠΑΝΤΟΥ» — logo, New, Chat, Coding, All tools, Recent tools, recent
// conversations, and Settings at the bottom. Nothing else is ever there;
// every tool is in All tools and ⌘K (src/lib/nav/rail.ts).
//
// REWRITTEN 2026-10-05 (QUEUE Α.13). This file measured the sidebar it
// replaced: six group headings and 26 or more rows, of which at least 15
// readable at 1080p. That sidebar no longer exists, so every one of those
// numbers was a failure that described nothing, in the nightly run since
// the design landed (#223). The question it asked is still the right one
// — what does a person actually see without scrolling, measured in a real
// Chromium against a real production build — asked of the sidebar there
// is now.
//
// WHAT "VISIBLE" MEANS, unchanged: a link whose box lies ENTIRELY inside
// the aside's own visible box, with no scrolling of either.
//
// Run: node scripts/tests/sidebar-density.prodtest.mjs
import { startProdHarness, USER } from "../lib/prod-harness.mjs";
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function checkTrue(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

// The words the account sees, read from the shipped messages so a
// rewording moves the needles rather than breaking them.
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const RAIL = ["new", "chat", "coding", "allTools"].map((k) => en.sidebar.rail[k]);
const SETTINGS = en.sidebar.rail.settings;

const CONVERSATIONS = [
  { id: "c1000000-0000-4000-8000-000000000001", user_id: USER.id, title: "Πλάνο για την εβδομάδα", is_pinned: false, created_at: "2026-10-04T10:00:00Z", updated_at: "2026-10-05T10:00:00Z" },
  { id: "c1000000-0000-4000-8000-000000000002", user_id: USER.id, title: "Προσφορά για πελάτη", is_pinned: false, created_at: "2026-10-03T10:00:00Z", updated_at: "2026-10-04T10:00:00Z" },
];

const harness = await startProdHarness({
  supaPort: 54373,
  tableRows: {
    user_onboarding: [{ user_id: USER.id, completed_at: "2026-01-01T00:00:00Z" }],
    user_credits: [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }],
    chat_conversations: CONVERSATIONS,
  },
  userMetadata: { preferred_locale: "en" },
});
const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

const VIEWPORTS = [
  ["390w ", { width: 390, height: 844 }],
  ["768p ", { width: 1366, height: 768 }],
  ["1440w", { width: 1440, height: 900 }],
  ["1080p", { width: 1920, height: 1080 }],
];

try {
  for (const [label, viewport] of VIEWPORTS) {
    console.log(`\n== ${label} (${viewport.width}x${viewport.height}) ==`);
    const context = await harness.signedIn(browser, viewport);
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", domain: "127.0.0.1", path: "/" }]);
    const page = await context.newPage();
    await page.goto(`${harness.origin}/dashboard/overview`, { waitUntil: "networkidle", timeout: 45000 });
    checkTrue(`${label}: the real dashboard, not a login redirect`, new URL(page.url()).pathname === "/dashboard/overview", page.url());

    // On a phone the sidebar is a drawer, opened by the top bar's menu.
    if (viewport.width < 768) {
      const menu = page.locator('header button[aria-label]').first();
      if (await menu.isVisible().catch(() => false)) await menu.click();
      await page.waitForTimeout(400);
    }

    const read = await page.evaluate(() => {
      const aside = document.querySelector('[data-testid="sidebar"]');
      if (!aside) return null;
      const box = aside.getBoundingClientRect();
      const links = [...aside.querySelectorAll("a")].map((a) => {
        const r = a.getBoundingClientRect();
        return {
          text: (a.textContent ?? "").trim() || a.getAttribute("aria-label") || "",
          href: a.getAttribute("href") ?? "",
          visible: r.width > 0 && r.height > 0 && r.top >= box.top && r.bottom <= Math.min(box.bottom, window.innerHeight) + 0.5,
          h: r.height,
        };
      });
      const headings = [...aside.querySelectorAll("p, h2, h3")]
        .map((e) => (e.textContent ?? "").trim())
        .filter(Boolean);
      return { links, headings, scrolls: aside.scrollHeight > aside.clientHeight + 1 };
    });
    checkTrue(`${label}: the sidebar is in the page`, read !== null);
    if (!read) {
      await context.close();
      continue;
    }

    const texts = read.links.map((l) => l.text);
    const order = RAIL.map((name) => texts.findIndex((t) => t === name));
    checkTrue(`${label}: New, Chat, Coding, All tools, each once`, RAIL.every((n) => texts.filter((t) => t === n).length === 1), JSON.stringify(texts));
    checkTrue(`${label}: ...in that order`, order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), JSON.stringify(order));
    checkTrue(`${label}: Settings is the last row`, texts[texts.length - 1] === SETTINGS, JSON.stringify(texts.slice(-2)));
    const convoRows = read.links.filter((l) => /\/dashboard\/chat\?c=/.test(l.href));
    checkTrue(`${label}: the latest conversations are listed, each opening itself (${convoRows.length})`,
      convoRows.length === CONVERSATIONS.length && CONVERSATIONS.every((c) => convoRows.some((r) => r.href.endsWith(c.id))), JSON.stringify(convoRows));
    // NOTHING ELSE. The fixed rows, the account's recent tools (none for
    // this account, so no heading either), its conversations and Settings
    // — and the logo, which links Home.
    const known = new Set([...RAIL, SETTINGS]);
    const other = read.links.filter((l) => !known.has(l.text) && !/\/dashboard\/chat\?c=/.test(l.href) && l.text !== "Ionexa");
    checkTrue(`${label}: no other row is in the sidebar`, other.length === 0, JSON.stringify(other));
    checkTrue(`${label}: no Recent tools heading over an empty list`, !read.headings.includes(en.sidebar.rail.recentTools), JSON.stringify(read.headings));
    checkTrue(`${label}: every row is readable without scrolling`, read.links.every((l) => l.visible), JSON.stringify(read.links.filter((l) => !l.visible)));
    checkTrue(`${label}: every row is a 44px target`, read.links.filter((l) => l.text !== "Ionexa").every((l) => l.h >= 44), JSON.stringify(read.links.map((l) => [l.text, l.h])));
    await context.close();
  }

  console.log("\n== the narrow sidebar: icons, and every name still there ==");
  const context = await harness.signedIn(browser, { width: 1440, height: 900 });
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", domain: "127.0.0.1", path: "/" }]);
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("ionexa.sidebarCollapsed", "1");
    } catch {}
  });
  const page = await context.newPage();
  await page.goto(`${harness.origin}/dashboard/overview`, { waitUntil: "networkidle", timeout: 45000 });
  const narrow = await page.evaluate(() => {
    const aside = document.querySelector('[data-testid="sidebar"]');
    return {
      collapsed: aside?.getAttribute("data-collapsed"),
      width: aside?.getBoundingClientRect().width ?? 0,
      names: [...(aside?.querySelectorAll("a[aria-label]") ?? [])].map((a) => a.getAttribute("aria-label")),
    };
  });
  checkTrue("the narrow sidebar is drawn narrow", narrow.collapsed === "true" && narrow.width <= 80, JSON.stringify(narrow));
  checkTrue("...and every fixed row keeps its name for a screen reader", [...RAIL, SETTINGS].every((n) => narrow.names.includes(n)), JSON.stringify(narrow.names));
  await context.close();
} finally {
  await browser.close();
  harness.cleanup();
}

console.log(fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
