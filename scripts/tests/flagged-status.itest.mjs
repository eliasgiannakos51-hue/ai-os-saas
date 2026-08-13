// The 'flagged' website status, against a REAL PostgreSQL.
//
// The static check in enum-schema-drift.test.mjs compares text in files.
// This one asks the database, because the whole defect was a wrong belief
// about what the database would accept.
//
// Run: node scripts/tests/flagged-status.itest.mjs
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

// The statuses the application can write, read from the type itself rather
// than copied — a copy would drift exactly the way the constraint did.
const TYPE_SOURCE = readFileSync(path.join(ROOT, "src/types/user-website.ts"), "utf8");
const STATUSES = [
  ...(TYPE_SOURCE.match(/export type UserWebsiteStatus\s*=\s*([^;]+);/)?.[1] ?? "").matchAll(/"([^"]+)"/g),
].map((m) => m[1]);

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

const pg = startEphemeralPostgres();
if (!pg.available) {
  console.log("flagged-status: SKIPPED");
  console.log(`  ${pg.reason}`);
  process.exit(0);
}

const ARGS = psqlArgs(pg.conn);
async function sql(statement) {
  const { stdout } = await execFileAsync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-tAc", statement], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}
function applyFile(file) {
  execFileSync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], { encoding: "utf8", stdio: "pipe" });
}
async function canWrite(status) {
  try {
    await sql(`insert into public.user_websites (name, status) values ('probe-${status}', '${status}')`);
    return true;
  } catch {
    return false;
  }
}

async function freshTable() {
  await sql(`drop table if exists public.user_websites cascade`);
  await sql(`create table public.user_websites (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null default gen_random_uuid(),
      name text,
      html_content text,
      status text not null default 'completed',
      created_at timestamptz not null default now())`);
}

