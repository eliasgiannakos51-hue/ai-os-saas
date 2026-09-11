#!/usr/bin/env node
/*
 * CAN step-flow.test.mjs SEE A FLOW THAT HAS DRIFTED?
 *
 * Six mutants, one per way this particular consistency rots:
 *
 *   1. a flow loses a step — the direction a list like this actually
 *      rots, because dropping a step is how you make some other check
 *      pass
 *   2. a step name stops being shared: the same step gets a second key,
 *      which is how two screens end up with two Greek words for it
 *   3. a locale loses a hint
 *   4. a screen stops drawing its flow at all
 *   5. the order check stops distinguishing flow-then-button from
 *      button-then-flow — the half of "consistent" a word-only check
 *      cannot see, and the one every real file satisfies today, so it
 *      is proved on samples rather than on the tree
 *   6. the indicator grows a filled accent chip, which is a second
 *      primary action on four screens at once
 *   7. coding's flow claims a step that page does not have
 *
 * Run: node scripts/tests/step-flow.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/step-flow.test.mjs";
const FLOWS = "src/lib/ui/step-flows.ts";
const SHAPE = "src/components/ui/step-flow.tsx";
const EL = "messages/el.json";
const CODING = "src/components/coding/coding-workspace.tsx";
const RESEARCH = "src/components/research/research-workspace.tsx";

const TARGETS = [GATE, FLOWS, SHAPE, EL, CODING, RESEARCH];

const MUTANTS = [
  {
    name: "a flow loses a step",
    file: FLOWS,
    from: '  research: ["question", "research", "sources", "answer"],',
    to: '  research: ["question", "research", "answer"],',
    expect: "research: question -> research -> sources -> answer",
  },
  {
    name: "a step name stops being shared between two flows",
    file: FLOWS,
    from: '  coding: ["describe", "generate", "review"],',
    to: '  coding: ["describeCode", "generateCode", "review"],',
    expect: "every step has a word and a hint",
  },
  {
    name: "a locale loses one hint",
    file: EL,
    from: '"upload": "Ανέβασε",',
    to: '"uploadXX": "Ανέβασε",',
    expect: "el: every step has a word and a hint",
  },
  {
    name: "a screen stops drawing its flow",
    file: CODING,
    from: '<StepFlow flow="coding" current={codingStep} />',
    to: "",
    expect: "coding: the screen renders its own flow",
  },
  {
    // THE ORDER, NOT THE PRESENCE. All four real files satisfy this
    // today, so the clause had no way to go red until the gate grew
    // samples for it — which is what this mutant proves, by breaking
    // the comparison the samples exercise.
    name: "the order check stops caring which comes first",
    file: GATE,
    from: "  return firstFilled === undefined || at < firstFilled.start;",
    to: "  return true;",
    expect: "...and refuses button-then-flow",
  },
  {
    name: "the indicator grows a filled accent chip",
    file: SHAPE,
    from: 'here ? "bg-orange-500/15 text-orange-300" : "bg-panel-hover text-muted"',
    to: 'here ? "bg-orange-500 text-black" : "bg-panel-hover text-muted"',
    expect: "no filled accent anywhere in the step flow",
  },
  {
    name: "coding's flow claims a step that page does not have",
    file: FLOWS,
    from: '  coding: ["describe", "generate", "review"],',
    to: '  coding: ["describe", "generate", "test", "deploy"],',
    expect: "the coding flow claims none of test, fix or deploy",
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
      body: out,
    };
  }
}

console.log("step-flow mutations\n");

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
    const onTarget =
      result.failed.some((f) => f.includes(m.expect)) || (result.body ?? "").includes(m.expect);
    if (!onTarget) {
      missed.push({
        ...m,
        why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}`);
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
console.log("Every clause of step-flow.test.mjs is load-bearing.");
