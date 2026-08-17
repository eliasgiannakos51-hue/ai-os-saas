import { defineConfig } from "@playwright/test";

/**
 * The three journeys, against a real deployment.
 *
 * SEPARATE FROM EVERYTHING ELSE ON PURPOSE. `npm run build` runs
 * check-i18n and the unit suite and must stay fast and free; these specs
 * take minutes and spend money. They are a command you run before a
 * merge, deliberately, not a gate that fires on every push.
 *
 * ONE WORKER, NEVER PARALLEL. All three journeys use the same account.
 * Running them at once would have the agent spec's rate limit fire on the
 * website spec's request, and would make "exactly one credit transaction"
 * unanswerable — another spec's settlement would land in the same window.
 *
 * NO RETRIES. A retry on a spec that spends credits doubles the bill and,
 * worse, turns a real intermittent backend failure into a green run. If
 * one of these is flaky, that is a finding about the product.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15 * 60 * 1000,
  reporter: [["list"], ["html", { outputFolder: "e2e-report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    // The published-site step opens a page; everything else is HTTP.
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: false,
  },
  // Fail loudly and early if the target was never set, rather than
  // producing a wall of "connect ECONNREFUSED localhost:3000".
  globalSetup: "./e2e/support/global-setup.ts",
});
