#!/usr/bin/env node
/*
 * CAN chat-timeline.test.mjs SEE A CHAT TIMELINE THAT LIES?
 *
 * The ways slice 6 could mislead: a step per text delta, steps priced by
 * a split that was never measured, a search that is never marked, a plain
 * answer buried under a two-line timeline, and a frame from anywhere
 * drawn without a check.
 *
 * Run: node scripts/tests/chat-timeline.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/chat-timeline.test.mjs";
const LIB = "src/lib/chat/chat-timeline.ts";
const ROUTE = "src/app/api/chat/route.ts";
const UI = "src/components/chat/chat-workspace.tsx";
const TARGETS = [GATE, LIB, ROUTE, UI];

const MUTANTS = [
  {
    name: "every text delta becomes a step",
    file: LIB,
    from: "  if (last?.label === label) return entries;",
    to: "",
    expect: "the same phase twice in a row is one step",
  },
  {
    name: "no cap on the steps",
    file: LIB,
    from: "  if (entries.length >= MAX_CHAT_STEPS) return entries;",
    to: "",
    expect: "a runaway loop stops",
  },
  {
    name: "steps get a guessed price",
    file: LIB,
    from: "      credits: null,",
    to: "      credits: seconds,",
    expect: "no step is ever priced",
  },
  {
    name: "every answer shows a timeline",
    file: LIB,
    from: '  return entries.some((e) => e.label === "searching_web" || e.label === "searching_data");',
    to: "  return entries.length > 0;",
    expect: "thinking then writing: nothing to show",
  },
  {
    name: "an unknown phase is drawn",
    file: LIB,
    from: '  if (!isChatStep(f.label) || typeof f.at !== "string" || Number.isNaN(Date.parse(f.at))) return null;',
    to: '  if (typeof f.at !== "string" || Number.isNaN(Date.parse(f.at))) return null;',
    expect: "an unknown phase is dropped",
  },
  {
    name: "the web search is never marked",
    file: ROUTE,
    from: '              if (block.type === "server_tool_use" && block.name === "web_search") markStep("searching_web");',
    to: '              if (block.type === "server_tool_use" && block.name === "web_search") void 0;',
    expect: "a web search block opening is the search",
  },
  {
    name: "the data search is never marked",
    file: ROUTE,
    from: '            markStep("searching_data");\n',
    to: "",
    expect: "the data tool round is marked",
  },
  {
    name: "the done frame always carries a timeline",
    file: ROUTE,
    from: "            timeline: chatTimelineWorthShowing(chatTimeline)",
    to: "            timeline: true",
    expect: "only for an answer worth showing",
  },
  {
    name: "the screen trusts any frame",
    file: UI,
    from: "  return steps.length === raw.length ? steps : undefined;",
    to: "  return raw as ClientStep[];",
    expect: "a step that is not a chat phase drops the whole frame",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 60_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("chat-timeline mutations\n");

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
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.",
);
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
