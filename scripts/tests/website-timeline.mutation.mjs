#!/usr/bin/env node
/*
 * CAN website-timeline.test.mjs SEE A WEBSITE TIMELINE THAT LIES?
 *
 * The ways slice 5 could mislead: dollars stored in a column every route
 * returns, phases priced before the generation is finished, a failed
 * generation shown as if it ran, a timeline write folded into the status
 * write (so an un-migrated database fails every generation), the builder
 * trusting a raw row's stored entries, and the rotating sentences
 * winning over the real phase.
 *
 * Run: node scripts/tests/website-timeline.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/website-timeline.test.mjs";
const LIB = "src/lib/websites/website-timeline.ts";
const WORKER = "src/app/api/websites/generate/process/route.ts";
const STATUS = "src/app/api/websites/status/route.ts";
const UI = "src/components/website-builder/website-builder-workspace.tsx";
const TARGETS = [GATE, LIB, WORKER, STATUS, UI];

const MUTANTS = [
  {
    name: "the dollar cost is stored instead of a share",
    file: LIB,
    from: "  const weighted = steps.map((e, i) => ({ ...e, weight: total > 0 ? Math.round((spans[i] / total) * 1000) : 0 }));",
    to: "  const weighted = steps.map((e, i) => ({ ...e, weight: total > 0 ? Math.round((spans[i] / total) * 1000) : 0, costUsd: spans[i] }));",
    expect: "no dollar figure is stored",
  },
  {
    name: "a running generation is priced",
    file: LIB,
    from: '  const finished = website.status === "completed" || website.status === "flagged";',
    to: "  const finished = true;",
    expect: "a generation in flight is not priced",
  },
  {
    name: "credits before the end mark",
    file: LIB,
    from: "    finished && done && typeof website.creditsCharged",
    to: "    finished && typeof website.creditsCharged",
    expect: "until the end mark is",
  },
  {
    name: "a failed generation shows its phases anyway",
    file: LIB,
    from: '  if (website.status === "failed") return [];',
    to: "",
    expect: "a failed generation shows nothing",
  },
  {
    name: "a repeated phase is appended again",
    file: LIB,
    from: "  if (entries.some((e) => e.step === step)) return entries;",
    to: "",
    expect: "a phase started twice keeps the first",
  },
  {
    name: "the builder accepts any array",
    file: LIB,
    from: "  return ok ? (raw as ClientStep[]) : [];",
    to: "  return raw as ClientStep[];",
    expect: "the stored entries a raw row carries are not",
  },
  {
    name: "the timeline rides on the final status write",
    file: WORKER,
    from: '      .update({ status: isFlagged ? "flagged" : "completed" })',
    to: '      .update({ status: isFlagged ? "flagged" : "completed", timeline })',
    expect: "the timeline is its own update",
  },
  {
    name: "the worker stops marking the photos phase",
    file: WORKER,
    from: '      await markStep("photos");',
    to: "",
    expect: "the worker marks the five phases",
  },
  {
    name: "cost marks drift from the entries",
    file: WORKER,
    from: "      if (next === timeline) return;\n",
    to: "",
    expect: "a cost mark is pushed only for a phase that was added",
  },
  {
    name: "the status route returns the finished row raw",
    file: STATUS,
    from: "record: withClientTimeline(record, usage?.creditsCharged ?? null), usage",
    to: "record: record, usage",
    expect: "every one goes through withClientTimeline",
  },
  {
    name: "the rotating sentence wins over the real phase",
    file: UI,
    from: "{liveStepText ?? t(PROGRESS_MESSAGE_KEYS[progressMessageIndex])}",
    to: "{t(PROGRESS_MESSAGE_KEYS[progressMessageIndex])}",
    expect: "the live line names the real phase",
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

console.log("website-timeline mutations\n");

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
