#!/usr/bin/env node
/*
 * CAN THE BUDGET GATES GO RED?
 *
 * Two gates: token-budgets (a deliverable cannot ship severed) and
 * agent-budget (a run cannot spend without limit). Both pass. The
 * mutations below put back exactly the defects they were written for —
 * including the one that was really in the tree: thirty-three call sites
 * joining text blocks with nobody reading stop_reason.
 *
 * Run: node scripts/tests/token-budgets.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const TOKENS = "scripts/tests/token-budgets.test.mjs";
const AGENT = "scripts/tests/agent-budget.test.mjs";

const RESEARCH = "src/lib/research/research.ts";
const RUN_RESEARCH = "src/lib/research/run-research.ts";
const RUNNER = "src/lib/agents/agent-runner.ts";
const EXEC = "src/lib/agents/execute-agent.ts";
const FILE_ASK = "src/lib/jobs/handlers/file-ask.ts";
const TRUNC = "src/lib/verification/truncation.ts";
const BUDGET = "src/lib/agents/agent-budget.ts";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE DEFECT THAT WAS ACTUALLY IN THE TREE.
  // ------------------------------------------------------------------
  {
    // The literal "max_tokens" became the named TRUNCATION_STOP_REASON so
    // the file's two entry points could not disagree about it — and this
    // mutation, which still spelled the literal, quietly stopped applying.
    // "Target no longer exists" is not a failure, so the hole was only
    // visible in the summary at the end of the run.
    name: "the stop reason stops being read (33 sites shipped severed text this way)",
    suite: TOKENS, file: TRUNC,
    from: "return { text, truncated: stopReason === TRUNCATION_STOP_REASON, stopReason };",
    to: "return { text, truncated: false, stopReason };",
  },
  {
    // THE SECOND DOOR ONTO THE SAME RULE. modelTextFrom is what the
    // provider layer goes through, so severing it severs the agent runner
    // specifically while modelText keeps every gate that only exercises
    // Anthropic's content blocks green.
    name: "the provider path stops reading the stop reason, so only the agent runner ships severed text",
    suite: TOKENS, file: TRUNC,
    from: "    truncated: completion.stopReason === TRUNCATION_STOP_REASON,",
    to: "    truncated: false,",
  },
  {
    // AND THE CONSTANT ITSELF. One wrong string and BOTH doors stop
    // recognising truncation together — the exact failure the constant was
    // introduced to make impossible, which nothing was checking.
    name: "the constant names a stop reason no model ever returns",
    suite: TOKENS, file: TRUNC,
    from: 'export const TRUNCATION_STOP_REASON = "max_tokens";',
    to: 'export const TRUNCATION_STOP_REASON = "length";',
  },
  {
    name: "a research report goes back to a length check as its only validation",
    suite: TOKENS, file: RUN_RESEARCH,
    from: "  const reportMarkdown = synthesis.truncated",
    to: "  const reportMarkdown = false",
  },
  {
    name: "an agent's cut result is delivered unmarked",
    suite: TOKENS, file: EXEC,
    from: "    ? outcome.truncated",
    to: "    ? false",
  },
  {
    name: "file-ask stops flagging its three call paths",
    suite: TOKENS, file: FILE_ASK,
    from: "    if (extracted.truncated) hitTokenCeiling = true;",
    to: "",
  },
  {
    name: "a deliverable hand-rolls its extraction again",
    suite: TOKENS, file: RESEARCH,
    from: "    const synthesised = modelText(response);",
    to: '    const synthesised = { text: response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(""), truncated: false };',
  },
  {
    name: "the notice stops saying the output is unfinished",
    suite: TOKENS, file: TRUNC,
    from: 'en: "This output reached its length limit and stops here — it is not finished.",',
    to: 'en: "Output complete.",',
  },
  // ------------------------------------------------------------------
  // THE AGENT BUDGET.
  // ------------------------------------------------------------------
  {
    name: "the early stop is removed, so a run always pays for the write step",
    suite: AGENT, file: RUNNER,
    from: "  if (verdict.stop) {",
    to: "  if (false) {",
  },
  {
    name: "the budget is checked AFTER both calls, where it can save nothing",
    suite: AGENT, file: RUNNER,
    from: "  const budget = resolveAgentBudget();",
    to: "  const budget = { maxToolCalls: Infinity, maxCostEur: Infinity };\n  void resolveAgentBudget;",
  },
  {
    name: "a misconfigured env var disables the cap instead of falling back",
    suite: AGENT, file: BUDGET,
    from: "  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;",
    to: "  if (!Number.isFinite(parsed)) return 0;",
  },
  {
    name: "the cap is set below a legitimate worst-case run",
    suite: AGENT, file: BUDGET,
    from: "export const DEFAULT_AGENT_MAX_COST_EUR = 0.5;",
    to: "export const DEFAULT_AGENT_MAX_COST_EUR = 0.2;",
  },
  {
    name: "the cap is set so high it can only fire after the damage",
    suite: AGENT, file: BUDGET,
    from: "export const DEFAULT_AGENT_MAX_COST_EUR = 0.5;",
    to: "export const DEFAULT_AGENT_MAX_COST_EUR = 50;",
  },
  {
    name: "a stopped run reports failure instead of delivering what it has",
    suite: AGENT, file: RUNNER,
    from: "      ok: true,\n      output: `${budgetStopNotice(config.language)}",
    to: "      ok: false,\n      output: `${budgetStopNotice(config.language)}",
  },
  {
    name: "the tool-call limit silently does the cost limit's job too",
    suite: AGENT, file: BUDGET,
    from: '    return { stop: true, reason: "cost", spentEur: spent.costEur, toolCalls: spent.toolCalls };',
    to: '    return { stop: true, reason: "tool_calls", spentEur: spent.costEur, toolCalls: spent.toolCalls };',
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    missed.push({ ...m, why: "the mutation target no longer exists in the file" });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));
  let detail = null;
  try {
    execFileSync("node", [m.suite], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (detail) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 120)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}\n          the gate stayed green`);
  }
}

for (const suite of [TOKENS, AGENT]) {
  try {
    execFileSync("node", [suite], { stdio: "pipe" });
  } catch {
    console.log(`\nBASELINE IS RED in ${suite} — a mutation was not restored.`);
    process.exit(1);
  }
}
console.log("\nbaseline: both gates are green on the unmutated tree");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned a gate red.");
