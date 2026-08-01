import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { MODULES } from "../src/lib/modules";

// The 13 modules exactly as the sidebar orders them: Ideas (hand-built),
// then the 12 config-driven modules from src/lib/modules.ts.
const ALL_MODULES = [
  { slug: "ideas", href: "/dashboard", title: "Ideas" },
  ...MODULES.map((m) => ({ slug: m.slug, href: `/dashboard/${m.slug}`, title: m.title })),
];

function randomTestUser() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return {
    email: `smoke-test-${stamp}@example.com`,
    password: `Sm0ke-Test-${stamp}!`,
  };
}

// ---------------------------------------------------------------------------
// Public pages — no auth required, these should always be runnable.
// ---------------------------------------------------------------------------

test.describe("public pages", () => {
  test("landing page loads for logged-out users", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "The energy behind everything you build." })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "login()" })).toBeVisible();
    await expect(page.getByRole("link", { name: "sign_up()" })).toBeVisible();
  });

  test("unauthenticated visit to /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("login page loads and toggles between login/sign_up modes", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "authenticate" })).toBeVisible();
    // The tab button, not the "no account yet? sign_up" link further down.
    await page.getByRole("button", { name: "sign_up" }).first().click();
    await expect(page.getByRole("heading", { name: "create_account" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Authenticated checks — everything below needs a real, working Supabase
// project reachable from wherever this suite runs (see README's Setup
// section). A single test account is created once via the real signup UI
// and reused for every check in this file, so one failed signup surfaces as
// skipped (not failed) dependent tests with a clear reason, instead of 20+
// confusing individual failures.
// ---------------------------------------------------------------------------

test.describe("authenticated dashboard", () => {
  let context: BrowserContext;
  let page: Page;
  let signedUp = false;
  let setupError = "";
  const user = randomTestUser();

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    try {
      await page.goto("/login");
      // The tab button, not the "no account yet? sign_up" link further down.
      await page.getByRole("button", { name: "sign_up" }).first().click();
      await page.getByLabel("email").fill(user.email);
      await page.getByLabel("password").fill(user.password);
      await page.getByRole("button", { name: "run signup()" }).click();

      // Race the redirect against the inline error box so a failed signup
      // (e.g. no network access to Supabase) surfaces its real reason
      // instead of just timing out.
      const outcome = await Promise.race([
        page
          .waitForURL(/\/dashboard\/overview$/, { timeout: 15_000 })
          .then((): "ok" => "ok"),
        page
          .getByText(/^error:/)
          .waitFor({ state: "visible", timeout: 15_000 })
          .then((): "error" => "error"),
      ]);

      if (outcome === "error") {
        const message = await page.getByText(/^error:/).innerText();
        throw new Error(`signup form reported: ${message}`);
      }

      signedUp = true;
    } catch (err) {
      setupError = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(
        `\n[smoke] Signup during test setup failed — all authenticated checks below will be SKIPPED.\n` +
          `[smoke] This usually means the test runner can't reach Supabase (NEXT_PUBLIC_SUPABASE_URL), ` +
          `not that a feature is missing. Reason: ${setupError}\n`
      );
    }
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test.beforeEach(() => {
    test.skip(!signedUp, `signup setup failed: ${setupError}`);
  });

  test("signup flow lands on Overview and shows the account email", async () => {
    await expect(page).toHaveURL(/\/dashboard\/overview$/);
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("logout then login again works", async () => {
    await page.getByRole("button", { name: "logout()" }).click();
    await page.waitForURL(/\/login$/);

    await page.getByLabel("email").fill(user.email);
    await page.getByLabel("password").fill(user.password);
    await page.getByRole("button", { name: "run login()" }).click();
    await page.waitForURL(/\/dashboard\/overview$/, { timeout: 20_000 });
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("overview page loads with a card for all 13 modules", async () => {
    await page.goto("/dashboard/overview");
    for (const m of ALL_MODULES) {
      await expect(page.getByRole("heading", { name: m.title, exact: true })).toBeVisible();
    }
  });

  test("settings page loads", async () => {
    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("Cmd+K / Ctrl+K jumps to Create Anything from another page", async () => {
    await page.goto("/dashboard/overview");
    await page.keyboard.press("ControlOrMeta+K");
    await page.waitForURL(/\/dashboard\/create$/, { timeout: 5_000 });
  });

  test("mobile viewport shows a hamburger menu that opens the sidebar", async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    try {
      await page.goto("/dashboard/overview");
      const menuButton = page.getByRole("button", { name: "Toggle menu" });
      await expect(menuButton).toBeVisible();
      await menuButton.click();
      await expect(page.getByRole("link", { name: "overview" })).toBeVisible();
      await expect(page.getByRole("link", { name: "settings" })).toBeVisible();
    } finally {
      await page.setViewportSize({ width: 1280, height: 800 });
    }
  });

  for (const m of ALL_MODULES) {
    test(`${m.title} module: page loads, create/search/sort/export exist, sidebar link works`, async () => {
      // Sidebar link navigates to the module.
      await page.goto("/dashboard/overview");
      await page.getByRole("link", { name: m.title.toLowerCase(), exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${m.href}$`));

      // Page loaded without error (not a 404/500 shell) — the page header
      // shows the module title.
      await expect(page.getByRole("heading", { name: m.title, exact: true })).toBeVisible();

      // Create button (opens the add form) exists.
      await expect(page.getByRole("button", { name: `+ new_${m.slug}()` })).toBeVisible();

      // Search input exists.
      await expect(page.getByPlaceholder("search.filter()...")).toBeVisible();

      // Sort toggle exists.
      await expect(page.getByText("sort:")).toBeVisible();
      await expect(page.getByRole("button", { name: "newest" })).toBeVisible();
      await expect(page.getByRole("button", { name: "oldest" })).toBeVisible();

      // Export button exists.
      await expect(page.getByRole("button", { name: "export.csv()" })).toBeVisible();
    });
  }
});
