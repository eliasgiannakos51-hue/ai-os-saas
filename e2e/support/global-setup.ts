/**
 * Refuse to start rather than fail three specs one at a time.
 *
 * Every one of these journeys costs credits and minutes. A run that was
 * never going to work — no target, no account — should say so in the
 * first second, not after the first spec has already uploaded a file and
 * paid for an extraction.
 */
const REQUIRED = {
  E2E_BASE_URL: "the deployment to test, e.g. https://staging.ionexa.ai (NO trailing slash)",
  E2E_EMAIL: "the test account's email — a real account on that deployment",
  E2E_PASSWORD: "its password",
};

export default async function globalSetup() {
  const missing = Object.entries(REQUIRED).filter(([name]) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      "\nThese specs talk to a real deployment and spend real credits. Nothing ran.\n\n" +
        missing.map(([name, why]) => `  MISSING  ${name} — ${why}`).join("\n") +
        "\n\nSee e2e/README.md.\n"
    );
  }
  const base = process.env.E2E_BASE_URL!;
  if (base.endsWith("/")) {
    throw new Error(`\nE2E_BASE_URL must not end with a slash (got "${base}").\n`);
  }
  // A production URL by accident is the expensive mistake. Say it out
  // loud rather than silently billing a real customer's account.
  if (!/staging|localhost|127\.0\.0\.1|preview|vercel\.app/i.test(base)) {
    console.log(
      `\n  ⚠  E2E_BASE_URL is "${base}" — that does not look like staging.\n` +
        `     These specs create files, agents and a published website on it, and spend\n` +
        `     credits from E2E_EMAIL's account. Set E2E_ALLOW_PRODUCTION=1 to proceed.\n`
    );
    if (process.env.E2E_ALLOW_PRODUCTION !== "1") {
      throw new Error("Refusing to run against a non-staging URL without E2E_ALLOW_PRODUCTION=1.");
    }
  }
  console.log(`\n  target: ${base}\n  account: ${process.env.E2E_EMAIL}\n`);
}
