import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

// Local-only smoke suite (see tests/smoke.spec.ts). Requires a working
// .env.local with real Supabase credentials for the authenticated checks —
// see README.md.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // This environment's pre-installed Chromium revision doesn't always
    // match the one @playwright/test's version expects to auto-download
    // (network access for that download isn't available here) — pointing
    // explicitly at the pre-installed browser avoids that mismatch. Safe
    // to keep in any environment: it's just a fixed local binary path.
    launchOptions: {
      executablePath: "/opt/pw-browsers/chromium",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
