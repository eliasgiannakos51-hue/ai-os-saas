#!/usr/bin/env node
/*
 * CAN job-timeline.test.mjs SEE A TIMELINE THAT LIES ABOUT MONEY?
 *
 * The ways V6.2 2.1 could mislead: credits per step that no longer add up
 * to the charge, credits shown while a job is still running, our provider
 * cost reaching the client, and a worker that writes the column on a
 * database that has not run the migration — taking the step update down.
 *
 * Run: node scripts/tests/job-timeline.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/job-timeline.test.mjs";
const LIB = "src/lib/jobs/job-timeline.ts";
const RUNNER = "src/lib/jobs/run-job.ts";
const ROUTE = "src/app/api/jobs/[id]/route.ts";
const TARGETS = [GATE, LIB, RUNNER, ROUTE];

const MUTANTS = [
  {
    name: "the remainder is never handed out, so steps sum below the charge",
    file: LIB,
    from: "    floors[i] += 1;\n",
    to: "",
    expect: "sums to",
  },
  {
    name: "credits are shown while the job is still running",
    file: LIB,
    from: "  const done = job.status === \"done\" || job.status === \"failed\";",
    to: "  const done = true;",
    expect: "while running, no step shows credits",
  },
  {
    name: "the stored cost is passed to the client",
    file: LIB,
    from: "      evidence: e.evidence,\n    };",
    to: "      evidence: e.evidence,\n      costUsd: e.costUsd,\n    };",
    expect: "no provider cost reaches the client",
  },
  {
    name: "an unweighable charge is split into zeros anyway",
    file: LIB,
    from: "  const weighable = weights.some((w) => w > 0) || job.creditsCharged === 0;",
    to: "  const weighable = true;",
    expect: "shows no credits rather than wrong ones",
  },
  {
    name: "the worker writes the column whether or not it exists",
    file: RUNNER,
    from: "          ...(recordsTimeline ? { timeline } : {}),",
    to: "          timeline,",
    expect: "only when the row has the column",
  },
  {
    name: "the poll returns the stored entries as they are",
    file: ROUTE,
    from: "        timeline: timelineForClient(restoreTimeline(job.timeline), {",
    to: "        timeline: job.timeline, _t: timelineForClient(restoreTimeline(job.timeline), {",
    expect: "the poll returns the timeline through timelineForClient",
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

console.log("job-timeline mutations\n");

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
