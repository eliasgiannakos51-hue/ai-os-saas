#!/usr/bin/env node
/*
 * WOULD THIS GATE HAVE NOTICED THE DAY api/search MOVED ON?
 *
 * The failure it was written for is not a missing entry — it is a list
 * that stayed complete-looking while the code walked away from it.
 * `search_all` was canaried, `search_all_localized` was called, and every
 * instrument in the repository was green for eighteen days.
 *
 * So the mutants are the four ways this list can rot: an RPC with nothing
 * watching it, an excuse that outlives the call it excused, a canary that
 * outlives the caller it watched, and an exception for a caller that came
 * back. Plus the one that makes all of them vacuous — an extraction that
 * finds nothing and so has nothing to complain about.
 *
 * Run: node scripts/tests/rpc-canaries.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/rpc-canaries.test.mjs";
const CANARIES = "src/lib/health/schema-canaries.ts";

const MUTANTS = [
  {
    // THE DEFECT ITSELF. Take the canary off the function every ⌘K query
    // depends on and leave the forwarder's canary in place — the tree
    // exactly as it stood when the sweep found it.
    name: "search_all_localized loses its canary while search_all keeps one — the 2026-09-11 state",
    file: CANARIES,
    from: '    fn: "search_all_localized",',
    to: '    fn: "search_all_localized_renamed_by_mutation",',
    expect: "search_all_localized",
  },
  {
    // A money path going unwatched is the case the exemption list must
    // never quietly absorb.
    name: "the credit deduction loses its canary and nothing says so",
    file: CANARIES,
    from: '    fn: "deduct_credits_atomic",',
    to: '    fn: "deduct_credits_atomic_renamed_by_mutation",',
    expect: "deduct_credits_atomic",
  },
  {
    // The excuse used as a shortcut: anything can be made green by
    // declaring it baseline.
    name: "a post-baseline RPC is excused as baseline",
    file: GATE,
    from: "const RPC_NEEDS_NO_CANARY = {",
    to: 'const RPC_NEEDS_NO_CANARY = {\n  search_all_localized: BASELINE,',
    expect: "is not ALSO a canary",
  },
  {
    // Both ways. An excuse for a call that no longer exists is a line
    // nobody will ever re-read, and it is how the list stops describing
    // the code.
    name: "an exemption outlives the call it excused",
    file: GATE,
    from: "const RPC_NEEDS_NO_CANARY = {",
    to:
      "const RPC_NEEDS_NO_CANARY = {\n" +
      "  a_function_src_stopped_calling_long_ago: BASELINE,",
    expect: "is still called by src",
  },
  {
    // The original failure, generalised: a canary watching something
    // nothing calls looks exactly like coverage.
    name: "a canary is kept for a function src never calls, with no reason given",
    file: CANARIES,
    from: '    fn: "subscription_cohort",',
    to: '    fn: "subscription_cohort_nothing_calls_this",',
    expect: "is called by src, or says why it is watched anyway",
  },
  {
    // ...and the declared exception going stale in the other direction.
    name: "the exception for search_all stays after src starts calling it again",
    file: GATE,
    from: 'const CANARY_WITHOUT_CALLER = {\n  search_all:',
    to: 'const CANARY_WITHOUT_CALLER = {\n  consume_rate_limit:\n    "a mutation entry, long enough to clear the reason-length check, for a function src really does call",\n  search_all:',
    expect: "exception is still needed",
  },
  {
    // THE ONE THAT MAKES EVERY CHECK ABOVE VACUOUS. An extraction that
    // matches nothing reports nothing missing.
    name: "the call-site sweep stops finding any .rpc() at all",
    file: GATE,
    from: '/\\.rpc\\(\\s*"([a-z0-9_]+)"/g',
    to: '/\\.rpcTHIS_MATCHES_NOTHING\\(\\s*"([a-z0-9_]+)"/g',
    expect: "src/ calls database functions by name",
  },
];

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

console.log("rpc-canaries mutations\n");
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
console.log("The canary list cannot fall behind the calls again without this going red.");
