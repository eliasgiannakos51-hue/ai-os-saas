#!/usr/bin/env node
/*
 * THE WHOLE UPGRADE, ON A DATABASE THAT ALREADY WENT WRONG ONCE.
 *
 * The other credit suites each prove one migration. This gate proves the
 * SEQUENCE: a cluster that ran the original 20260815 — two
 * grant_credits_idempotent overloads, both executable by `authenticated`,
 * a goodwill grant misfiled as a purchase — and then ran everything since.
 * It asserts the broken state first, so the fix has something to fix, and
 * the fixed state after.
 *
 * That "assert the damage first" half is what these mutants aim at. A
 * repair suite whose BEFORE section cannot fail is a suite that would go
 * green against a database it never actually repaired.
 *
 * Run: node scripts/tests/purchased-credits-upgrade.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/purchased-credits-upgrade.itest.mjs";
const DROP = "supabase/migrations/20260817000000_drop_stale_grant_overload.sql";
const GRANTS = "supabase/migrations/20260818000000_function_grants.sql";
const MARKER = "supabase/migrations/20260817_purchased_credits_backfill_marker.sql";

const MUTANTS = [
  {
    // The drop names a signature that does not exist, so both overloads
    // survive. Every credit grant then resolves to two candidates and
    // PostgREST answers "function is not unique" — no money moves at all.
    name: "the stale overload is not dropped, so the upgraded database still cannot grant credits",
    file: DROP,
    from: "drop function if exists public.grant_credits_idempotent(",
    to: "drop function if exists public.no_such_grant_credits_idempotent(",
    expect: "exactly one overload remains",
  },
  {
    // The sweep stops revoking, so the upgrade leaves the very exposure it
    // was run to close: a signed-in browser can still call the function
    // that hands out credits.
    name: "the upgrade leaves the credit function executable by authenticated",
    file: GRANTS,
    from: "    execute format('revoke all on routine %s from authenticated', fn.sig);\n",
    to: "",
    expect: "can no longer execute",
  },
  {
    // The other half of the same sweep. anon needs no session at all.
    name: "the upgrade leaves the credit function executable by anon",
    file: GRANTS,
    from: "    execute format('revoke all on routine %s from anon', fn.sig);\n",
    to: "",
    expect: "can no longer execute",
  },
  {
    // The reconciliation counts every credit movement, so the goodwill
    // grant this database is carrying stays misfiled as a purchase — the
    // upgrade runs, reports success, and repairs nothing.
    name: "the reconciliation still cannot tell the goodwill grant from a pack",
    file: MARKER,
    from: "   where action_type = 'purchase' and amount > 0",
    to: "   where amount > 0",
    expect: "the backfill did not re-fire",
  },
  {
    // The default EXECUTE that `create function` hands to PUBLIC. anon and
    // authenticated inherit through it, so leaving it is the same exposure
    // as never revoking from them by name — and it is the one somebody
    // misses, because the two named revokes look like the whole job.
    name: "the upgrade revokes from the named roles but leaves the PUBLIC default",
    file: GRANTS,
    from: "    execute format('revoke all on routine %s from public', fn.sig);\n",
    to: "",
    expect: "can no longer execute",
  },
];

// THE MARKER MUTANT IS NOT HERE. Stopping the marker from being written is
// a real defect and purchased-credits-marker.mutation.mjs holds it, against
// the gate that asserts the marker directly. It is not a defect THIS gate
// can see: its idempotency check compares balances, and balances are
// already idempotent through `where pr.proven_purchased >
// uc.purchased_credits` — after the first run there is nothing left to
// raise, marker or no marker.

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

console.log("purchased-credits-upgrade mutations\n");
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
console.log("The upgrade cannot report success on a database it did not repair without this going red.");
