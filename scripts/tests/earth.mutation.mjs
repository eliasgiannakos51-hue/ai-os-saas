#!/usr/bin/env node
/*
 * CAN earth.test.mjs SEE THE EARTH DRIFT FROM THE DESIGN?
 *
 * Too many circles at 64px, no nodes at 160px, the far side as bright as
 * the near one, a satellite that stands still, a turn that is fast at
 * rest, the canvas starting before the page is idle, reduced motion
 * ignored, the logo spinning, and a colour written into the component.
 *
 * Run: node scripts/tests/earth.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/earth.test.mjs";
const LIB = "src/lib/brand/earth.ts";
const COMP = "src/components/brand/earth.tsx";
const TARGETS = [GATE, LIB, COMP];

const MUTANTS = [
  {
    name: "the small earth is drawn as busy as the large one",
    file: LIB,
    from: "  small: { circles: 6, nodes: 0, lineWidth: 1.4, satelliteR: 3.2 },",
    to: "  small: { circles: 9, nodes: 14, lineWidth: 1.4, satelliteR: 3.2 },",
    expect: "small: about six great circles",
  },
  {
    name: "the large earth loses its surface nodes",
    file: LIB,
    from: "  large: { circles: 9, nodes: 14, lineWidth: 0.9, satelliteR: 2.6 },",
    to: "  large: { circles: 9, nodes: 0, lineWidth: 0.9, satelliteR: 2.6 },",
    expect: "large: small nodes on the surface",
  },
  {
    name: "the far side is drawn as bright as the near side",
    file: LIB,
    from: "export const BACK_OPACITY = 0.12;",
    to: "export const BACK_OPACITY = 0.4;",
    expect: "the far side is fainter",
  },
  {
    name: "the satellite stands still",
    file: LIB,
    from: "  const sat = orbitPoint(orbit);",
    to: "  const sat = orbitPoint(0.9);",
    expect: "the satellite moves along the orbit",
  },
  {
    name: "the turn at rest is fast",
    file: LIB,
    from: "export const SPIN = { rest: 0.22, working: 1.5 };",
    to: "export const SPIN = { rest: 1.4, working: 1.5 };",
    expect: "quicker while working than at rest",
  },
  {
    name: "the canvas starts at once instead of when the page is idle",
    file: COMP,
    from: "    if (typeof w.requestIdleCallback === \"function\") idleId = w.requestIdleCallback(begin, { timeout: 1500 });\n    else idleId = window.setTimeout(begin, 300);",
    to: "    begin();",
    expect: "the canvas starts only once the browser is idle",
  },
  {
    name: "reduced motion is ignored",
    file: COMP,
    from: "    if (reduce) return;\n",
    to: "",
    expect: "reduced motion keeps it still",
  },
  {
    name: "the logo spins",
    file: COMP,
    from: "    if (variant === \"logo\") return;\n",
    to: "",
    expect: "the logo never animates",
  },
  {
    name: "a colour is written into the component",
    file: COMP,
    from: '        stroke="currentColor"\n        strokeLinecap="round"',
    to: '        stroke="#f2a65a"\n        strokeLinecap="round"',
    expect: "never a written colour",
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

console.log("earth mutations\n");

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
