#!/usr/bin/env node
/*
 * CAN research-timeline.test.mjs SEE A REPORT TIMELINE THAT LIES?
 *
 * The ways slice 4 could mislead: our cost reaching the browser again,
 * steps priced while the report still runs, a guessed duration for a
 * finding that was never stamped, a worker that stops stamping, and a
 * route that goes back to returning the row as it is.
 *
 * Run: node scripts/tests/research-timeline.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/research-timeline.test.mjs";
const LIB = "src/lib/research/research-timeline.ts";
const RUNNER = "src/lib/research/run-research.ts";
const ROUTE = "src/app/api/research/[id]/route.ts";
const TARGETS = [GATE, LIB, RUNNER, ROUTE];

const MUTANTS = [
  {
    name: "usage_entries is sent to the browser again",
    file: LIB,
    from: 'export const SERVER_ONLY_RESEARCH_COLUMNS = ["usage_entries", "reservation_id"] as const;',
    to: 'export const SERVER_ONLY_RESEARCH_COLUMNS = ["reservation_id"] as const;',
    expect: "usage_entries is not sent",
  },
  {
    name: "the route returns the row as it is",
    file: ROUTE,
    from: "    return NextResponse.json({ ok: true, report: researchReportForClient(data) });",
    to: "    return NextResponse.json({ ok: true, report: data });",
    expect: "every one goes through researchReportForClient",
  },
  {
    name: "a finished report is priced as if it were still running",
    file: LIB,
    from: '    status: row.status === "ready" ? "done" : row.status === "failed" ? "failed" : "running",',
    to: '    status: "running",',
    expect: "the credits add up to the charge exactly",
  },
  {
    name: "a running report shows credits",
    file: LIB,
    from: '    status: row.status === "ready" ? "done" : row.status === "failed" ? "failed" : "running",',
    to: '    status: "done",',
    expect: "no credits while it runs",
  },
  {
    name: "unstamped findings get a timeline anyway",
    file: LIB,
    from: "  if (!stamped) return [];",
    to: "",
    expect: "one unstamped finding is enough to give none",
  },
  {
    name: "the worker stops stamping answered questions",
    file: RUNNER,
    from: "    findings.push({ ...result.finding, finishedAt: new Date().toISOString(), usageCount: costs.snapshot().length });",
    to: "    findings.push(result.finding);",
    expect: "stored with when it finished",
  },
  {
    name: "each step is priced from the start rather than from the step before",
    file: LIB,
    from: "    usedBefore = f.usageCount as number;",
    to: "",
    expect: "the dearer step gets more credits",
  },
  {
    name: "the sources count is dropped",
    file: LIB,
    from: '      evidence: { key: "sources", count: sources },',
    to: "      evidence: null,",
    expect: "how many sources it found",
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

console.log("research-timeline mutations\n");

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
