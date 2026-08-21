#!/usr/bin/env node
/*
 * CAN THE CEILING GATE GO RED?
 *
 * combined-ceiling.test.mjs is the thing standing between a free path and
 * a margin nobody notices leaking. It passes. That means nothing until the
 * defects it exists for are put back and it is required to see them.
 *
 * The mutations here are not synthetic damage. Each is a change somebody
 * could plausibly make:
 *
 *   · the ONE that matters most — deleting the agent-disable that makes
 *     `cannotComplete` a bounded cost rather than an unbounded giveaway.
 *     Every argument for accepting that bypass rests on it, so it has to
 *     be the mutation that fires loudest.
 *   · a new zero-charge path arriving unregistered, which is the shape
 *     this gate was written for.
 *   · a declared allowance share growing past what the ceiling can hold.
 *
 * Run: node scripts/tests/combined-ceiling.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/combined-ceiling.test.mjs";
const AGENT = "src/lib/agents/execute-agent.ts";
const CEILING = "src/lib/billing/ceiling.ts";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE LOAD-BEARING ONE. Without the disable, one agent can refuse every
  // scheduled morning forever: free every time, and every time it costs
  // us the tokens it burned before refusing.
  // ------------------------------------------------------------------
  {
    name: "a refusal stops disabling the agent (the bypass becomes unbounded)",
    file: AGENT,
    from: "const shouldDisable = cannotComplete || consecutiveFailures >= AGENT_MAX_CONSECUTIVE_FAILURES;",
    to: "const shouldDisable = consecutiveFailures >= AGENT_MAX_CONSECUTIVE_FAILURES;",
  },
  {
    name: "a disabled agent keeps its schedule (it runs again tomorrow, free again)",
    file: AGENT,
    from: "next_run_at: shouldDisable ? null : nextRun?.toISOString() ?? null,",
    to: "next_run_at: nextRun?.toISOString() ?? null,",
  },
  {
    name: "the status write is dropped, so 'disabled' never lands",
    file: AGENT,
    from: '...(shouldDisable ? { status: "disabled" as const } : {}),',
    to: "",
  },
  // ------------------------------------------------------------------
  // THE SHAPE THE GATE WAS WRITTEN FOR.
  // ------------------------------------------------------------------
  {
    name: "a new zero-charge path arrives with a name nobody registered",
    file: AGENT,
    from: "bypassCharge: bypassCredits || !plan || cannotComplete,",
    to: "bypassCharge: bypassCredits || !plan || cannotComplete || featureIsFreeThisWeek,",
  },
  {
    name: "a declared allowance share grows past what the ceiling holds",
    file: CEILING,
    from: "  free_chat: 0.05,",
    to: "  free_chat: 0.15,",
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
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (detail) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}\n          the gate stayed green`);
  }
}

// A restore that silently failed would leave the tree mutated and every
// later run meaningless.
try {
  execFileSync("node", [GATE], { stdio: "pipe" });
  console.log("\nbaseline: the gate is green on the unmutated tree");
} catch {
  console.log("\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
  process.exit(1);
}

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES — these can ship without the gate noticing:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
