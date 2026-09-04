#!/usr/bin/env node
/*
 * CAN agent-run-depth.test.mjs SEE A DEEP AGENT RUNNING AT STANDARD AGAIN?
 *
 * The defect was one piece of state read for the wrong agent. Each
 * mutation below re-introduces one way of getting that back: the helper
 * ignoring the id, the helper defaulting wrong, the workspace sending its
 * own state instead of the helper's answer, the picker showing something
 * other than what will run.
 *
 * Run: node scripts/tests/agent-run-depth.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/agent-run-depth.test.mjs";
const LIB = "src/lib/agents/run-depth.ts";
const WS = "src/components/agents/agents-workspace.tsx";
const TARGETS = [GATE, LIB, WS];

const MUTANTS = [
  {
    // 1. THE ID CHECK GOES. An override then applies to every agent —
    // the exact leak, one level down.
    name: "the override applies regardless of which agent it was made for",
    file: LIB,
    from: "if (override && override.agentId === agent.id) return override.depth;",
    to: "if (override) return override.depth;",
    expect: "THE BUG: an override made for another agent does not touch the deep one",
  },
  {
    // 2. THE DEFAULT. A row with no depth recorded ran standard before
    // this workstream and must still.
    name: "an agent with no recorded depth resolves to deep",
    file: LIB,
    from: "  return parseAgentDepth(agent.config?.depth);\n}",
    to: '  return parseAgentDepth(agent.config?.depth ?? "deep");\n}',
    expect: "an agent with no recorded depth runs standard",
  },
  {
    // 3. THE BODY. An override equal to the agent's own tier sent anyway
    // marks an ordinary run depthOverridden on its cost row.
    name: "the request body always carries a depth",
    file: LIB,
    from: "return depth === ownDepth(agent) ? {} : { depth };",
    to: "return { depth };",
    expect: "the request body carries NO override for an ordinary run",
  },
  {
    // 4. THE CARD MENU sends a bare value again instead of asking the
    // helper — the path the report came through.
    name: "the card menu runs at a hard-coded tier",
    file: WS,
    from: "onSelect: () => void runNow(agent, effectiveRunDepth(agent, runOverride)),",
    to: 'onSelect: () => void runNow(agent, "standard"),',
    expect: "the card menu's Run now resolves the tier through the helper",
  },
  {
    // 5. THE PICKER shows a value that is not what will run.
    name: "the detail panel's picker shows the override even for another agent",
    file: WS,
    from: "value={effectiveRunDepth(selected, runOverride)}",
    to: 'value={runOverride?.depth ?? "standard"}',
    expect: "the detail panel's picker shows the effective tier",
  },
  {
    // 6. THE STATE SHAPE goes back to something that can hold a value for
    // no agent in particular — which is a value for every agent.
    name: "the per-run state starts as an override for nobody",
    file: WS,
    from: "useState<RunDepthOverride>(null)",
    to: 'useState<RunDepthOverride>({ agentId: "", depth: "standard" })',
    expect: "the per-run state is keyed by agent",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("agent-run-depth mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause in agent-run-depth.test.mjs is load-bearing.");
