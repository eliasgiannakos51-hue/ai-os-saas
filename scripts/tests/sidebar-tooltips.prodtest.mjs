// THE NARROW SIDEBAR NAMES EVERY ROW: ON HOVER, ON FOCUS, AND TO A SCREEN
// READER.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN §3: the sidebar has a narrow mode, icons
// only (components/dashboard/sidebar.tsx, "NARROW MODE: icons only, the
// name in a tooltip AND as the link's accessible name"). An icon nobody
// can name is a row nobody can use, so this hovers and focuses every row
// the narrow sidebar draws, in a real Chromium against a production build.
//
// REWRITTEN 2026-10-05 (QUEUE Α.13). This file hovered the sidebar it
// replaced — 79 configured rows, each with a hint — and found five links,
// because the design's sidebar has five fixed rows and shows every name in
// full when it is wide. The wide sidebar needs no tooltip; the narrow one
// is where a name can go missing, and that is what is measured now.
//
// AND AGAIN 2026-10-17, FOR TWO REASONS AT ONCE.
//
// THE NARROW FORM IS A WIDTH. It was a per-device choice kept in
// localStorage, seeded here and read back from a `data-collapsed`
// attribute; the owner had the «Collapse sidebar» button removed and
// the narrow form made automatic, so it is reached by opening a 900px
// window — between md, where the rail becomes icons-only, and lg,
// where it widens again. The attribute is gone with the state, so what
// says "this really is the narrow rail" is the rail's own width.
//
// AND THE ROWS HAVE NO aria-label ANY MORE. They used to carry the
// name twice: once as a hidden label for the narrow form, once as text
// for the wide one — two copies of one string, which is two strings
// that can disagree. The name is now the row's TEXT at every width,
// hidden from the eye between md and lg with `sr-only`, so a screen
// reader and a wide screen read the same characters by construction.
// This file looks rows up by their accessible name, which is the thing
// the user of a screen reader actually has.
//
// Run: node scripts/tests/sidebar-tooltips.prodtest.mjs
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

const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const NAMES = ["ionexaChat", "coding", "allTools", "settings"].map((k) => en.sidebar.rail[k]);

const harness = await startProdHarness({
  supaPort: 54374,
  tableRows: {
    user_onboarding: [{ user_id: USER.id, completed_at: "2026-01-01T00:00:00Z" }],
    user_credits: [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }],
  },
  userMetadata: { preferred_locale: "en" },
});
const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

try {
  // 900px: WIDE ENOUGH FOR md, NARROW ENOUGH TO MISS lg. That is the
  // whole of what makes this the icons-only rail now.
  const context = await harness.signedIn(browser, { width: 900, height: 900 });
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto(`${harness.origin}/dashboard/overview`, { waitUntil: "networkidle", timeout: 45000 });

  console.log("== 1. the real dashboard, in the narrow sidebar ==");
  checkTrue("still on the dashboard", new URL(page.url()).pathname === "/dashboard/overview", page.url());
  // MEASURED, NOT ASSERTED FROM AN ATTRIBUTE. Without this the pass
  // would run against the wide rail — where every name is already on
  // screen — and report tooltips that were never needed.
  const width = await page.locator('[data-testid="sidebar"]').evaluate((n) => Math.round(n.getBoundingClientRect().width));
  checkTrue(`the sidebar is narrow (${width}px)`, width > 0 && width < 120, `${width}px — the wide rail is 240`);
  // AND THE NAMES ARE OFF THE SCREEN BUT STILL IN THE ACCESSIBILITY
  // TREE, which is the property `sr-only` is for and the reason the
  // tooltip is the sighted user's half of it.
  const painted = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="sidebar"] nav a span')]
      .map((e) => Math.round(e.getBoundingClientRect().width))
      .filter((w) => w > 20).length
  );
  checkTrue("no row's name is painted at this width", painted === 0, `${painted} span(s) wider than 20px`);
  checkTrue("no tooltip before anything is hovered", (await page.locator('[role="tooltip"]').count()) === 0);

  console.log("\n== 2. hovering each row names it ==");
  const sidebar = page.locator('[data-testid="sidebar"]');
  for (const name of NAMES) {
    // BY ACCESSIBLE NAME. There is no aria-label any more: the name is
    // the row's own text, hidden from the eye with sr-only, so this is
    // the same string a screen reader announces.
    const link = sidebar.getByRole("link", { name, exact: true }).first();
    const there = await link.count().then((n) => n > 0);
    checkTrue(`${name}: the row is drawn, named for a screen reader`, there);
    if (!there) continue;
    await link.hover();
    const tip = page.locator('[role="tooltip"]', { hasText: name });
    checkTrue(`${name}: hovering shows its name`, await tip.first().waitFor({ timeout: 3000 }).then(() => true, () => false));
    await page.mouse.move(700, 450);
    await page.waitForTimeout(200);
  }

  console.log("\n== 3. keyboard users get it too ==");
  const first = sidebar.getByRole("link", { name: NAMES[1], exact: true }).first();
  await first.focus();
  const tip = page.locator('[role="tooltip"]', { hasText: NAMES[1] }).first();
  checkTrue("focusing a row shows its name", await tip.waitFor({ timeout: 3000 }).then(() => true, () => false));
  const describedBy = await page.evaluate(() => document.activeElement?.closest("[aria-describedby]")?.getAttribute("aria-describedby") ?? document.activeElement?.getAttribute("aria-describedby") ?? null);
  const tipId = await tip.getAttribute("id").catch(() => null);
  checkTrue("...and the row points at it with aria-describedby", Boolean(describedBy) && describedBy === tipId, `${describedBy} / ${tipId}`);

  console.log("\n== 4. it goes away again ==");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  checkTrue("Escape dismisses it", (await page.locator('[role="tooltip"]').count()) === 0);
  await context.close();
} finally {
  await browser.close();
  harness.cleanup();
}

console.log(fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
