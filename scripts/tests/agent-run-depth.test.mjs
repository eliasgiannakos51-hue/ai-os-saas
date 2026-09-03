// A DEEP AGENT RUNS DEEP WHEN YOU PRESS RUN.
//
// Reported: "I created an agent, chose the most expensive tier, pressed
// Run. It ran the middle one." The tier WAS saved — config.depth was
// "deep" in the row — and the run was charged at the tier it ran, which
// was standard. What was wrong sat between the two: the workspace kept
// the per-run tier as one `useState("standard")` and only reset it when
// the Edit button was pressed, so "Run now" from a card menu sent the
// initial value as a deliberate one-off override.
//
// The fix is lib/agents/run-depth.ts: an override is stored WITH the id
// of the agent it was made for, so it cannot apply to any other, and
// there is nothing to reset. This file executes that logic on the exact
// shapes the workspace passes, then reads the workspace to make sure it
// is the thing being called — a correct helper nobody calls is the shape
// this repository has already paid for once.
//
// Run: node scripts/tests/agent-run-depth.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}

const { effectiveRunDepth, runRequestBody, ownDepth } = await loadTs("src/lib/agents/run-depth.ts");

const deep = { id: "a-deep", config: { depth: "deep" } };
const simple = { id: "a-simple", config: { depth: "simple" } };
const legacy = { id: "a-legacy", config: {} };
const nullConfig = { id: "a-null", config: null };

console.log("== 1. with no override, the agent's own tier is what runs ==");
check("a deep agent runs deep", effectiveRunDepth(deep, null) === "deep", effectiveRunDepth(deep, null));
check("a simple agent runs simple", effectiveRunDepth(simple, null) === "simple");
check("an agent with no recorded depth runs standard", effectiveRunDepth(legacy, null) === "standard");
check("...and so does one with a null config", effectiveRunDepth(nullConfig, null) === "standard");
check("the request body carries NO override for an ordinary run", JSON.stringify(runRequestBody(deep, null)) === "{}",
  JSON.stringify(runRequestBody(deep, null)));

console.log("\n== 2. an override applies to the agent it was made for, and no other ==");
const forSimple = { agentId: "a-simple", depth: "deep" };
check("the override lifts the simple agent to deep", effectiveRunDepth(simple, forSimple) === "deep");
check("...and is sent as the override", JSON.stringify(runRequestBody(simple, forSimple)) === '{"depth":"deep"}',
  JSON.stringify(runRequestBody(simple, forSimple)));
// THE REPORTED SHAPE: a value left over from another agent that is LOWER
// than this one's own tier. (An override equal to the deep agent's own
// tier would hide an id check that had stopped working.)
const forOther = { agentId: "a-simple", depth: "standard" };
check("THE BUG: an override made for another agent does not touch the deep one",
  effectiveRunDepth(deep, forOther) === "deep",
  `got ${effectiveRunDepth(deep, forOther)} — this is a Deep agent running at somebody else's tier`);
check("...and sends no override for it", JSON.stringify(runRequestBody(deep, forOther)) === "{}");
const stale = { agentId: "a-simple", depth: "standard" };
check("an override equal to nothing this agent has still does not leak", effectiveRunDepth(deep, stale) === "deep");

console.log("\n== 3. an override equal to the agent's own tier is not an override ==");
const same = { agentId: "a-deep", depth: "deep" };
check("the tier is the agent's own", effectiveRunDepth(deep, same) === "deep");
check("...and the body is empty, so the cost row is not marked depthOverridden",
  JSON.stringify(runRequestBody(deep, same)) === "{}");

console.log("\n== 4. the extremes ==");
for (const [label, value] of [["undefined", undefined], ["NaN", NaN], ["0", 0], ["-1", -1], ["Infinity", Infinity], ["a string", "exhaustive"]]) {
  check(`a depth of ${label} in the row resolves to standard`, ownDepth({ id: "x", config: { depth: value } }) === "standard");
}
check("an override with an unknown agent id is ignored", effectiveRunDepth(deep, { agentId: "", depth: "simple" }) === "deep");

console.log("\n== 5. the workspace calls this, and only this ==");
const ws = stripComments(readFileSync("src/components/agents/agents-workspace.tsx", "utf8"));
check("the workspace imports the helper", /from "@\/lib\/agents\/run-depth"/.test(ws));
check("the per-run state is keyed by agent (RunDepthOverride), not a bare depth",
  /useState<RunDepthOverride>\(null\)/.test(ws),
  "a bare useState<AgentDepth>(\"standard\") is the state that ran a Deep agent at Standard");
check("...and no bare runDepth state remains", !/useState<AgentDepth>\("standard"\)[^\n]*\n[^\n]*runDepth|const \[runDepth, setRunDepth\]/.test(ws));
check("the card menu's Run now resolves the tier through the helper",
  /runNow\(agent, effectiveRunDepth\(agent, runOverride\)\)/.test(ws),
  "the card menu is the path the report came through");
check("the request body is built by the helper, not by hand",
  /body: JSON\.stringify\(runRequestBody\(agent, /.test(ws));
check("the detail panel's picker shows the effective tier",
  /value=\{effectiveRunDepth\(selected, runOverride\)\}/.test(ws));
check("...and a change is recorded against THAT agent's id",
  /setRunOverride\(\{ agentId: selected\.id, depth \}\)/.test(ws));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
