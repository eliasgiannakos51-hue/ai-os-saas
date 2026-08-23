// WHAT ONE AGENT RUN MAY SPEND, AND WHAT HAPPENS WHEN IT WOULD SPEND MORE.
//
// WHAT THE RUNNER ACTUALLY IS, measured before anything was built on top
// of it: a fixed two-call pipeline — research, then write — with no step
// loop. The brief asks for AGENT_MAX_STEPS; there is nothing for it to
// limit, and a knob that reads as a safeguard while guarding nothing is
// worse than no knob. It is deliberately absent, and this file says so
// rather than leaving the omission to be read as an oversight.
//
// WHAT COULD RUN AWAY, and now cannot:
//   · cost   — nothing capped it. The reservation is a HOLD, not a stop:
//              it decides what CAN be charged, not when to quit.
//   · tools  — max_uses is a REQUEST to Anthropic; this checks the answer.
//
// Run: node scripts/tests/agent-budget.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const b = await loadTs("src/lib/agents/agent-budget.ts");
const est = await loadTs("src/lib/billing/estimate.ts");
const pricing = await loadTs("src/lib/billing/pricing-config.ts");
const limits = await loadTs("src/lib/agents/agent-limits.ts");

// =====================================================================
console.log("== 1. the default cap is above a legitimate worst case ==");
// A CAP BELOW A REAL RUN STOPS REAL RUNS. This is the number that decides
// whether the limit is a safety net or a bug, so it is derived here from
// the same estimator the reservation uses rather than trusted as written.
{
  const cfg = pricing.resolvePricingConfig();
  const worstUsd = est.estimateForAction(
    "agentRun",
    { model: "claude-sonnet-4-6", inputChars: 8000, expectedWebSearches: 4, planSlug: "ultimate" },
    cfg,
    0.008
  ).estimatedUsd;
  const worstEur = worstUsd * cfg.usdToEurRate;
  const withRetries = worstEur * limits.AGENT_MAX_ATTEMPTS;
  console.log(`        worst single run €${worstEur.toFixed(4)} x ${limits.AGENT_MAX_ATTEMPTS} attempts = €${withRetries.toFixed(4)}`);
  console.log(`        cap €${b.DEFAULT_AGENT_MAX_COST_EUR}`);
  ok("the cap clears a worst-case run that retries to the limit",
    b.DEFAULT_AGENT_MAX_COST_EUR > withRetries, `${b.DEFAULT_AGENT_MAX_COST_EUR} vs ${withRetries.toFixed(4)}`);
  // AND IS NOT SO HIGH IT STOPS NOTHING. A cap at ten times the worst
  // case is a number that can only fire after the damage.
  ok("...without being so far above it that it never fires",
    b.DEFAULT_AGENT_MAX_COST_EUR < withRetries * 2, `${b.DEFAULT_AGENT_MAX_COST_EUR} vs ${(withRetries * 2).toFixed(4)}`);
}

// =====================================================================
console.log("\n== 2. every limit is optional and falls back safely ==");
{
  const d = b.resolveAgentBudget({});
  ok("with no env set, the defaults apply",
    d.maxToolCalls === b.DEFAULT_AGENT_MAX_TOOL_CALLS && d.maxCostEur === b.DEFAULT_AGENT_MAX_COST_EUR, JSON.stringify(d));
  ok("an override is honoured", b.resolveAgentBudget({ AGENT_MAX_COST_EUR: "0.25" }).maxCostEur === 0.25);
  ok("...and so is the tool-call one", b.resolveAgentBudget({ AGENT_MAX_TOOL_CALLS: "2" }).maxToolCalls === 2);
  // A MISCONFIGURED VARIABLE MUST NOT DISABLE THE LIMIT. Number("") is 0
  // and Number("abc") is NaN; taken literally the first means "spend
  // nothing" and the second compares false against everything, so every
  // run would either stop instantly or never stop.
  for (const [label, value] of [["empty", ""], ["blank", "   "], ["not a number", "abc"], ["zero", "0"], ["negative", "-1"]]) {
    const r = b.resolveAgentBudget({ AGENT_MAX_COST_EUR: value });
    ok(`${label} falls back to the default rather than disabling the cap`, r.maxCostEur === b.DEFAULT_AGENT_MAX_COST_EUR, JSON.stringify(r));
  }
}

