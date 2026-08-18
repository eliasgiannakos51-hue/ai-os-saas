// The sentence an unlimited account is shown after an agent run.
//
// agent-run-credits.test.mjs proves the WIRING — the number leaves
// settlement, reaches the job result, is written to both agent_runs
// paths, exists in ten locales. It cannot prove the rendered sentence,
// and a wire that carries a number to a component which then ignores it
// is exactly the failure being fixed. So this renders the page.
//
// The run HISTORY is the half a test can drive without an Anthropic call:
// it is read straight from agent_runs, which the stand-in supplies. The
// toast after a live "Run now" is not reachable without a real model
// call and is NOT claimed here — see the note at the end of the run.
//
// Run: node scripts/tests/agent-credits.prodtest.mjs
import { startProdHarness } from "../lib/prod-harness.mjs";
import { chromium } from "playwright";

const AGENT_ID = "00000000-0000-4000-9000-000000000010";
const USER_ID = "00000000-0000-4000-8000-000000000001";

// Two runs on the same agent, and the pair is the point: one bypassed and
// one charged, so a component that hardcodes either sentence fails.
const RUNS = [
  {
    id: "00000000-0000-4000-9000-000000000101",
    agent_id: AGENT_ID,
    user_id: USER_ID,
    started_at: "2026-08-18T06:00:00Z",
    finished_at: "2026-08-18T06:00:41Z",
    status: "success",
    output: "Bypassed run output.",
    error: null,
    credits_charged: 0,
    would_have_charged_credits: 37,
    tokens_used: 4210,
    trigger_source: "manual",
    attempts: 1,
  },
  {
    id: "00000000-0000-4000-9000-000000000102",
    agent_id: AGENT_ID,
    user_id: USER_ID,
    started_at: "2026-08-17T06:00:00Z",
    finished_at: "2026-08-17T06:00:39Z",
    status: "success",
    output: "Charged run output.",
    error: null,
    credits_charged: 12,
    would_have_charged_credits: null,
    tokens_used: 3900,
    trigger_source: "schedule",
    attempts: 1,
  },
];

const AGENTS = [
  {
    id: AGENT_ID,
    user_id: USER_ID,
    name: "Morning market brief",
    description: "A daily brief.",
    prompt: "Summarise the market.",
    schedule_cron: "0 7 * * *",
    timezone: "Europe/Athens",
    delivery_method: "email",
    delivery_target: "owner@example.com",
    status: "active",
    config: {},
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    last_run_at: "2026-08-18T06:00:41Z",
    next_run_at: "2026-08-19T04:00:00Z",
    consecutive_failures: 0,
    processing_started_at: null,
  },
];

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`); }
};

const harness = await startProdHarness({
  tableRows: { user_agents: AGENTS, agent_runs: RUNS },
  // Ultimate, because the agents workspace renders an upgrade wall on a
  // plan whose agent cap is zero — and a page showing a paywall would
  // pass every "no bare zero on screen" assertion by showing nothing.
  userMetadata: { subscription_tier: "ultimate" },
  supaPort: 54397,
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

try {
  const ctx = await harness.signedIn(browser, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${harness.origin}/dashboard/agents`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  // The run history lives inside the agent's detail view.
  await page.evaluate((name) => {
    const el = Array.from(document.querySelectorAll("button, a, [role='button']")).find((b) =>
      (b.textContent ?? "").includes(name)
    );
    el?.click();
  }, AGENTS[0].name);
  await page.waitForTimeout(1500);

  const text = await page.evaluate(() => document.body.innerText);

  check("the agents workspace rendered (not the upgrade wall)",
    text.includes(AGENTS[0].name), text.slice(0, 300));

  // THE DEFECT AS REPORTED: a bypassed run must not be described by its
  // credits_charged, which is zero and means "free for you", not "nothing
  // happened".
  check("the bypassed run quotes what it WOULD have cost",
    /37/.test(text) && /unlimited/i.test(text),
    text.split("\n").filter((l) => /credit|unlimited|37|12/i.test(l)).join(" | ").slice(0, 400));

  // ...and the charged run is still reported as charged. A fix that said
  // "unlimited" on every row would pass the check above.
  check("the charged run still reports its real charge",
    /12 credits/i.test(text),
    text.split("\n").filter((l) => /credit/i.test(l)).join(" | ").slice(0, 400));

  // The exact thing the user saw. Not "no zero anywhere" — a zero can
  // legitimately appear elsewhere on the page — but the zero-credits
  // phrasing against a run.
  check("no run is described as costing 0 credits",
    !/\b0 credits\b/i.test(text),
    text.split("\n").filter((l) => /0 credits/i.test(l)).join(" | "));

  await ctx.close();
} finally {
  await browser.close();
  harness.cleanup();
}

console.log(`\n${pass} passed, ${failures.length} failed`);
console.log(
  "NOT COVERED HERE: the toast shown immediately after a live 'Run now'. " +
    "It reads the same two fields off the job result, but reaching it needs a real " +
    "Anthropic call, which no harness in this repo makes. Its wiring is asserted in " +
    "agent-run-credits.test.mjs."
);
if (failures.length) console.log("FAILED: " + failures.join(" | "));
process.exit(failures.length === 0 ? 0 : 1);
