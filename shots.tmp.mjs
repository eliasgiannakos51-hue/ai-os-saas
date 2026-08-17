import { startProdHarness } from "./scripts/lib/prod-harness.mjs";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "/tmp/claude-0/-home-user-ai-os-saas/eebf236b-5300-578e-8bf7-2c216891fceb/scratchpad/shots";
mkdirSync(OUT, { recursive: true });
const h = await startProdHarness({ tableRows: {}, supaPort: 54373 });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
try {
  const ctx = await h.signedIn(browser);
  const page = await ctx.newPage();
  const go = async (url) => { await page.goto(`${h.origin}${url}`, { waitUntil: "domcontentloaded", timeout: 30000 }); await page.waitForTimeout(1200); };
  for (const [name, url] of [["01-ideas", "/dashboard"], ["02-finance", "/dashboard/finance"], ["03-sales", "/dashboard/sales"], ["04-agents", "/dashboard/agents"], ["05-files", "/dashboard/files"]]) {
    await go(url);
    const btn = await page.locator('button[data-testid="empty-example"]').count();
    const txt = await page.locator('p[data-testid="empty-example"]').count();
    const help = await page.locator('[data-testid^="help-tip-"]').count();
    console.log(`  ${url.padEnd(20)} example-BUTTON=${btn}  example-text=${txt}  help-"?"=${help}`);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  await go("/dashboard/agents");
  const tip = page.locator('[data-testid^="help-tip-"]').first();
  if (await tip.count()) { await tip.click(); await page.waitForTimeout(500); }
  await page.screenshot({ path: `${OUT}/06-agents-help-open.png` });
  await go("/dashboard");
  const ex = page.locator('button[data-testid="empty-example"]').first();
  if (await ex.count()) {
    console.log("  example label:", JSON.stringify((await ex.innerText()).slice(0, 70)));
    await ex.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/07-ideas-after-click.png` });
    const filled = await page.locator("input, textarea").evaluateAll((els) => els.map((e) => e.value).filter(Boolean).slice(0, 3));
    console.log("  form values after the click:", JSON.stringify(filled));
  }
} finally { await browser.close(); await h.cleanup(); }
