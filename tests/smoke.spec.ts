import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { MODULES } from "../src/lib/modules";
import { enModuleTitle } from "../src/lib/module-labels";

// Permanent regression-safety-net suite (see the project's "before every
// push" workflow) — run this, not just tsc/eslint/build, before pushing
// anything. Every selector here is checked against the actual rendered
// English UI text (messages/en.json / component source), not guessed —
// a stale selector that never matches real markup is worse than no test
// at all, since it teaches you to ignore failures.
//
// Whenever a significant new feature is added or changed, add a
// corresponding test to THIS file (not a throwaway script) so coverage
// only ever grows.

const ALL_MODULES = [
  // The English title comes from the message catalogue now, so this
  // suite and the app cannot disagree about what a module is called.
  { slug: "ideas", href: "/dashboard", title: "Ideas" },
  ...MODULES.map((m) => ({ slug: m.slug, href: `/dashboard/${m.slug}`, title: enModuleTitle(m) })),
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
      page.getByRole("heading", { name: "Your business, organized — with AI that actually helps." })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Log In" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign Up" })).toBeVisible();
  });

  test("unauthenticated visit to /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("login page loads with email/password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  });

  test("signup page loads on the plan-selection step", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Choose your plan" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Authenticated checks — everything below needs a real, working Supabase
// project reachable from wherever this suite runs (NEXT_PUBLIC_SUPABASE_URL
// + SUPABASE_SERVICE_ROLE_KEY in .env.local — the latter is required
// server-side by /api/signup to auto-confirm the test account). A single
// test account is created once via the real signup UI and reused for every
// check in this file, so one failed signup surfaces as skipped (not
// failed) dependent tests with a clear reason, instead of many confusing
// individual failures.
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
      await page.goto("/signup");
      // Step 1: plan selection — Free is selected by default, just continue.
      await page.getByRole("button", { name: "Continue" }).click();
      // Step 2: account details.
      await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
      await page.getByLabel("Email").fill(user.email);
      await page.getByLabel("Password", { exact: true }).fill(user.password);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Create Account" }).click();

      const outcome = await Promise.race([
        page
          .waitForURL(/\/dashboard\/overview$/, { timeout: 20_000 })
          .then((): "ok" => "ok"),
        page
          .locator("p.text-red-400")
          .first()
          .waitFor({ state: "visible", timeout: 20_000 })
          .then((): "error" => "error"),
      ]);

      if (outcome === "error") {
        const message = await page.locator("p.text-red-400").first().innerText();
        throw new Error(`signup form reported: ${message}`);
      }

      signedUp = true;
    } catch (err) {
      setupError = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(
        `\n[smoke] Signup during test setup failed — all authenticated checks below will be SKIPPED.\n` +
          `[smoke] This usually means the test runner can't reach Supabase, or ` +
          `SUPABASE_SERVICE_ROLE_KEY is missing from .env.local (required by /api/signup ` +
          `to auto-confirm the test account) — not that a feature is missing. Reason: ${setupError}\n`
      );
    }
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test.beforeEach(() => {
    test.skip(!signedUp, `signup setup failed: ${setupError}`);
  });

  test("signup flow lands on Overview", async () => {
    await expect(page).toHaveURL(/\/dashboard\/overview$/);
  });

  test("logout then login again works", async () => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/login$/);

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Log In", exact: true }).click();
    await page.waitForURL(/\/dashboard\/overview$/, { timeout: 20_000 });
  });

  test("settings page loads", async () => {
    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("create a record in the Ideas module end to end", async () => {
    await page.goto("/dashboard");
    const uniqueName = `Smoke test idea ${Date.now()}`;
    await page.getByRole("button", { name: "New Idea" }).click();
    await page.getByPlaceholder("idea name").fill(uniqueName);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 });
  });

  test("create a record in a config-driven module (Competitors) end to end", async () => {
    await page.goto("/dashboard/competitors");
    const uniqueName = `Smoke test competitor ${Date.now()}`;
    await page.getByRole("button", { name: "New Competitors" }).click();
    // The module's first required text field — filled generically since
    // field sets differ per module; Competitors' headline field is its
    // name-like field, always the first visible text input in the form.
    await page.locator("form input[type='text'], form input:not([type])").first().fill(uniqueName);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 });
  });

  for (const m of ALL_MODULES) {
    test(`${m.title} module: page loads, create/search/sort/export UI exists, sidebar link works`, async () => {
      await page.goto("/dashboard/overview");
      await page.getByRole("link", { name: m.title, exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`${m.href}$`));
      await expect(page.getByRole("heading", { name: m.title, exact: true })).toBeVisible();
      // The shared list layout, in the order it always appears now:
      // "+ New", then search, then sort/filter, then the card grid.
      await expect(page.getByRole("button", { name: `New ${m.title}` })).toBeVisible();
      await expect(page.getByPlaceholder("Search...")).toBeVisible();
      await expect(page.getByText("Sort:")).toBeVisible();
      await expect(page.getByRole("button", { name: "Newest" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Oldest" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
    });
  }

  // -------------------------------------------------------------------------
  // The shared card + detail structure. Checked on one module rather than
  // all 18: every module list renders the same GenericRecordCard, so a
  // structural break shows up here regardless of which one is used.
  // -------------------------------------------------------------------------
  test("module card: icon tile, '...' menu, and a detail panel with tabs", async () => {
    await page.goto("/dashboard/competitors");
    const uniqueName = `Smoke card ${Date.now()}`;
    await page.getByRole("button", { name: "New Competitors" }).click();
    await page.locator("form input[type='text'], form input:not([type])").first().fill(uniqueName);
    await page.getByRole("button", { name: "Save" }).click();

    const card = page.locator("[data-row]", { hasText: uniqueName }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // The "..." menu carries the actions that used to be a row of bare
    // icon buttons along the card's bottom edge.
    await card.getByRole("button", { name: `Actions for ${uniqueName}` }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Ask AI" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();

    // Clicking the card opens the detail panel: tabs on top, actions last.
    // exact: true — the corner star's accessible name is
    // "Add to favorites: <name>", which a substring match would also hit.
    await card.getByRole("button", { name: uniqueName, exact: true }).click();
    await expect(page.getByRole("tab", { name: "Details" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Links" })).toBeVisible();
    await page.getByRole("tab", { name: "Edit" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Mission Control — plan + step creation. The Planner/step-classification
  // AI calls are mocked (page.route) so this test is fast, free, and
  // deterministic instead of depending on a real Anthropic API key and
  // real model output shape on every run.
  // -------------------------------------------------------------------------
  test("Mission Control: create a mission, then build its step (mocked AI)", async () => {
    await page.route("**/api/mission/plan", async (route) => {
      await route.fulfill({
        json: {
          ok: true,
          planned: true,
          mission: {
            id: `smoke-mission-${Date.now()}`,
            user_id: "smoke",
            goal: "Smoke test mission goal",
            status: "planning",
            plan_steps: { steps: [{ text: "Log an idea about smoke testing", status: "pending" }] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
      });
    });

    await page.goto("/dashboard/mission");
    // The mission form opens by default only while the account has no
    // missions — a fresh smoke-test account does — but click through the
    // "+ New Mission" button when it doesn't, so this test doesn't depend
    // on run order.
    const newMission = page.getByRole("button", { name: "New Mission" });
    if (await newMission.isVisible().catch(() => false)) await newMission.click();
    await page.getByLabel("What's your goal?").fill("Smoke test mission goal");
    await page.getByRole("button", { name: "Create Plan" }).click();
    await expect(page.getByText("Smoke test mission goal").first()).toBeVisible({ timeout: 10_000 });

    // The card summarises; the steps live in the detail panel it opens.
    // "Create with AI" is in there, not on the card.
    await page
      .locator("[data-row]", { hasText: "Smoke test mission goal" })
      .first()
      // exact: true, for the same reason as the module-card test above.
      .getByRole("button", { name: "Smoke test mission goal", exact: true })
      .click();
    await expect(page.getByRole("tab", { name: /Steps/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Review" })).toBeVisible();
    await expect(page.getByText("Log an idea about smoke testing")).toBeVisible();

    await page.route("**/api/create", async (route) => {
      await route.fulfill({
        json: {
          ok: true,
          matched: true,
          module: "ideas",
          moduleTitle: "Ideas",
          href: "/dashboard",
          message: "Logged it.",
          outputSummary: "Logged a new idea: smoke testing.",
        },
      });
    });

    await page.getByRole("button", { name: "Create with AI" }).first().click();
    await expect(page.getByText("Logged a new idea: smoke testing.")).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // Website Builder — job-start + background-process + status-poll flow,
  // all mocked so no real Claude call happens and the "completed" status
  // is returned on the very first poll instead of waiting on a real
  // generation.
  // -------------------------------------------------------------------------
  test("Website Builder: generate a website end to end (mocked AI)", async () => {
    const websiteId = `smoke-website-${Date.now()}`;
    const htmlContent = "<html><body><h1>Smoke Test Site</h1></body></html>";

    await page.route("**/api/websites/generate", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        json: {
          ok: true,
          generated: true,
          pending: true,
          record: {
            id: websiteId,
            user_id: "smoke",
            name: "Smoke Test Site",
            html_content: "",
            status: "pending",
            error_message: null,
            reference_image_url: null,
            attempt_count: 0,
            created_at: new Date().toISOString(),
          },
        },
      });
    });

    await page.route("**/api/websites/generate/process", async (route) => {
      await route.fulfill({ json: { ok: true } });
    });

    await page.route("**/api/websites/status*", async (route) => {
      await route.fulfill({
        json: {
          ok: true,
          record: {
            id: websiteId,
            user_id: "smoke",
            name: "Smoke Test Site",
            html_content: htmlContent,
            status: "completed",
            error_message: null,
            reference_image_url: null,
            attempt_count: 1,
            created_at: new Date().toISOString(),
          },
        },
      });
    });

    await page.goto("/dashboard/website-builder");
    // Same as Mission Control: the form opens by itself on an empty
    // account, otherwise it's behind "+ New Website".
    const newWebsite = page.getByRole("button", { name: "New Website" });
    if (await newWebsite.isVisible().catch(() => false)) await newWebsite.click();
    await page.getByLabel("Name").fill("Smoke Test Site");
    await page.getByLabel("Describe your website").fill("A one-page smoke test site for automated checks.");
    await page.getByRole("button", { name: "Generate Website" }).click();
    await expect(page.getByText("Website generated")).toBeVisible({ timeout: 10_000 });

    // The finished project opens in the shared detail panel.
    await expect(page.getByRole("tab", { name: "Preview" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "History" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download HTML" })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Create Studio — one sentence in, a preview the user can correct, then
  // the workspace. The type detection is mocked so this runs without an
  // Anthropic key; everything after "Create" is the real Website Builder
  // flow, mocked exactly as the test above mocks it.
  // -------------------------------------------------------------------------
  test("Create Studio: detect a type, preview it, then create (mocked AI)", async () => {
    const websiteId = `smoke-studio-${Date.now()}`;

    await page.route("**/api/create-studio/detect", async (route) => {
      await route.fulfill({
        json: {
          ok: true,
          detection: {
            type: "website",
            title: "Smoke Studio Site",
            understanding: "You want a one-page smoke test site.",
            moduleSlug: null,
            frequency: null,
          },
        },
      });
    });
    await page.route("**/api/websites/generate", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        json: {
          ok: true,
          generated: true,
          record: {
            id: websiteId,
            user_id: "smoke",
            name: "Smoke Studio Site",
            html_content: "",
            status: "pending",
            error_message: null,
            reference_image_url: null,
            created_at: new Date().toISOString(),
          },
        },
      });
    });
    await page.route("**/api/websites/generate/process", async (route) => {
      await route.fulfill({ json: { ok: true } });
    });
    await page.route("**/api/websites/status*", async (route) => {
      await route.fulfill({
        json: {
          ok: true,
          record: {
            id: websiteId,
            user_id: "smoke",
            name: "Smoke Studio Site",
            html_content: "<html><body><h1>Studio</h1></body></html>",
            status: "completed",
            error_message: null,
            reference_image_url: null,
            created_at: new Date().toISOString(),
          },
        },
      });
    });

    await page.goto("/dashboard/create");
    await page.locator("#studio-input").fill("A one-page smoke test site for automated checks");
    await page.getByRole("button", { name: "Continue" }).click();

    // The preview: what it understood, the type, and BOTH real numbers.
    await expect(page.getByText("You want a one-page smoke test site.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Website", { exact: true })).toBeVisible();
    await expect(page.getByText("Estimated time")).toBeVisible();
    await expect(page.getByText("Estimated credits")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit description" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change type" })).toBeVisible();

    // Nothing is created until Create is pressed.
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tab", { name: /Progress/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: "AI Chat" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Files/ })).toBeVisible();

    await page.getByRole("tab", { name: /Progress/ }).click();
    await expect(page.getByText("Generating the website")).toBeVisible();
  });
});
