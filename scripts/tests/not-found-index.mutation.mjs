#!/usr/bin/env node
/*
 * CAN not-found-index.test.mjs SEE -1 GO BACK TO MEANING SOMETHING ELSE?
 *
 * Each mutation below restores, exactly, the code that shipped before this
 * round — so a CAUGHT line is also the proof that the gate would have been
 * red on the defect rather than written to match the fix.
 *
 * Run: node scripts/tests/not-found-index.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/not-found-index.test.mjs";
const ROVING = "src/lib/ui/roving-index.ts";
const CARD_MENU = "src/components/ui/card-menu.tsx";
const PLANS = "src/lib/billing/plans.ts";
const CATALOG = "src/lib/ai/providers/catalog.ts";
const CHARTS = "src/lib/data-analysis/charts.ts";

const MUTANTS = [
  {
    // 1. THE ORIGINAL ARITHMETIC. `(current - 1 + size) % size` with
    // current = -1 is size - 2: a three-item menu opens on its middle
    // entry when somebody presses ArrowUp.
    name: "the not-found case goes back to being arithmetic instead of a branch",
    file: ROVING,
    from: '  if (!Number.isInteger(current) || current < 0 || current >= size) {\n    return direction === "next" ? 0 : size - 1;\n  }',
    to: "",
    expect: "rovingIndex(-1, 3, 'previous')",
  },
  {
    // 2. A ZERO-LENGTH LIST. `% 0` is NaN, and the caller that read
    // `tabs[next].key` off it threw.
    name: "a list with nothing in it stops answering null",
    file: ROVING,
    from: "  if (!Number.isFinite(length) || length < 1) return null;",
    to: "",
    expect: "rovingIndex(0, 0, 'next')",
  },
  {
    // 3. THE MENU COMPUTES IT ITSELF AGAIN — the drift this centralising
    // was for.
    name: "card-menu inlines the arithmetic again",
    file: CARD_MENU,
    from: `      const next = rovingIndex(
        list.indexOf(document.activeElement as HTMLElement),
        list.length,
        e.key === "ArrowDown" ? "next" : "previous"
      );`,
    to: `      const current = list.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "ArrowDown"
          ? (current + 1) % list.length
          : (current - 1 + list.length) % list.length;`,
    expect: "does not compute it inline again",
  },
  {
    // 4. THE PAYWALL OPENS. This is the exact line that shipped: an
    // unranked minimum ranks -1, and every plan is >= -1.
    name: "an unranked minimum lets every plan through again",
    file: PLANS,
    from: "  return tierRank >= 0 && minRank >= 0 && tierRank >= minRank;",
    to: "  return tierRank >= 0 && tierRank >= minRank;",
    expect: "an unranked minimum lets NOBODY through",
  },
  {
    // 5. THE RANK TABLE GOES BACK TO A LIST TypeScript COULD NOT KEEP
    // COMPLETE. The annotation checks the entries, never the coverage.
    name: "the rank table stops being keyed by the slug union",
    file: PLANS,
    from: "const PLAN_RANK: Record<PlanSlug, number> = {\n  free: 0,",
    to: "const PLAN_RANK: Record<string, number> = {\n  free: 0,",
    expect: "PLAN_RANK is keyed by the slug union",
  },
  {
    // 6. AN UNKNOWN TIER RANKS AS "free" INSTEAD OF AS NOTHING — the
    // plausible mistake, because -1 looks like a magic number and 0 looks
    // like a sensible default. It is not: `planMeetsMinimum("legendary",
    // "free")` becomes true, so a corrupt tier column buys the free plan's
    // gated features.
    //
    // A MUTATION THAT WAS DROPPED, and why, so nobody adds it back
    // expecting it to work: replacing the hasOwnProperty lookup with
    // `PLAN_RANK[key] ?? -1` leaves this gate green, and it should.
    // `PLAN_RANK["toString"]` is a function, `?? -1` keeps it, and every
    // comparison against a function is false — so the prototype names
    // fail closed either way. The hasOwnProperty version says what it
    // means instead of relying on that; it does not fix a live defect,
    // and claiming a mutation for it would be claiming a test for
    // something the code did not do wrong.
    name: "an unknown tier ranks as free instead of as nothing",
    file: PLANS,
    from: "? PLAN_RANK[key as PlanSlug] : -1;",
    to: "? PLAN_RANK[key as PlanSlug] : 0;",
    expect: "a tier that is not a plan meets nothing",
  },
  {
    // 7. A REQUEST FOR A LARGE MODEL ANSWERED BY THE CHEAPEST ONE.
    name: "an unranked tier stops failing closed in the catalogue",
    file: CATALOG,
    from: "  if (wanted < 0) return null;",
    to: "",
    expect: "an unknown tier returns null",
  },
  {
    // 8. AN EMPTY CHART THAT LOOKS LIKE A FILE WITH NO DATA.
    name: "a column the headers do not have goes back to row[-1]",
    file: CHARTS,
    from: "  if (xIndex < 0 || (yColumn && yIndex < 0)) return { spec, points: [], truncated: false };",
    to: "",
    expect: "a column the headers do not have says so",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("not-found-index mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
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
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
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
console.log("Every one of the five places -1 meant something else is pinned by a value, not by a shape.");
