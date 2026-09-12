#!/usr/bin/env node
/*
 * WHO MAY CALL THE FUNCTION THAT HANDS OUT CREDITS.
 *
 * `create function` grants EXECUTE to PUBLIC by default. Nothing warns
 * about it, nothing in a green build mentions it, and until something
 * revokes it every signed-in browser can call `grant_credits_idempotent`
 * over PostgREST and give itself money. 20260818000000_function_grants.sql
 * is the sweep that closes it for every routine in `public`, and
 * credit-function-privileges.itest.mjs is what proves the sweep ran.
 *
 * The gate asks a real Postgres, not the SQL text: it applies the
 * migrations to an ephemeral server and reads has_function_privilege. So
 * every mutant here is a privilege that a real database really would hold.
 *
 * Run: node scripts/tests/credit-function-privileges.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/credit-function-privileges.itest.mjs";
const GRANTS = "supabase/migrations/20260818000000_function_grants.sql";
const DROP = "supabase/migrations/20260817000000_drop_stale_grant_overload.sql";

const MUTANTS = [
  {
    // THE DEFAULT, LEFT IN PLACE. Drop the revoke from PUBLIC and every
    // routine in the schema keeps the EXECUTE that `create function`
    // handed out — which is exactly the state this migration exists to
    // end. anon and authenticated inherit it through PUBLIC.
    name: "the revoke from PUBLIC is dropped, so every routine keeps its default EXECUTE",
    file: GRANTS,
    from: "    execute format('revoke all on routine %s from public', fn.sig);\n",
    to: "",
    expect: "cannot execute",
  },
  {
    // A signed-in browser is `authenticated`. Leaving that grant is the
    // difference between "a stranger cannot" and "any customer can".
    name: "authenticated keeps EXECUTE on every routine",
    file: GRANTS,
    from: "    execute format('revoke all on routine %s from authenticated', fn.sig);\n",
    to: "",
    expect: "authenticated cannot execute",
  },
  {
    // anon is the unauthenticated PostgREST role — reachable with nothing
    // but the public anon key that ships in the browser bundle.
    name: "anon keeps EXECUTE on every routine",
    file: GRANTS,
    from: "    execute format('revoke all on routine %s from anon', fn.sig);\n",
    to: "",
    expect: "anon cannot execute",
  },
  {
    // The other direction, and just as broken: the sweep revokes from
    // everyone and forgets to give the app back what it needs, so every
    // credit grant fails in production instead of in a test.
    name: "service_role loses its grant, so the app itself can no longer settle credits",
    file: GRANTS,
    from: "    execute format('grant execute on routine %s to service_role', fn.sig);\n",
    to: "",
    expect: "the only thing service_role has left",
  },
  {
    // The loop narrowed to plain functions. Procedures and aggregates
    // then keep the default PUBLIC grant — the exact blind spot the gate's
    // last section was written for, because "function" is what everybody
    // says when they mean "routine".
    name: "the sweep covers functions only, leaving procedures and aggregates public",
    file: GRANTS,
    from: "      and p.prokind in ('f', 'p', 'a', 'w')",
    to: "      and p.prokind = 'f'",
    expect: "bare",
  },
  {
    // The stale two-argument overload left behind. Every call that used
    // to resolve now matches both signatures, PostgREST answers "function
    // is not unique", and no credit grant lands at all.
    name: "the stale overload is not dropped, so every credit grant is ambiguous",
    file: DROP,
    from: "drop function if exists public.grant_credits_idempotent(",
    to: "drop function if exists public.never_existed_grant_credits_idempotent(",
    expect: "overload count is 1",
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

console.log("credit-function-privileges mutations\n");
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
console.log("No credit function can be left callable by a browser without this going red.");
