#!/usr/bin/env node
/*
 * SEVEN WAYS THIS APPLICATION COULD BE OPEN, AND WHETHER THE GATE SEES THEM.
 *
 * security-posture.test.mjs is the broadest gate in the tree: RLS on every
 * user-data table, admin-only tables never reached with a user client,
 * every route authenticated or justified by name, the documented cron
 * wiring actually wired, SECURITY.md describing gates that exist, and no
 * NEXT_PUBLIC_ variable holding something that authenticates.
 *
 * Breadth is what makes it worth mutating. A gate that covers six subjects
 * can be load-bearing on one and decorative on the other five, and the
 * only way to tell is to break each subject in turn and watch which line
 * goes red. Every mutant below is an exposure somebody could ship: a table
 * whose RLS is dropped, an admin table read with the caller's own client,
 * a cron route guarded inline again, a service-role key renamed into the
 * browser bundle. Seven mutants over the six subjects — RLS gets two,
 * because a statement can be commented out two different ways and the
 * gate saw neither until this suite was written.
 *
 * Run: node scripts/tests/security-posture.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/security-posture.test.mjs";
const BASELINE_SQL = "supabase/migrations/20260803000000_baseline_schema.sql";
const RESET_CRON = "src/app/api/cron/reset-credits/route.ts";
const SCHEDULED_CRON = "src/app/api/cron/scheduled-runs/route.ts";
const ADMIN_CLIENT = "src/lib/supabase/admin.ts";

const MUTANTS = [
  {
    // RLS DROPPED ON A USER-DATA TABLE. Without it every row of
    // chat_messages is readable by any signed-in account through
    // PostgREST — no exploit needed, just a different user id in the
    // filter.
    name: "row level security is dropped on a table full of user data",
    file: BASELINE_SQL,
    from: "alter table public.chat_messages enable row level security;",
    to: "-- alter table public.chat_messages enable row level security;",
    expect: "RLS",
  },
  {
    // THE SAME STATEMENT, COMMENTED OUT THE OTHER WAY. The line rule
    // above cannot see this one, and until 2026-09-12 neither could the
    // gate: block comments were left in on the theory that some migration
    // had an unterminated one. None has — see the note in the gate — so
    // both kinds are stripped now and both kinds are mutated here.
    name: "row level security is wrapped in a block comment instead",
    file: BASELINE_SQL,
    from: "alter table public.chat_conversations enable row level security;",
    to: "/* alter table public.chat_conversations enable row level security; */",
    expect: "RLS",
  },
  {
    // THE CRON GUARD, REPLACED BY NOTHING. Section 3 requires the shared
    // fail-closed guard by name precisely so an inline one cannot come
    // back — and an unguarded reset-credits rewrites every balance.
    name: "a cron route stops using the shared fail-closed guard",
    file: RESET_CRON,
    from: "checkCronAuth(request)",
    to: "({ ok: true })",
    expect: "fail-closed cron guard",
  },
  {
    // The same on the route that spends real money on every user's
    // behalf.
    name: "the scheduled-runs cron stops using the shared guard",
    file: SCHEDULED_CRON,
    from: "checkCronAuth(request)",
    to: "({ ok: true })",
    expect: "fail-closed cron guard",
  },
  {
    // THE RESERVATION SWEEP, UNWIRED. Documented as scheduled; if it
    // stops being invoked, expired holds are never released and the
    // credits behind them stay reserved for ever.
    name: "the expired-reservation sweep is imported but never called",
    file: SCHEDULED_CRON,
    from: "await releaseExpiredReservations()",
    to: "await Promise.resolve()",
    expect: "actually invoked",
  },
  {
    // A SERVICE-ROLE KEY WITH A NEXT_PUBLIC_ PREFIX. Next.js substitutes
    // it into the bundle every visitor downloads — no runtime error, no
    // warning, just the key sitting in a .js file on the CDN.
    //
    // It has to be mutated in the CODE THAT READS IT, not in
    // .env.local.example: section 6 asks envVarsReadByCode(), which scans
    // `process.env.X` across src/, and a renamed example file is a
    // document nothing consults. The gate was right to stay green on the
    // first version of this mutant.
    name: "a service-role key acquires a NEXT_PUBLIC_ prefix",
    file: ADMIN_CLIENT,
    from: "process.env.SUPABASE_SERVICE_ROLE_KEY!",
    to: "process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!",
    expect: "NEXT_PUBLIC",
  },
  {
    // THE SWEEP'S FAILURE TAKING THE WHOLE CRON DOWN WITH IT. By the time
    // housekeeping runs, the scheduled runs and automations above have
    // already done real, billable work; an exception escaping here throws
    // that away and answers 500 to the scheduler, which retries it.
    //
    // The mutant removes the try/catch rather than renaming the log stage
    // inside it: `sweep_reservations` -> `sweep_reservations_renamed`
    // leaves the original as a PREFIX of the new name, and the gate
    // searches by substring, so it stayed green — correctly.
    name: "a failing reservation sweep can now fail the entire cron",
    file: SCHEDULED_CRON,
    from: `    try {
      expiredReservationsSwept = await releaseExpiredReservations();
    } catch (err) {
      // Never let housekeeping fail the cron: the scheduled runs and
      // automations above have already done real, billable work by now.
      logApiError("/api/cron/scheduled-runs", err, { stage: "sweep_reservations" });
    }`,
    to: "    expiredReservationsSwept = await releaseExpiredReservations();",
    expect: "cannot fail the cron",
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

console.log("security-posture mutations\n");
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
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
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
console.log("None of this application's six security postures can lapse without this going red.");