// =====================================================================
console.log("\n== 3. CROSS-PRODUCT: every stop reason x every state ==");
// Not a sample. Each reason has to fire on its own trigger and stay quiet
// on the other's, or one limit is silently doing both jobs.
{
  const budget = { maxToolCalls: 4, maxCostEur: 0.5 };
  const CASES = [
    ["under both", { costEur: 0.1, toolCalls: 2 }, false, null],
    ["cost exactly at the cap", { costEur: 0.5, toolCalls: 2 }, true, "cost"],
    ["cost over", { costEur: 0.9, toolCalls: 2 }, true, "cost"],
    ["tools at the cap", { costEur: 0.1, toolCalls: 4 }, false, null],
    ["tools over", { costEur: 0.1, toolCalls: 5 }, true, "tool_calls"],
    ["both over — cost is reported first", { costEur: 0.9, toolCalls: 9 }, true, "cost"],
    ["nothing spent", { costEur: 0, toolCalls: 0 }, false, null],
  ];
  for (const [name, spent, shouldStop, reason] of CASES) {
    const v = b.budgetStop(spent, budget);
    ok(`${name}: stop=${shouldStop}`, v.stop === shouldStop, JSON.stringify(v));
    if (shouldStop) ok(`${name}: reason is ${reason}`, v.reason === reason, JSON.stringify(v));
  }
  // AT the cap stops, one under does not — the boundary either way.
  ok("one cent under the cap does not stop", b.budgetStop({ costEur: 0.49, toolCalls: 0 }, budget).stop === false);
}

