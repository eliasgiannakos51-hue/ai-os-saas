#!/usr/bin/env node
/*
 * TELLING A GIFT FROM A PURCHASE, ON A DATABASE WHERE BOTH LOOK THE SAME.
 *
 * 20260815 backfilled purchased_credits from the BALANCE: anything above
 * the plan allotment must have been bought. That is a fair guess on a
 * database where nothing has happened since, and wrong on this one — a 440
 * credit goodwill adjustment reads identically to a 440 credit pack, and
 * the guess makes it permanent, surviving every monthly reset for ever.
 *
 * 20260817 replaces the guess with the LEDGER: credit_transactions knows
 * which rows were purchases. This suite is the reason to believe the gate
 * that proves it, and it holds the mutant purchased-credits.mutation.mjs
 * could not — the marker defect needs the history this gate stages
 * (20260805 -> 20260815 -> a goodwill grant -> the marker) and nothing
 * else in the tree stages it.
 *
 * Run: node scripts/tests/purchased-credits-marker.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/purchased-credits-marker.itest.mjs";
const MARKER = "supabase/migrations/20260817_purchased_credits_backfill_marker.sql";
const BASE = "supabase/migrations/20260815_purchased_credits.sql";

const MUTANTS = [
  {
    // THE DEFECT THE MARKER EXISTS FOR. Guard the original backfill on the
    // VALUE instead of the marker and a second application reclassifies
    // every goodwill grant made in between as a permanent purchase — the
    // 440 credits a real cluster gained, recorded in 20260815's header.
    name: "the original backfill is guarded on the value, so a re-run turns a gift into a purchase",
    file: BASE,
    // ANCHORED ON THE BACKFILL, not on the bootstrap. 20260815 carries the
    // same `where purchased_credits_backfilled_at is null` three times, and
    // the first draft of this mutant replaced the FIRST — the bootstrap's
    // marker seed — which is a different statement doing a different job.
    from: "   set purchased_credits = greatest(credits_remaining - credits_total, 0),\n       purchased_credits_backfilled_at = now()\n where purchased_credits_backfilled_at is null",
    to: "   set purchased_credits = greatest(credits_remaining - credits_total, 0),\n       purchased_credits_backfilled_at = now()\n where purchased_credits = 0",
    expect: "the gift is still monthly after it",
  },
  {
    // THE LEDGER FILTER. Reconciling against every transaction rather than
    // the purchases turns admin adjustments, refunds and monthly grants
    // into proven purchases.
    name: "the reconciliation counts every credit movement as a purchase",
    file: MARKER,
    from: "   where action_type = 'purchase' and amount > 0",
    to: "   where amount > 0",
    expect: "the gift stayed MONTHLY",
  },
  {
    // THE RAISE-ONLY RULE, REMOVED — and it takes both lines, because they
    // are a pair. `greatest(existing, proven)` and `where proven >
    // existing` each guarantee the same thing on their own, so deleting
    // either one alone is a no-op that no gate can catch and none should
    // try to. Deleting BOTH is the defect: the reconciliation then settles
    // on what the ledger can prove and LOWERS every pack bought before
    // credit_transactions existed.
    name: "the raise-only rule goes, so a pack older than the ledger is cut down to what it can prove",
    file: MARKER,
    from: "   set purchased_credits = greatest(uc.purchased_credits, pr.proven_purchased),\n       updated_at        = now()\n  from proven pr\n where pr.user_id = uc.user_id\n   and pr.proven_purchased > uc.purchased_credits;",
    to: "   set purchased_credits = pr.proven_purchased,\n       updated_at        = now()\n  from proven pr\n where pr.user_id = uc.user_id;",
    expect: "raised, not reduced to what it can prove",
  },
  {
    // Spending is what makes a pack smaller than what was bought. Ignore
    // it and the sub-ledger claims 1,000 on a balance of 150 — which the
    // CHECK constraint refuses, so the whole migration fails to apply.
    name: "spending since the purchase stops being subtracted, restoring a spent pack to full size",
    file: MARKER,
    from: "   where ct.amount < 0",
    to: "   where ct.amount < -999999999",
    expect: "the early pack was not lowered",
  },
  {
    // The marker never gets written, so every subsequent run treats every
    // row as unconsidered — the idempotency this file exists to provide
    // is gone, and the damage compounds once per deploy.
    name: "rows are never marked as considered, so every future run reconsiders them",
    file: MARKER,
    from: " where purchased_credits_backfilled_at is null;",
    to: " where false;",
    expect: "every row is now marked as considered",
  },
];

// WHAT IS DELIBERATELY NOT HERE. Two single-line mutants were tried first
// and neither is a defect: `greatest(uc.purchased_credits,
// pr.proven_purchased)` and `where pr.proven_purchased >
// uc.purchased_credits` are belt and braces for the same rule, so removing
// either one alone leaves the migration doing exactly what it did. They are
// worth keeping — the pair is what makes a partial first run harmless — but
// a mutation suite that demanded a gate go red on a no-op would be
// reporting a hole in the gate for the crime of being correct.

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

console.log("purchased-credits-marker mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

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
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
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
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("A gift cannot be reclassified as a purchase without this going red.");
