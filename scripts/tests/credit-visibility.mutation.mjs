#!/usr/bin/env node
/*
 * WHERE DID MY CREDITS GO? — and whether the answer can go missing.
 *
 * settle_reservation writes a credit_transactions row ONLY when it
 * actually charges, so every free action — the ones a plan grants without
 * spending — left NO trace at all. The history panel showed a balance
 * dropping between rows a customer could not account for, and the support
 * answer was "it was free". That is the worst shape a money screen can
 * have: the ledger is complete and the story it tells is wrong.
 *
 * The fix reads two sources — the ledger for charges and ai_cost_log for
 * the zero-charge rows — and reconstructs the balance backwards from
 * today. Every one of those is a line somebody can delete while the panel
 * still renders, so each is a mutation here.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal, so a
 * mutation written that way is "caught" by the marker gate without any
 * behavioural check having looked at it.
 *
 * Run: node scripts/tests/credit-visibility.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/credit-visibility.test.mjs";
const PAGE = "src/app/dashboard/settings/page.tsx";
const PANEL = "src/components/settings/credit-history.tsx";
const TARGETS = [...new Set([PAGE, PANEL])];

const MUTANTS = [
  {
    // 1. THE SECOND SOURCE DISAPPEARS and the panel is a ledger again —
    // exactly the state the customer could not account for.
    name: "the free actions stop being read at all",
    file: PAGE,
    from: '      .from("ai_cost_log")\n      .select("id, feature, created_at, metadata")',
    to: '      .from("credit_transactions")\n      .select("id, feature, created_at, metadata")',
    expect: "and now also reads the AI activity log",
  },
  {
    // 2. THE ZERO-CHARGE FILTER GOES, so every paid action is counted
    // twice — once from the ledger and once from the cost log. The
    // balance column then disagrees with itself.
    name: "the activity query stops filtering to the zero-charge rows",
    file: PAGE,
    from: '.eq("credits_charged", 0)',
    to: '.gte("credits_charged", 0)',
    expect: "taking ONLY the zero-charge rows",
  },
  {
    // 3. THE SCOPE GOES. One customer's history shows another's actions.
    name: "the activity query stops being scoped to this user",
    file: PAGE,
    from: '      .eq("user_id", user.id)\n      .eq("credits_charged", 0)',
    to: '      .eq("credits_charged", 0)',
    expect: "scoped to this user",
  },
  {
    // 4. A FREE ACTION IS PRINTED AS COSTING 0. "0" is a number a person
    // reads as a charge of nothing rather than as an entitlement, which
    // is the misreading the Unlimited label exists to stop.
    name: "a free action is labelled 0 instead of Unlimited",
    file: PANEL,
    from: 't("unlimited")',
    to: '"0"',
    expect: "labelled Unlimited rather than a misleading 0",
  },
  {
    // 5. A ROW WITH NO would-have IS PRINTED ANYWAY, so the panel invents
    // a number for an action nobody priced.
    name: "a missing would-have cost is printed rather than omitted",
    file: PANEL,
    from: "row.wouldHave !== null &&",
    to: "true &&",
    expect: "a missing would-have is omitted, not printed",
  },
  {
    // 6. THE BALANCE STOPS WALKING BACKWARDS. Every row then shows
    // today's balance, which is the one number a person can already see.
    name: "the running balance stops being unwound",
    file: PANEL,
    from: "running -= tx.amount",
    to: "running -= 0",
    expect: "and it walks backwards from today",
  },
  {
    // 7. AND THE EMPTY STATE GOES BACK TO HARDCODED ENGLISH, on a screen
    // about money, for the nine other languages.
    name: "the empty state is hardcoded English again",
    file: PANEL,
    from: 't("noCreditActivity")',
    to: '"No credit activity yet."',
    expect: "the empty state is translated, not hardcoded English",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("credit-visibility mutations\n");

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
console.log("A history that stops showing what a free action would have cost turns this red.");
