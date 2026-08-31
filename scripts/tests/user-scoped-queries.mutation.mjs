#!/usr/bin/env node
/*
 * CAN user-scoped-queries.test.mjs SEE AN UNSCOPED READ COME BACK?
 *
 * The shape it guards is invisible in review: a function takes a userId,
 * queries a user table, and the parameter goes nowhere but an error log.
 * Nothing about it looks wrong, and it stays correct for exactly as long
 * as every caller happens to pass a session client.
 *
 *   1. the scan that started this loses its filter again
 *   2. ...and so does the deep dive's
 *   3. a write stops stamping the owner column
 *   4. GATE: the allowlist grows an entry with no reasoning
 *   5. GATE: an allowlist entry outlives the function it excuses
 *   6. GATE: the function scanner matches nothing
 *
 * Run: node scripts/tests/user-scoped-queries.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/user-scoped-queries.test.mjs";
const MENTOR = "src/lib/chat/mentor-context.ts";
const DEEP = "src/lib/ai/deep-dive-load.ts";
const NOTIFY = "src/lib/notify/tracking.ts";
const CHAT_ROUTE = "src/app/api/chat/route.ts";
const TARGETS = [GATE, MENTOR, DEEP, NOTIFY, CHAT_ROUTE];

const MUTANTS = [
  {
    // The original defect, put back exactly.
    name: "the mentor scan trusts RLS again",
    file: MENTOR,
    from: '          .eq("user_id", userId)\n',
    to: "",
    expect: "mentor-context.ts: scopes its scan to the user",
  },
  {
    name: "the deep dive trusts RLS",
    file: DEEP,
    from: '      .eq("user_id", userId)\n',
    to: "",
    expect: "deep-dive-load.ts: scopes its scan to the user",
  },
  {
    // A write that stops stamping the owner is the same fault from the
    // other side: the row exists and belongs to nobody.
    name: "a write stops stamping the owner column",
    file: NOTIFY,
    from: "      user_id: params.userId,",
    to: "      source: null,",
    expect: "uses it as a filter or an owner column",
  },
  {
    // "It is fine" is not a reason. An allowlist of assurances is a list
    // of things nobody checked.
    name: "GATE: an allowlist entry gives an assurance instead of a reason",
    file: GATE,
    from: '    "Keyed by the reportId this run already loaded and authorised.",',
    to: '    "This one is fine.",',
    expect: "gives a reason, not an assurance",
  },
  {
    name: "GATE: an allowlist entry outlives its function",
    file: GATE,
    from: '"src/lib/jobs/run-job.ts::reapJob"',
    to: '"src/lib/jobs/run-job.ts::reapJobThatIsGone"',
    expect: "no allowlist entry names a function that is gone",
  },
  // ---- the OTHER shape: scoped by the CALLER'S client ----
  {
    // THE BUG THIS SECTION EXISTS FOR, re-introduced. lib/user-context.ts
    // once had exactly this done to it: a caller swapped the user's
    // client for the service-role one and every row of every user came
    // into scope, with nothing anywhere going red.
    name: "a caller hands a caller-scoped function the SERVICE-ROLE client",
    file: CHAT_ROUTE,
    from: "loadCodingContextForChat(supabase, message)",
    to: "loadCodingContextForChat(admin, message)",
    expect: "no unargued call site hands one of them a service-role client",
  },
  {
    name: "GATE: an argued admin caller loses its argument",
    file: GATE,
    from: '    "updateMissionPlanSteps@src/app/api/cron/scheduled-runs/route.ts":',
    // POINTED AT A DIFFERENT REAL ROUTE, not an invented filename.
    // scripts/tests/gate-import-paths.test.mjs requires every repository
    // path named in a gate to exist, and it was right to: a mutation
    // whose `to` invents a path leaves that path in the tree for the
    // length of the run, and a gate naming a file that is not there is
    // the stale-anchor failure one layer up. Re-aiming the entry at
    // agent-runs un-argues the scheduled-runs call site just as well.
    to: '    "updateMissionPlanSteps@src/app/api/cron/agent-runs/route.ts":',
    expect: "no unargued call site hands one of them a service-role client",
  },
  {
    name: "GATE: an argued entry outlives the function it argues for",
    file: GATE,
    from: '    "trySubmitAsBatch@src/app/api/cron/agent-runs/route.ts":',
    to: '    "trySubmitAsBatchGone@src/app/api/cron/agent-runs/route.ts":',
    expect: "no argued entry names a function that no longer has this shape",
  },
  {
    name: "GATE: an argued entry gives an assurance instead of a reason",
    file: GATE,
    from: '      "Sweeps agent_runs in status \'queued\' across all accounts on purpose',
    to: '      "safe. Sweeps agent_runs in status \'queued\' across all accounts on purpose',
    expect: "every argued entry gives a reason, not an assurance",
  },
  {
    // The floor on the second scan. "None of them is called with an
    // admin client" is trivially true of a scan that found no functions.
    name: "GATE: the caller-scoped scanner matches nothing",
    file: GATE,
    from: '      if (!/supabase|client/i.test(params)) continue;',
    to: '      if (!/supabaseNope/i.test(params)) continue;',
    expect: "functions scoped by the caller's client",
  },
  {
    // And the other floor: the table set the whole section is measured
    // against.
    name: "GATE: no table is recognised as user-owned",
    file: GATE,
    from: '    if (/\\buser_id\\b/.test(m[2])) owned.add(m[1]);',
    to: '    if (/\\buser_id_nope\\b/.test(m[2])) owned.add(m[1]);',
    expect: "user-owned tables found in the schema",
  },
  {
    // The floor. A scanner that matches nothing reports a clean codebase.
    name: "GATE: the function scanner matches nothing",
    file: GATE,
    from: "const TAKES_USER_ID = /\\b(userId|ownerId)\\s*:\\s*string/;",
    to: "const TAKES_USER_ID = /\\b(userIdNope)\\s*:\\s*string/;",
    expect: "functions taking a userId and querying Supabase",
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

console.log("user-scoped-queries mutations\n");
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
    const n = original.split(m.from).length - 1;
    if (n !== 1) {
      missed.push({ ...m, why: `the anchor appears ${n} times in ${m.file}` });
      console.log(`  AMBIG   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, original.replace(m.from, m.to));
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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
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
console.log("Every clause of user-scoped-queries.test.mjs is load-bearing.");
