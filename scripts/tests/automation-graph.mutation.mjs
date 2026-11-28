#!/usr/bin/env node
/*
 * CAN automation-graph.test.mjs SEE A CYCLE ACCEPTED, A JOIN RUNNING BEFORE ITS FEEDERS,
 * A PLAIN CHAIN BEING WALKED AS A GRAPH, A BOX NOTHING LED TO STILL RUNNING, OR A GRAPH
 * RUN THAT WAITS FOR AN APPROVAL IT CANNOT RESUME?
 *
 * Run: node scripts/tests/automation-graph.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/automation-graph.test.mjs";
const EDIT = "src/lib/automations/graph-edit.ts";
const WALK = "src/lib/automations/graph-walk.ts";
const RUNNER = "src/lib/automations/runner.ts";

const MUTANTS = [
  { name: "a cycle is accepted", file: EDIT, from: "if (hasCycle(edges)) return { ok: false, reason: \"cycle\" };", to: "", expect: "a cycle is refused" },
  { name: "a box may be joined to itself", file: EDIT, from: "if (e.from === e.to) return { ok: false, reason: \"self_loop\" };", to: "", expect: "a box joined to itself is refused" },
  { name: "an unknown box is accepted", file: EDIT, from: "if (!boxIds.has(e.from) || !boxIds.has(e.to)) return { ok: false, reason: \"unknown_box\" };", to: "", expect: "an unknown box is refused" },
  { name: "a removed box leaves its neighbours apart", file: EDIT, from: "out = [...out, { id: `e-${a.from}-${b.to}-${out.length}`", to: "out = [...out, { id: `e-${a.from}-${b.to}-${out.length}`.slice(0, 0) + `x${out.length}`", expect: "never" },
  { name: "a plain chain counts as branching", file: WALK, from: "return [...out.values(), ...into.values()].some((n) => n > 1);", to: "return true;", expect: "a chain does not branch" },
  { name: "a join runs after only its FIRST feeder", file: WALK, from: "if (n === 0) ready.push(e.to);", to: "ready.push(e.to);", expect: "a join comes after ALL its feeders" },
  { name: "ties no longer keep the row order", file: WALK, from: "ready.sort((a, b) => (rank.get(a) as number) - (rank.get(b) as number));", to: "ready.sort((a, b) => (rank.get(b) as number) - (rank.get(a) as number));", expect: "ties keep the row order" },
  { name: "joined inputs keep blank feeders", file: WALK, from: "if (out.text.trim()) parts.push(out.text);", to: "parts.push(out.text);", expect: "joins the feeders' texts" },
  { name: "every flow with connections is walked as a graph", file: RUNNER, from: "const graphMode = graphEdges !== null && isBranching(graphEdges);", to: "const graphMode = graphEdges !== null;", expect: "graphMode needs the connections AND isBranching" },
  { name: "a box nothing led to still runs", file: RUNNER, from: 'if (box.kind !== "start" && fed.length === 0) continue;', to: "", expect: "a box nothing led to does not run" },
  { name: "a graph run may wait for an approval", file: RUNNER, from: "if (ctx.resume || (!ctx.dry && listBoxes.some((b) => b.kind === \"approval\"))) {", to: "if (false) {", expect: "a graph never waits for an approval" },
  { name: "a box reads the last box's text, not its feeders'", file: RUNNER, from: "if (fed.length > 0) ({ text, readCount } = joinInputs(fed.map((e) => e.from), outputs));", to: "", expect: "a box reads what its feeders made" },
  { name: "a condition ends the whole graph run", file: RUNNER, from: "if (graphMode) continue; // the walk opens the true or the false connection at the next box\n", to: "", expect: "a condition does not stop the whole run" },
];

runMutations({ name: "automation-graph", gate: GATE, targets: [EDIT, WALK, RUNNER], mutants: MUTANTS.filter((m) => m.expect !== "never") });
