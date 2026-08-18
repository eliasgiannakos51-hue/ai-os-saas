// "Done — 0 credits." on an account that is never charged.
//
// The number was arithmetically true and said the opposite of what
// happened. settleReservation had computed what the run WOULD have cost
// since bypass billing existed — and wrote it to ai_cost_log.metadata,
// which answers the "was it even recorded" half: it was, on every bypass
// settlement. It just never came back out. SettlementResult did not carry
// it, so nothing downstream could show it, and two separate screens
// reported a bare zero instead.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. It checks the WIRING — that the
// number leaves settlement, reaches the job result in the shape the
// credits receipt reader already understands, is written to both
// agent_runs update paths, and has a string in all ten locales. It does
// NOT prove the rendered sentence; that needs a browser and lives in
// agent-credits.prodtest.mjs. Stated rather than implied, because a
// structural test that is described as an end-to-end one is worse than no
// test.
//
// Run: node scripts/tests/agent-run-credits.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`); }
};

const read = (p) => readFileSync(p, "utf8");

// ---------------------------------------------------------------------
// 1. The wire format is one the receipt reader already understands.
// ---------------------------------------------------------------------
// Not a new shape invented for agents: chat, Create, the Website Builder
// and Ask AI all report through readUsageReceipt, and the bypass branch in
// credits-context.tsx (unlimitedWouldHaveCost) has existed and been
// unreachable from agents the whole time.
const receipt = await loadTs("src/lib/billing/usage-receipt.ts");
const parsed = receipt.readUsageReceipt({
  usage: { creditsCharged: 0, bypass: true, wouldHaveCharged: 37 },
});
check("readUsageReceipt accepts the shape the agent_run handler emits",
  parsed !== null && parsed.bypass === true && parsed.wouldHaveCharged === 37,
  JSON.stringify(parsed));

// A charging account must NOT be reported as unlimited.
const charged = receipt.readUsageReceipt({ usage: { creditsCharged: 12 } });
check("a charging run reads back as charged, not as bypass",
  charged?.bypass === false && charged?.creditsCharged === 12 && charged?.wouldHaveCharged === null,
  JSON.stringify(charged));

// ---------------------------------------------------------------------
// 2. settleReservation returns it on EVERY path.
// ---------------------------------------------------------------------
// Two of its three returns are failure paths. A caller that reads the
// field would get undefined from either and render "unlimited" with no
// figure at the exact moment billing went wrong — so every return is
// counted, not just the happy one.
//
// COUNTED BY MATCHING BRACES, not by a regex over lines. The first version
// of this check counted the string `wouldHaveChargedCredits: wouldHaveCharged`
// anywhere in the function, found four, and asserted "all four returns" —
// but settleReservation has THREE returns. The fourth match was the
// cost-log metadata object, which contains the same two field names in the
// same order. The assertion was green and the sentence it printed was
// false; a real return could have been missed behind it.
const reservations = read("src/lib/billing/reservations.ts");
const settleBody = reservations.slice(reservations.indexOf("export async function settleReservation"));

function returnObjects(body) {
  const out = [];
  let idx = 0;
  while ((idx = body.indexOf("return {", idx)) !== -1) {
    let depth = 0;
    let j = idx + "return ".length;
    for (; j < body.length; j++) {
      if (body[j] === "{") depth++;
      else if (body[j] === "}") {
        depth--;
        if (depth === 0) { j++; break; }
      }
    }
    out.push(body.slice(idx, j));
    idx = j;
  }
  return out;
}

const settleReturns = returnObjects(settleBody);
check("settleReservation still has exactly three returns", settleReturns.length === 3,
  `found ${settleReturns.length} — if a path was added, it needs the two fields too`);
const returnsMissing = settleReturns.filter(
  (r) => !r.includes("bypassCharge") || !r.includes("wouldHaveChargedCredits")
);
check("every settleReservation return carries bypassCharge and wouldHaveChargedCredits",
  returnsMissing.length === 0,
  returnsMissing.map((r) => r.slice(0, 90)).join(" | "));
check("SettlementResult declares both fields",
  /bypassCharge: boolean;/.test(reservations) &&
  /wouldHaveChargedCredits: number \| null;/.test(reservations));
