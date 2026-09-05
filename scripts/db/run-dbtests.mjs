// npm run test:db — the credit and schema gates that need a REAL
// Postgres, not a mock or a static read of the migration text.
//
// WHY THIS WRAPPER EXISTS. Every *.dbtest.mjs file, and the live half of
// db-migrations.test.mjs, only activate when DATABASE_URL or PGDATABASE
// is set. That used to mean `npm run test:db` was a shell loop that ran
// them with neither set, which means the credit-function tests SKIPPED
// on every run, everywhere, always — the file that proves reserve/settle/
// release/purchased-credits/idempotent-grants actually hold under a real
// database has never once executed as part of any gate.
//
// This is the fix: provision a throwaway PostgreSQL, build it exactly
// the way a fresh Supabase project would (bootstrap-supabase.sql, then
// every migration in order — the same path db-migrations.test.mjs's own
// header documents), point the DB env vars at it, and run the suite for
// real. Torn down afterwards whether the run passed or failed.
//
// THE ESCAPE HATCH. If DATABASE_URL or PGDATABASE is ALREADY set when
// this runs, nothing here is provisioned or migrated — the tests run
// against whatever that points at, unchanged, exactly as each file's own
// header documents. That is what lets someone point this at a real
// staging database instead of a throwaway one.
//
// SKIPS, EXIT 0, ONLY WHEN NO POSTGRES IS REACHABLE AT ALL — no local
// initdb and no DATABASE_URL. That is a real limitation of the
// environment this runs in, not a pass: failing the build over
// infrastructure the build script does not control would be worse than
// skipping. The skip is loud in the log ("SKIPPED: ..."), but nothing
// here distinguishes "skipped" from "passed" AT THE EXIT CODE — both are
// 0. An earlier version of credit-flow.dbtest.mjs's own header claimed
// "the suite gate reports it as skipped rather than passed", which no
// gate anywhere in this repository did. That claim was removed rather
// than made true, because making it true here would mean parsing this
// script's stdout from the calling gate, which is worse than just
// saying plainly: read the log.
//
// ONE GATE DOES DISTINGUISH THEM NOW, and the difference is worth
// naming so this paragraph is not read as a rule. scripts/tests/
// run-mutations.mjs reports green/skipped/red separately (via
// scripts/tests/lib/mutation-outcome.mjs) because it ALREADY parses each
// suite's stdout for MISSED and STALE, and because it prints a tally —
// "89 suites · 89 green" with user-isolation.mutation.mjs never having
// run is a false number, where one loud SKIPPED line above no tally at
// all is not.
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const explicit = process.env.DATABASE_URL || process.env.PGDATABASE;

let env = process.env;
let cleanup = () => {};

if (!explicit) {
  const pg = startEphemeralPostgres();
  if (!pg.available) {
    console.log(`SKIPPED: ${pg.reason}`);
    console.log("         Set DATABASE_URL to a real Postgres to run these, or install PostgreSQL locally.");
    process.exit(0);
  }
  const ARGS = psqlArgs(pg.conn);
  const runFile = (f) =>
    execFileSync("psql", [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", f], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  try {
    runFile(path.join(ROOT, "scripts/db/bootstrap-supabase.sql"));
    const migDir = path.join(ROOT, "supabase/migrations");
    const migFiles = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of migFiles) runFile(path.join(migDir, f));
    console.log(`provisioned a throwaway PostgreSQL and applied ${migFiles.length} migrations\n`);
  } catch (err) {
    pg.stop();
    console.error("Could not build the throwaway database:");
    console.error(String(err.stderr || err.stdout || err.message || err).slice(-3000));
    process.exit(1);
  }

  env = {
    ...process.env,
    DATABASE_URL:
      pg.conn.url ??
      `postgres://${pg.conn.user}@localhost:${pg.conn.port}/${pg.conn.database}?host=${encodeURIComponent(pg.conn.host)}`,
    PGHOST: pg.conn.host ?? "",
    PGPORT: pg.conn.port ? String(pg.conn.port) : "",
    PGUSER: pg.conn.user ?? "",
    PGDATABASE: pg.conn.database ?? "",
  };
  cleanup = () => pg.stop();
}

// An optional substring filter, so one suite can be run against a
// provisioned database without the other fourteen — `npm run test:db --
// user-metadata`. Without it nothing changes: every suite runs, fail-fast,
// as before. This exists because the loop below stops at the first failure,
// so a new suite at the end of the alphabet cannot be exercised at all
// while anything ahead of it is red.
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));

const dbtestDir = path.join(ROOT, "scripts/tests");
const files = [
  ...readdirSync(dbtestDir)
    .filter((f) => f.endsWith(".dbtest.mjs"))
    .sort()
    .map((f) => path.join("scripts/tests", f)),
  // db-migrations.test.mjs runs its STATIC half unconditionally as part
  // of test:unit already; running it again here, WITH a database, is
  // what turns on its live half — sections 6 through 8, including the
  // authoritative column check (7b) that a static regex parse cannot be
  // certain about. It is the one file in this repo that reliably gets a
  // real database to run against.
  "scripts/tests/db-migrations.test.mjs",
].filter((f) => only.length === 0 || only.some((needle) => f.includes(needle)));

if (files.length === 0) {
  console.error(`No dbtest matches ${JSON.stringify(only)}`);
  cleanup();
  process.exit(1);
}
if (only.length > 0) {
  console.log(`(filtered to ${files.length} of the suites by ${JSON.stringify(only)})`);
}

// Fail-fast, same convention as test:unit/test:integration/test:prod's
// own shell loops in package.json.
for (const f of files) {
  console.log(`--- ${f}`);
  try {
    execFileSync("node", [f], { cwd: ROOT, env, stdio: "inherit" });
  } catch {
    cleanup();
    process.exit(1);
  }
}
cleanup();