try {
  console.log("flagged-status");
  console.log(`  ....  UserWebsiteStatus declares: ${STATUSES.join(", ")}`);
  check("the type was parsed, not guessed", STATUSES.length >= 5, true);
  check("it includes 'flagged'", STATUSES.includes("flagged"), true);

  // ------------------------------------------------------------------
  console.log("\n== 1. the bug, reproduced ==");
  // ------------------------------------------------------------------
  await freshTable();
  await sql(`alter table public.user_websites add constraint user_websites_status_check
             check (status in ('pending', 'processing', 'completed', 'failed'))`);

  const rejectedBefore = [];
  for (const status of STATUSES) if (!(await canWrite(status))) rejectedBefore.push(status);
  check("BEFORE — the narrow constraint rejects exactly 'flagged'", rejectedBefore, ["flagged"]);

  // And what the application was left holding: the row it was mid-way
  // through finishing never moves off 'processing'.
  await sql(`delete from public.user_websites`);
  await sql(`insert into public.user_websites (name, status, html_content)
             values ('Camping Chalkidiki', 'processing', '<html>real generated site</html>')`);
  try {
    await sql(`update public.user_websites set status = 'flagged' where name = 'Camping Chalkidiki'`);
  } catch {
    /* expected */
  }
  check(
    "BEFORE — the row is stranded on 'processing', with the user already charged",
    await sql(`select status from public.user_websites where name = 'Camping Chalkidiki'`),
    "processing"
  );

  // ------------------------------------------------------------------
  console.log("\n== 2. the standalone migration, as shipped ==");
  // ------------------------------------------------------------------
  // The exact file a project is told to run for background status tracking.
  // It used to install the narrow constraint — and because it drops before
  // re-adding, running it after a correct schema silently narrowed that too.
  await freshTable();
  applyFile(path.join(ROOT, "website_status_migration.sql"));

  const rejectedAfter = [];
  for (const status of STATUSES) if (!(await canWrite(status))) rejectedAfter.push(status);
  check(`AFTER — every one of the ${STATUSES.length} declared statuses is writable`, rejectedAfter, []);

  check(
    "...and it brings the columns 'flagged' needs",
    await sql(`select count(*)::text from information_schema.columns
               where table_schema='public' and table_name='user_websites'
                 and column_name in ('free_retry_used','description')`),
    "2"
  );

  // ------------------------------------------------------------------
  console.log("\n== 3. running it AFTER the good schema no longer narrows it ==");
  // ------------------------------------------------------------------
  // The order hazard, in the order that used to break.
  await freshTable();
  applyFile(path.join(ROOT, "supabase/migrations/20260813_flagged_status_constraint.sql"));
  applyFile(path.join(ROOT, "website_status_migration.sql"));
  check("'flagged' survives the standalone migration running last", await canWrite("flagged"), true);

  await freshTable();
  applyFile(path.join(ROOT, "website_status_migration.sql"));
  applyFile(path.join(ROOT, "supabase/migrations/20260813_flagged_status_constraint.sql"));
  check("'flagged' works in the other order too", await canWrite("flagged"), true);

  // ------------------------------------------------------------------
  console.log("\n== 4. the migration is idempotent ==");
  // ------------------------------------------------------------------
  applyFile(path.join(ROOT, "supabase/migrations/20260813_flagged_status_constraint.sql"));
  applyFile(path.join(ROOT, "supabase/migrations/20260813_flagged_status_constraint.sql"));
  check("applies three times cleanly", await canWrite("flagged"), true);
  check(
    "and leaves exactly one status constraint, not a pile of them",
    await sql(`select count(*)::text from pg_constraint
               where conrelid = 'public.user_websites'::regclass and contype = 'c'
                 and pg_get_constraintdef(oid) like '%status%'`),
    "1"
  );

  // ------------------------------------------------------------------
  console.log("\n== 5. rows the bug already stranded are rescued ==");
  // ------------------------------------------------------------------
  await freshTable();
  await sql(`alter table public.user_websites add constraint user_websites_status_check
             check (status in ('pending','processing','completed','failed'))`);
  // Three rows: one stranded by the bug, one genuinely in flight right now,
  // and one stranded but with nothing generated (a real failure, not this).
  await sql(`insert into public.user_websites (name, status, html_content, created_at) values
      ('stranded',  'processing', '<html>real site</html>', now() - interval '3 hours'),
      ('in-flight', 'processing', '<html>partial</html>',   now()),
      ('empty',     'processing', null,                     now() - interval '3 hours')`);

  applyFile(path.join(ROOT, "supabase/migrations/20260813_flagged_status_constraint.sql"));

  check(
    "the stranded row is moved to 'flagged', where the user can act on it",
    await sql(`select status from public.user_websites where name = 'stranded'`),
    "flagged"
  );
  check(
    "...with an explanation attached",
    (await sql(`select coalesce(error_message,'') <> '' from public.user_websites where name = 'stranded'`)) === "t",
    true
  );
  check(
    "a generation still in flight is NOT touched",
    await sql(`select status from public.user_websites where name = 'in-flight'`),
    "processing"
  );
  check(
    "a row with nothing generated is NOT claimed as flagged",
    await sql(`select status from public.user_websites where name = 'empty'`),
    "processing"
  );

  // ------------------------------------------------------------------
  console.log("\n== 6. the other constraint the scan turned up ==");
  // ------------------------------------------------------------------
  // user_agents.delivery_method was declared ('email') in the agents
  // migration and widened to ('email','slack') only by the integrations
  // migration running afterwards — so a project built from the agents
  // migration alone rejected every Slack agent the UI would let you create.
  await sql(`drop table if exists public.user_agents cascade`);
  await sql(`create table public.user_agents (
      id uuid primary key default gen_random_uuid(),
      delivery_method text not null default 'email'
        check (delivery_method in ('email', 'slack')))`);
  for (const method of ["email", "slack"]) {
    let ok = true;
    try {
      await sql(`insert into public.user_agents (delivery_method) values ('${method}')`);
    } catch {
      ok = false;
    }
    check(`agents accept delivery_method '${method}'`, ok, true);
  }
} finally {
  pg.stop();
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