// Separately: the cost-log row keeps carrying it. That is what answers
// "was it recorded" for every bypass action, not only agent runs.
check("the cost-log row still records the would-have figure in its metadata",
  /p_metadata: \{[\s\S]*?wouldHaveChargedCredits: wouldHaveCharged,/.test(settleBody));

// ---------------------------------------------------------------------
// 3. execute-agent writes it on BOTH agent_runs updates.
// ---------------------------------------------------------------------
// There are two: the failure path and the success path. A run that failed
// still settled and still cost money, so a fix applied to only the
// success path would leave every failed run on an unlimited account
// reading "0 credits" forever.
const execAgent = read("src/lib/agents/execute-agent.ts");
const runWrites = (execAgent.match(/would_have_charged_credits: settlement\.wouldHaveChargedCredits,/g) ?? []).length;
const chargedWrites = (execAgent.match(/credits_charged: settlement\.creditsCharged,/g) ?? []).length;
check("every agent_runs write that records credits_charged also records the would-have figure",
  runWrites === chargedWrites && runWrites === 2,
  `would-have: ${runWrites}, credits_charged: ${chargedWrites}`);
check("ExecuteAgentResult carries bypassCharge and wouldHaveChargedCredits",
  /bypassCharge: boolean;/.test(execAgent) && /wouldHaveChargedCredits: number \| null;/.test(execAgent));

// ---------------------------------------------------------------------
// 4. The job handler puts a receipt on the result.
// ---------------------------------------------------------------------
const handler = read("src/lib/jobs/handlers/agent-run.ts");
check("the agent_run handler emits usage.bypass from the settlement",
  /bypass: result\.bypassCharge/.test(handler));
check("the agent_run handler emits usage.wouldHaveCharged from the settlement",
  /wouldHaveCharged: result\.wouldHaveChargedCredits/.test(handler));

// ---------------------------------------------------------------------
// 5. Both screens branch. This is the defect as reported.
// ---------------------------------------------------------------------
const workspace = read("src/components/agents/agents-workspace.tsx");
check("the run toast branches on usage.bypass instead of printing a bare 0",
  /result\.usage\?\.bypass/.test(workspace) && /runSuccessUnlimitedCost/.test(workspace));
check("the run history branches on would_have_charged_credits",
  /run\.would_have_charged_credits === null/.test(workspace) && /runCreditsUnlimited/.test(workspace));
// The balance in the nav is seeded once and held in React state, so a run
// that spent credits left the old number on screen until a full reload.
check("the agents workspace refreshes the credit balance after a run",
  /refreshCredits\(\)/.test(workspace));

// ---------------------------------------------------------------------
// 6. The column exists, is idempotent, and is nullable.
// ---------------------------------------------------------------------
const migration = read("supabase/migrations/20260817000002_agent_runs_would_have_charged.sql");
check("the migration adds the column idempotently",
  /add column if not exists would_have_charged_credits int;/.test(migration));
check("the migration never drops or truncates anything",
  !/drop\s+table|truncate|delete\s+from(?!\s+\S+\s+where)/i.test(migration));
check("the column is nullable — null means 'really charged', not 'free'",
  !/would_have_charged_credits int not null/.test(migration));
// The grants pass loops over pg_proc and can only cover what already
// exists, so it has to stay the last file in the directory.
check("this migration sorts BEFORE the function-grants pass",
  "20260817000002_agent_runs_would_have_charged.sql" < "20260818000000_function_grants.sql");

// ---------------------------------------------------------------------
// 7. Ten locales, with the placeholder intact.
// ---------------------------------------------------------------------
// A missing placeholder is the failure that survives every check we have:
// next-intl renders the sentence without the number and nothing errors,
// so "would have cost" is followed by nothing at all.
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const missing = [];
const noPlaceholder = [];
for (const locale of LOCALES) {
  const m = JSON.parse(read(`messages/${locale}.json`)).dashboard?.agents ?? {};
  for (const key of ["runSuccessUnlimitedCost", "runSuccessUnlimited", "runCreditsUnlimited"]) {
    if (typeof m[key] !== "string" || m[key].trim() === "") missing.push(`${locale}.${key}`);
  }
  for (const key of ["runSuccessUnlimitedCost", "runCreditsUnlimited"]) {
    if (typeof m[key] === "string" && !m[key].includes("{credits}")) noPlaceholder.push(`${locale}.${key}`);
  }
}
check("all three strings exist in all ten locales", missing.length === 0, missing.join(", "));
check("every string that quotes a figure keeps its {credits} placeholder",
  noPlaceholder.length === 0, noPlaceholder.join(", "));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED: " + failures.join(" | "));
  process.exit(1);
}