// =====================================================================
console.log("\n== 4. stopping is not failing ==");
{
  const runner = readFileSync("src/lib/agents/agent-runner.ts", "utf8");
  // AGAINST THE WRITE CALL AS IT ACTUALLY IS, and there must be exactly
  // one of it.
  //
  // This used to compare positions against the literal
  // `max_tokens: MAX_OUTPUT_TOKENS`. The multi-provider work replaced the
  // direct Anthropic call with runCompletion(), so that string vanished,
  // indexOf returned -1, and the comparison became `something < -1` —
  // permanently false. The gate went red while the property it guards was
  // untouched, which is the worst way for an instrument to fail: it looks
  // like the code broke. Naming the real call fixes that AND adds a claim
  // the old form could not make — that there is only ONE write, so a
  // second one cannot be added below the budget check where nothing
  // would notice.
  const writeCalls = (runner.match(/runCompletion\(/g) ?? []).length;
  ok(`there is exactly one write call in the runner (${writeCalls})`, writeCalls === 1);
  ok(
    "the budget is checked BEFORE it, not after both calls",
    runner.indexOf("budgetStop(") > 0 && runner.indexOf("budgetStop(") < runner.indexOf("runCompletion(")
  );
  // The research call is the CHEAP half and comes first by design; the
  // ordering above is only meaningful if the research call is genuinely
  // before the budget check.
  ok(
    "...and after the research pass, so it can see what that cost",
    runner.indexOf("const result = await research(") < runner.indexOf("budgetStop(")
  );
  // AND THE LIMITS COME FROM THE RESOLVER. Handing budgetStop a literal
  // {maxCostEur: Infinity} keeps the call, the ordering and this gate
  // intact while the limit can never be reached.
  ok("...against limits resolved from the environment, not a literal",
    /const budget = resolveAgentBudget\(\);/.test(runner));
  ok("...and no Infinity was substituted for a limit", !/maxCostEur: Infinity|maxToolCalls: Infinity/.test(runner));
  ok("a stopped run returns ok:true, not a failure",
    /if \(verdict\.stop\) \{[\s\S]{0,200}ok: true/.test(runner));
  ok("...and returns the findings it already paid for",
    /budgetStopNotice\(config\.language\)[\s\S]{0,40}\$\{findings\}/.test(runner));
  ok("...tagged with which limit fired", /stoppedAtBudget: verdict\.reason/.test(runner));
  // THE SETTLEMENT. ok:true means execute-agent takes its ordinary path:
  // settleReservation charges the tokens actually spent and releases the
  // rest of the hold. That is the "not half, not double" requirement, and
  // it holds by taking the SAME path a finished run takes rather than a
  // second one written for this case.
  const exec = readFileSync("src/lib/agents/execute-agent.ts", "utf8");
  ok("there is exactly one settleReservation call for a successful run",
    (exec.match(/await settleReservation\(/g) ?? []).length === 1, String((exec.match(/await settleReservation\(/g) ?? []).length));
  ok("and no budget-specific settlement path was added beside it",
    !/stoppedAtBudget[\s\S]{0,200}settleReservation/.test(exec));
}

// =====================================================================
console.log("\n== 5. the notice, in every locale ==");
{
  for (const loc of ["en", "el", "de", "es", "fr", "it", "pt", "ar", "ja", "zh"]) {
    const n = b.budgetStopNotice(loc);
    ok(`${loc}: has its own notice`, typeof n === "string" && n.length > 10 && (loc === "en" || n !== b.budgetStopNotice("en")), n);
  }
  ok("an unknown locale falls back", b.budgetStopNotice("xx") === b.budgetStopNotice("en"));
  // IT MUST NOT SAY THE AGENT FAILED. It did work and the work is
  // delivered; "failed" would be false and would train the user to
  // distrust a working feature.
  ok("the English notice does not call it a failure", !/fail/i.test(b.budgetStopNotice("en")), b.budgetStopNotice("en"));
}

// =====================================================================
console.log("\n== 6. no max-steps knob was invented ==");
{
  const runner = readFileSync("src/lib/agents/agent-runner.ts", "utf8");
  const budgetSrc = readFileSync("src/lib/agents/agent-budget.ts", "utf8");
  // EVERY LOOP IS BOUNDED BY A DECLARED SPEC FIELD.
  //
  // This used to assert the runner contained no `for (` or `while (` at
  // all. That was a proxy for "there is no agentic step loop", and the
  // proxy stopped holding the moment agent depth tiers added a research
  // loop bounded by spec.researchRounds — a fixed per-tier number, which
  // is exactly the kind of loop AGENT_MAX_STEPS was never needed for. The
  // claim is now the real one: no unbounded loop, and no `while` at all.
  const code = runner.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const loops = [...code.matchAll(/(for|while)\s*\(([^)]*)\)/g)].map((m) => ({ kind: m[1], head: m[2] }));
  ok(`every loop is a bounded for-loop (${loops.length} loop${loops.length === 1 ? "" : "s"})`,
    loops.every((l) => l.kind === "for" && /<\s*spec\.[A-Za-z]+|<\s*[A-Z_]{3,}/.test(l.head)),
    loops.map((l) => `${l.kind}(${l.head})`).join(" ; ")
  );
  ok("there is no while-loop at all", !loops.some((l) => l.kind === "while"), loops.map((l) => l.kind).join(","));
  ok("and no `for (;;)` / `while (true)`", !/for\s*\(\s*;\s*;|while\s*\(\s*true\s*\)/.test(code));
  // COMMENTS STRIPPED FIRST. The paragraph in agent-budget.ts that
  // explains why AGENT_MAX_STEPS is absent contains the words
  // "AGENT_MAX_STEPS", so a raw scan read the explanation of an absence
  // as the thing being present. The documentation is checked separately,
  // on the source WITH its comments, because that is where it lives.
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok("so AGENT_MAX_STEPS exists in no code, only in prose",
    !/AGENT_MAX_STEPS/.test(stripComments(budgetSrc) + stripComments(runner)));
  ok("and the reason is written down, not left as an omission", /max-steps|AGENT_MAX_STEPS|step loop/.test(budgetSrc));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
