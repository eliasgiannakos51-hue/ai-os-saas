// Run: node scripts/tests/automation-graph.test.mjs
// How a flow with branches is checked, kept and walked: lib/automations/graph-edit.ts
// (what an edit may say, what happens to connections when boxes change) and
// lib/automations/graph-walk.ts (the order a run takes, what each box reads),
// and the runner's use of them only for a flow that really branches.
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0, fail = 0;
function check(name, ok, detail = "") { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`); } }

const edit = await loadTs("src/lib/automations/graph-edit.ts");
const walk = await loadTs("src/lib/automations/graph-walk.ts");
const E = (from, to, fromPort = "main", toPort = "main") => ({ id: `${from}>${to}:${fromPort}`, from, fromPort, to, toPort });
const ids = new Set(["s", "a", "b", "c", "m", "z"]);

console.log("\n== 1. validateEdges ==");
check("a branching graph is accepted", edit.validateEdges([E("s", "a"), E("s", "b"), E("a", "m"), E("b", "m")], ids).ok === true);
check("a port left out is main", edit.validateEdges([{ id: "1", from: "s", to: "a" }], ids).edges?.[0].fromPort === "main");
check("an unknown box is refused", edit.validateEdges([E("s", "ghost")], ids).reason === "unknown_box");
check("a box joined to itself is refused", edit.validateEdges([E("a", "a")], ids).reason === "self_loop");
check("a cycle is refused", edit.validateEdges([E("a", "b"), E("b", "c"), E("c", "a")], ids).reason === "cycle");
check("the same connection twice is refused", edit.validateEdges([E("a", "b"), { ...E("a", "b"), id: "other" }], ids).reason === "duplicate_edge");
check("the same id twice is refused", edit.validateEdges([E("a", "b"), { ...E("a", "c"), id: E("a", "b").id }], ids).reason === "duplicate_id");
check("not a list is refused", edit.validateEdges({}, ids).reason === "not_a_list");
check("more than MAX_EDGES is refused", edit.validateEdges(Array.from({ length: edit.MAX_EDGES + 1 }, (_, i) => ({ id: `e${i}`, from: "a", to: "b" })), ids).reason === "too_many");

console.log("\n== 2. validateLayout ==");
check("positions are kept, rounded", JSON.stringify(edit.validateLayout({ a: { x: 1.4, y: 2.6 } }, ids).layout) === '{"a":{"x":1,"y":3}}');
check("a box that is gone leaves no position", Object.keys(edit.validateLayout({ a: { x: 1, y: 1 }, ghost: { x: 1, y: 1 } }, ids).layout).join() === "a");
check("NaN is refused", edit.validateLayout({ a: { x: NaN, y: 1 } }, ids).ok === false);
check("a coordinate out of range is refused", edit.validateLayout({ a: { x: 1e9, y: 1 } }, ids).reason === "out_of_range");

console.log("\n== 3. reconcileEdges (the boxes changed under the connections) ==");
const chain = [E("s", "a"), E("a", "b"), E("b", "z")];
const del = edit.reconcileEdges(["s", "a", "b", "z"], ["s", "b", "z"], chain);
check("a removed box joins its neighbours", del.some((e) => e.from === "s" && e.to === "b") && !del.some((e) => e.from === "a" || e.to === "a"));
const fan = edit.reconcileEdges(["s", "a", "b", "m"], ["s", "m"], [E("s", "a"), E("s", "b"), E("a", "m"), E("b", "m")]);
check("every feeder is joined to every target", fan.length === 1 && fan[0].from === "s" && fan[0].to === "m");
const add = edit.reconcileEdges(["s", "a"], ["s", "a", "c"], [E("s", "a")]);
check("a new box is hung after the box before it", add.some((e) => e.from === "a" && e.to === "c"));
check("an unchanged list leaves the connections alone", edit.reconcileEdges(["s", "a"], ["s", "a"], [E("s", "a")]).length === 1);
check("no connection is left pointing at a missing box", edit.reconcileEdges(["s", "a", "b"], ["s", "b"], [E("s", "a"), E("a", "b")]).every((e) => ["s", "b"].includes(e.from) && ["s", "b"].includes(e.to)));

console.log("\n== 4. isBranching ==");
check("a chain does not branch", walk.isBranching([E("s", "a"), E("a", "b")]) === false);
check("one box feeding two branches", walk.isBranching([E("s", "a"), E("s", "b")]) === true);
check("two boxes feeding one joins", walk.isBranching([E("a", "m"), E("b", "m")]) === true);
check("no connections do not branch", walk.isBranching([]) === false);

console.log("\n== 5. walkOrder ==");
const order = walk.walkOrder(["s", "a", "b", "c", "m", "z"], [E("s", "a"), E("s", "b"), E("s", "c"), E("a", "m"), E("b", "m"), E("c", "m"), E("m", "z")]);
check("every box follows the ones that feed it", order?.join() === "s,a,b,c,m,z");
check("a join comes after ALL its feeders, not after the first", walk.walkOrder(["s", "m", "a", "b"], [E("s", "a"), E("s", "b"), E("a", "m"), E("b", "m")])?.join() === "s,a,b,m");
check("ties keep the row order", walk.walkOrder(["s", "b", "a"], [E("s", "a"), E("s", "b")])?.join() === "s,b,a");
check("a cycle gives null", walk.walkOrder(["a", "b"], [E("a", "b"), E("b", "a")]) === null);
check("a box nothing touches still has a place", walk.walkOrder(["s", "x"], []).join() === "s,x");

console.log("\n== 6. joinInputs ==");
const outs = new Map([["a", { text: "A", readCount: 2 }], ["b", { text: "", readCount: 0 }], ["c", { text: "C", readCount: 5 }]]);
check("joins the feeders' texts with a blank line, blank ones left out", walk.joinInputs(["a", "b", "c"], outs).text === "A\n\nC");
check("the read count is the largest", walk.joinInputs(["a", "c"], outs).readCount === 5);
check("a feeder listed twice counts once", walk.joinInputs(["a", "a"], outs).text === "A");
check("nothing fed it: nothing", walk.joinInputs([], outs).text === "" && walk.joinInputs([], outs).readCount === -1);

console.log("\n== 7. the runner walks a graph only for a flow that branches ==");
const runner = readFileSync("src/lib/automations/runner.ts", "utf8").replace(/\/\/.*$/gm, "");
check("graphMode needs the connections AND isBranching", /const graphMode = graphEdges !== null && isBranching\(graphEdges\);/.test(runner));
check("the order comes from walkOrder, and a cycle fails the run", /const order = walkOrder\([\s\S]{0,80}?\);\s*if \(!order\) return \{ status: "failed"[^}]*flow:graph_cycle/.test(runner));
check("a graph never waits for an approval (a resume has no graph to resume)", /if \(ctx\.resume \|\| \(!ctx\.dry && listBoxes\.some\(\(b\) => b\.kind === "approval"\)\)\) \{\s*return \{ status: "failed"[^}]*flow:graph_approval_unsupported/.test(runner));
check("a box reads what its feeders made, via joinInputs", /\(\{ text, readCount \} = joinInputs\(fed\.map\(\(e\) => e\.from\), outputs\)\)/.test(runner));
check("a box nothing led to does not run", /if \(box\.kind !== "start" && fed\.length === 0\) continue;/.test(runner));
check("the old jumps are off in graph mode", (runner.match(/graphEdges && !graphMode/g) ?? []).length >= 3 && /nextIds\.length > 0 && !graphMode/.test(runner));
check("a condition does not stop the whole run in graph mode", /if \(graphMode\) continue;\s*\n\s*if \(empty\) return \{ status: "stopped"/.test(runner));
check("the connections are read in a query of their own, not FLOW_COLUMNS", /loadEdges\(ctx\.flow\.id, ctx\.flow\.user_id\)/.test(runner) && !/FLOW_COLUMNS = "[^"]*edges/.test(readFileSync("src/lib/automations/flow-access.ts", "utf8")));

console.log("\n== 8. the canvas draws, deletes and moves — and says so to the server ==");
const canvas = readFileSync("src/components/automations/flow-canvas.tsx", "utf8").replace(/\/\/.*$/gm, "");
const shell = readFileSync("src/components/automations/automation-shell.tsx", "utf8").replace(/\/\/.*$/gm, "");
check("a drawn line is added to the WHOLE current set (the chain, when nothing is saved)", /const currentEdges = graphEdges && graphEdges\.length > 0 \? graphEdges : deriveEdgesFromList\(boxes\);/.test(canvas) && /onGraphChange\(\{ edges: \[\.\.\.currentEdges, \{ id:/.test(canvas));
check("a deleted line is taken out of that set", /onGraphChange\(\{ edges: currentEdges\.filter\(\(e\) => !ids\.has\(e\.id\)\) \}\)/.test(canvas));
check("moving a card keeps every position", /layout\[n\.id\] = \{ x: n\.position\.x, y: n\.position\.y \}/.test(canvas) && /onNodeDragStop=\{onNodeDragStop\}/.test(canvas));
check("the canvas can connect only when it was given a way to save", /nodesConnectable=\{Boolean\(onGraphChange\)\}/.test(canvas));
check("the card does not clip its own round ports (overflow hidden made them ungrabbable)", !/position: "relative", overflow: "hidden",\s*transition/.test(canvas));
check("the screen gives the canvas a way to save ONLY behind automation-canvas-cards", /onGraphChange=\{canvasCards \? \(patch\) =>/.test(shell));
check("a reply without connections keeps the ones on the screen", /if \(!\("edges" in incoming\)\)/.test(shell));
const patchRoute = readFileSync("src/app/api/automations/flows/[id]/route.ts", "utf8").replace(/\/\/.*$/gm, "");
check("PATCH takes connections and positions only behind automation-canvas-cards", /body\.edges !== undefined \|\| body\.layout !== undefined\) \{\s*if \(!\(await isFeatureOn\("automation-canvas-cards", user\)\)\) return refuse\("not_enabled", 403\)/.test(patchRoute));
check("PATCH checks them against the boxes the flow will have", /validateEdges\(body\.edges, boxIds\)/.test(patchRoute) && /validateLayout\(body\.layout, boxIds\)/.test(patchRoute));
check("connections follow a box edit", /reconcileStoredEdges\(id, user\.id, before\.boxes, verdict\.boxes\)/.test(patchRoute));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
