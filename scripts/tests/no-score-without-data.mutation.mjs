#!/usr/bin/env node
/*
 * CAN no-score-without-data.test.mjs SEE THE VERDICT COME BACK?
 *
 * Seven mutations across seven dimensions, because a suite that only
 * breaks the headline check reports coverage it does not have:
 *
 *   1. the page shows the score unconditionally again
 *   2. ...or keeps the check and drops the card that stands in for it
 *   3. ...or re-decides with a literal threshold of its own
 *   4. the threshold constant goes to zero
 *   5. the DERIVATION: the score stops being dominated by the first
 *      entry, which is the entire reason the threshold is five
 *   6. the chart threshold overtakes the score threshold
 *   7. the placeholder is drawn in the accent, so it reads as a zero
 *
 * Run: node scripts/tests/no-score-without-data.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/no-score-without-data.test.mjs";
const LIB = "src/lib/health-score.ts";
const PAGE = "src/app/dashboard/overview/page.tsx";
const CARD = "src/components/overview/home-stat-card.tsx";
const TARGETS = [GATE, LIB, PAGE, CARD];

const MUTANTS = [
  {
    name: "the page shows the score to an account with nothing",
    file: PAGE,
    from: "{hasEnoughDataForScore(totalEntries) ? (",
    to: "{true ? (",
    expect: "calls hasEnoughDataForScore",
  },
  {
    // DELETED, NOT HIDDEN. The first version of this mutation wrapped the
    // card in `<div hidden>` and the gate stayed green — correctly, as it
    // turns out: a source-level check can see that a component is
    // WRITTEN, never that it is PAINTED. Whether the card actually
    // appears is the browser's question and
    // scripts/tests/no-score-without-data.prodtest.mjs asks it, by
    // reading the setup ring's aria-label off a real empty account. This
    // file owns the claim it can actually hold — that the false branch
    // renders the card at all — so the mutation removes it.
    name: "the check stays but the false branch renders nothing",
    file: PAGE,
    from: "          <SetupProgressCard",
    to: "          <div /> && (\n          <SetupProgressCardXX",
    expect: "setup progress only in the FALSE arm",
  },
  {
    name: "the page re-decides with a literal threshold of its own",
    file: PAGE,
    from: "{hasEnoughDataForScore(totalEntries) ? (",
    to: "{totalEntries >= 2 ? (",
    expect: "bare threshold",
  },
  {
    name: "the threshold goes to zero, so every account is judged",
    file: LIB,
    from: "export const HEALTH_SCORE_MIN_ENTRIES = 5;",
    to: "export const HEALTH_SCORE_MIN_ENTRIES = 0;",
    expect: "entries is not enough",
  },
  {
    // THE REASON, NOT THE NUMBER. If `recency` stops jumping to full on
    // the first entry, the score is no longer dominated by one action and
    // the justification for withholding it has changed — the constant
    // should then be revisited rather than kept out of habit. This is the
    // mutation that makes the derivation load-bearing instead of
    // decorative.
    name: "the first entry stops dominating the score",
    file: LIB,
    from: "      ? 0\n      : clamp(",
    to: "      ? 0\n      : 0 * clamp(",
    expect: "which is why one entry is not a measurement",
  },
  {
    name: "the chart withholds itself for longer than the score does",
    file: LIB,
    from: "export const CHART_MIN_ENTRIES = 3;",
    to: "export const CHART_MIN_ENTRIES = 9;",
    expect: "charts at",
  },
  {
    name: "the placeholder is drawn in the accent, so it reads as a zero",
    file: CARD,
    from: "rgb(255_255_255/0.14)",
    to: "#f97316",
    expect: "not the accent colour",
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

console.log("no-score-without-data mutations\n");

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
console.log("Every clause of no-score-without-data.test.mjs is load-bearing.");
