#!/usr/bin/env node
/*
 * THE CREDITS SOMEBODY PAID FOR, AND THE RESET THAT USED TO DELETE THEM.
 *
 * The monthly reset once wrote `credits_remaining := plan allotment`, flat.
 * An account holding 7,400 — 3,000 monthly and 4,400 bought — came out of
 * the first of the month with 3,000, and the 4,400 were gone with no row
 * anywhere saying so. purchased-credits.itest.mjs is the reproduction and
 * the proof it cannot happen again; this suite is the reason to believe it.
 *
 * The gate runs against a real ephemeral Postgres, so every mutant here is
 * arithmetic a real database would really perform on a real balance. None
 * of them is a syntax error, and every one of them is somebody's money.
 *
 * Run: node scripts/tests/purchased-credits.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/purchased-credits.itest.mjs";
const SQL = "supabase/migrations/20260815_purchased_credits.sql";

const MUTANTS = [
  {
    // THE ORIGINAL BUG, PUT BACK. The reset stops carrying the sub-ledger
    // forward, so the first of the month deletes every credit anybody
    // ever bought.
    name: "the monthly reset overwrites the balance again, destroying purchased credits",
    file: SQL,
    from: "    set credits_remaining = p_monthly + public.user_credits.purchased_credits,",
    to: "    set credits_remaining = p_monthly,",
    expect: "the monthly reset succeeds against the real schema",
  },
  {
    // The sub-ledger is zeroed by the reset instead of carried. The
    // balance looks right for one month and the next reset takes the
    // pack with it.
    name: "the reset zeroes the sub-ledger, so the pack vanishes a month later",
    file: SQL,
    from: "   set purchased_credits = greatest(credits_remaining - credits_total, 0),",
    to: "   set purchased_credits = 0,",
    expect: "recognised as purchased",
  },
  {
    // SPEND ORDER. least(purchased, remaining - amount) is what makes the
    // monthly part absorb a spend first; drop it and a spend comes
    // straight out of what the customer paid for while their free
    // allotment sits unused.
    name: "a spend stops taking the monthly part first and eats the purchased pack",
    file: SQL,
    from: "      purchased_credits = least(purchased_credits, credits_remaining - p_amount)",
    to: "      purchased_credits = purchased_credits",
    expect: "a 2,000-credit spend succeeds against the real schema",
  },
  {
    // The CHECK constraint is the database's own last word: the sub-ledger
    // may never claim more than the balance. Without it a rounding error
    // anywhere upstream becomes a permanent phantom credit.
    name: "the constraint that keeps the sub-ledger inside the balance is dropped",
    file: SQL,
    from: "      check (purchased_credits >= 0 and purchased_credits <= credits_remaining);",
    to: "      check (purchased_credits >= 0);",
    expect: "refuses purchased > remaining",
  },
  {
    // greatest(..., 0) is what stops a settlement driving a balance below
    // zero. Removed, a charge larger than the balance leaves a negative
    // number that every downstream sum then trusts.
    name: "a settlement can drive the balance negative",
    file: SQL,
    from: "      set credits_remaining = greatest(credits_remaining - p_credits_to_charge, 0),",
    to: "      set credits_remaining = credits_remaining - p_credits_to_charge,",
    expect: "lands exactly on zero",
  },
  {
    // A grant that records everything as purchased. Free monthly credits
    // then survive every reset as if they had been bought, and the plan
    // allotment compounds month over month.
    name: "every grant is recorded as purchased, so free credits never expire",
    file: SQL,
    from: "    case when p_purchased then greatest(p_amount, 0) else 0 end",
    to: "    greatest(p_amount, 0)",
    expect: "plan grant records nothing as purchased",
  },
];

// THE MARKER MUTANT IS NOT HERE, and the migration says where it belongs.
//
// Guarding the backfill on `purchased_credits = 0` instead of on
// purchased_credits_backfilled_at is a real defect — 20260815's header
// records a real cluster moving an account from (540, 0) to (540, 440)
// because of it. But the sequence that exposes it is 20260805 -> this file
// -> a non-purchased admin grant -> this file AGAIN, and that sequence is
// not what this gate runs. Its re-run happens on a row whose
// purchased_credits is already 4,400, so the value guard skips it and
// nothing doubles.
//
// The mutant lives in purchased-credits-marker.mutation.mjs, against the
// gate that actually stages that history. Putting it here would have
// reported a permanent HOLE in a suite with none.

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("purchased-credits mutations\n");
const original = readFileSync(SQL, "utf8");
const restore = () => writeFileSync(SQL, original);

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(SQL, original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restore(); }
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
  restore();
}

const after = runGate();
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("Nobody's paid credits can be deleted, double-counted or spent out of order without this going red.");
