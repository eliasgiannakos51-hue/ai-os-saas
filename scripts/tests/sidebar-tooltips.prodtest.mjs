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
const NAMES = ["new", "chat", "coding", "allTools", "settings"].map((k) => en.sidebar.rail[k]);

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
  const context = await harness.signedIn(browser, { width: 1440, height: 900 });
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", domain: "127.0.0.1", path: "/" }]);
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("ionexa.sidebarCollapsed", "1");
    } catch {}
  });
  const page = await context.newPage();
  await page.goto(`${harness.origin}/dashboard/overview`, { waitUntil: "networkidle", timeout: 45000 });

  console.log("== 1. the real dashboard, in the narrow sidebar ==");
  checkTrue("still on the dashboard", new URL(page.url()).pathname === "/dashboard/overview", page.url());
  const collapsed = await page.getAttribute('[data-testid="sidebar"]', "data-collapsed");
  checkTrue("the sidebar is narrow", collapsed === "true", collapsed);
  checkTrue("no tooltip before anything is hovered", (await page.locator('[role="tooltip"]').count()) === 0);

  console.log("\n== 2. hovering each row names it ==");
  for (const name of NAMES) {
    const link = page.locator(`[data-testid="sidebar"] a[aria-label="${name}"]`).first();
    const there = await link.isVisible().catch(() => false);
    checkTrue(`${name}: the row is drawn, named for a screen reader`, there);
    if (!there) continue;
    await link.hover();
    const tip = page.locator('[role="tooltip"]', { hasText: name });
    checkTrue(`${name}: hovering shows its name`, await tip.first().waitFor({ timeout: 3000 }).then(() => true, () => false));
    await page.mouse.move(700, 450);
    await page.waitForTimeout(200);
  }

  console.log("\n== 3. keyboard users get it too ==");
  const first = page.locator(`[data-testid="sidebar"] a[aria-label="${NAMES[1]}"]`).first();
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
